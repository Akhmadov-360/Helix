import { Injectable } from "@nestjs/common";
import type {
  ContactListResponse,
  ContactQuery,
  ContactResponse,
  CreateContactInput,
  CreateContactResponse,
  DedupHint,
  UpdateContactInput,
} from "@helix/api-schemas";
import {
  ContactMergedError,
  ContactNotActiveError,
  ResourceNotFoundError,
  SelfMergeError,
} from "../../core/errors/domain-error";
import { PrismaService } from "../../core/prisma/prisma.service";
import { AuditRecorder } from "./audit.recorder";
import { toContactResponse, type ContactInternalRow } from "./contact.mapper";
import { ContactsRepository, type UpdateContactData } from "./contacts.repository";
import { normalizeEmail } from "./normalize";

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contacts: ContactsRepository,
    private readonly audit: AuditRecorder,
  ) {}

  // POST → контакт + dedupHint (§4.2). Кандидаты ищутся ДО создания (существующие дубли),
  // поэтому новый контакт не попадает в собственный хинт. Не блокируем — решение за оператором.
  async create(orgId: string, input: CreateContactInput): Promise<CreateContactResponse> {
    const emailNormalized = normalizeEmail(input.email);
    const dedupHint = await this.dedupByNormalized(orgId, emailNormalized);
    const row = await this.contacts.create({
      orgId,
      name: input.name,
      email: input.email,
      emailNormalized,
      phone: input.phone,
      companyId: input.companyId,
    });
    return { contact: toContactResponse(row), dedupHint };
  }

  // Явная проверка перед сохранением (§4.2): кандидаты по email, ничего не создаёт.
  async dedupCheck(orgId: string, email: string): Promise<DedupHint> {
    return this.dedupByNormalized(orgId, normalizeEmail(email));
  }

  // email пуст → канон null → в дедупе не участвует (§4.2), пустой хинт без запроса.
  private async dedupByNormalized(orgId: string, emailNormalized: string | null): Promise<DedupHint> {
    if (emailNormalized === null) return { candidates: [] };
    const rows = await this.contacts.findDedupCandidates(orgId, emailNormalized);
    return {
      candidates: rows.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        ...(c.company ? { companyName: c.company.name } : {}),
      })),
    };
  }

  async list(orgId: string, query: ContactQuery): Promise<ContactListResponse> {
    const rows = await this.contacts.listByOrg(orgId, {
      q: query.q,
      companyId: query.companyId,
      cursorId: query.cursorId,
      limit: query.limit,
    });
    const hasMore = rows.length > query.limit;
    return {
      contacts: rows.slice(0, query.limit).map((row) => toContactResponse(row, row.projects.map((p) => p.project))),
      hasMore,
    };
  }

  async getById(orgId: string, id: string): Promise<ContactResponse> {
    const contact = await this.contacts.findByIdInOrg(id, orgId);
    if (!contact) throw new ResourceNotFoundError("Contact not found");
    this.ensureNotMerged(contact); // §7.5: GET смёрженного → 410, не молчаливый редирект
    return toContactResponse(contact);
  }

  // Единый 410-инвариант (§7.5): смёрженный контакт неизменяем/недоступен по своему id.
  // Одна проверка на входе любого прямого-по-id пути (GET/PATCH/DELETE), не набор частных правил.
  private ensureNotMerged(row: ContactInternalRow): void {
    if (row.mergedIntoId !== null) throw new ContactMergedError({ mergedIntoId: row.mergedIntoId });
  }

  // emailNormalized пересчитывается в ТОМ ЖЕ update, что и email (§4.3) — не два пути записи.
  // Ключ email отсутствует → не трогаем ни email, ни канон; email=null → оба в null.
  async update(orgId: string, id: string, input: UpdateContactInput): Promise<ContactResponse> {
    const existing = await this.contacts.findByIdInOrg(id, orgId);
    if (!existing) throw new ResourceNotFoundError("Contact not found");
    this.ensureNotMerged(existing); // §7.5: PATCH смёрженного → 410 (правь target)
    const row = await this.contacts.update(id, {
      name: input.name,
      ...(input.email !== undefined
        ? { email: input.email, emailNormalized: normalizeEmail(input.email) }
        : {}),
      phone: input.phone,
      companyId: input.companyId,
    });
    return toContactResponse(row);
  }

  async remove(orgId: string, id: string): Promise<void> {
    const existing = await this.contacts.findByIdInOrg(id, orgId);
    if (!existing) throw new ResourceNotFoundError("Contact not found");
    this.ensureNotMerged(existing); // §7.5: DELETE смёрженного → 410 (погашенный неизменяем)
    await this.contacts.delete(id);
  }

  /**
   * Слить source в target (§7): target wins + заполнение пустот, редирект связей, soft-погашение
   * source, запись AuditLog — всё в ОДНОЙ транзакции (§7.1). Гонки разведены FOR UPDATE ... ORDER
   * BY id (§7.4). Merge деструктивен → политика delete Contact (O/A) на контроллере.
   */
  async merge(
    orgId: string,
    actorId: string,
    targetId: string,
    sourceId: string,
  ): Promise<ContactResponse> {
    if (targetId === sourceId) throw new SelfMergeError();

    const finalTarget = await this.prisma.client.$transaction(async (tx) => {
      const locked = await this.contacts.lockPairForMerge([targetId, sourceId], orgId, tx);
      const target = locked.find((c) => c.id === targetId);
      const source = locked.find((c) => c.id === sourceId);
      // Хотя бы одного нет в орге вызывающего → 404 (не 403, §2 IDOR).
      if (!target || !source) throw new ResourceNotFoundError("Contact not found");
      // §7.1/§7.4: и source, И target активны — иначе цепочка → 409.
      if (target.mergedIntoId !== null || source.mergedIntoId !== null) {
        throw new ContactNotActiveError();
      }

      // §7.2 target wins, source заполняет ТОЛЬКО пустоты target (??=). name — всегда target.
      const data: UpdateContactData = {};
      const fieldsFilledFromSource: string[] = [];
      if (target.email === null && source.email !== null) {
        data.email = source.email;
        data.emailNormalized = normalizeEmail(source.email); // §4.3: канон вместе с email
        fieldsFilledFromSource.push("email");
      }
      if (target.phone === null && source.phone !== null) {
        data.phone = source.phone;
        fieldsFilledFromSource.push("phone");
      }
      if (target.companyId === null && source.companyId !== null) {
        data.companyId = source.companyId;
        fieldsFilledFromSource.push("companyId");
      }
      if (fieldsFilledFromSource.length > 0) await this.contacts.update(targetId, data, tx);

      // §7.3 редирект связей source→target (union roles на дублях), затем погашение source.
      const movedProjectContactIds = await this.contacts.redirectProjectContacts(sourceId, targetId, tx);
      await this.contacts.tombstone(sourceId, targetId, tx);

      // P4: запись аудита атомарна с мутацией (§7.3). Снапшот — след для ручного un-merge (§7.7).
      await this.audit.record(tx, {
        orgId,
        actorId,
        event: {
          action: "contact.merged",
          schemaVersion: 1,
          payload: {
            sourceId,
            sourceName: source.name,
            sourceEmail: source.email,
            targetId,
            movedProjectContactIds,
            fieldsFilledFromSource,
          },
        },
      });

      const updated = await this.contacts.findByIdInOrg(targetId, orgId, tx);
      if (!updated) throw new Error("merge target vanished within its own transaction");
      return updated;
    });

    return toContactResponse(finalTarget);
  }
}
