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
import { ResourceNotFoundError } from "../../core/errors/domain-error";
import { toContactResponse } from "./contact.mapper";
import { ContactsRepository } from "./contacts.repository";
import { normalizeEmail } from "./normalize";

@Injectable()
export class ContactsService {
  constructor(private readonly contacts: ContactsRepository) {}

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
    return { contacts: rows.slice(0, query.limit).map(toContactResponse), hasMore };
  }

  async getById(orgId: string, id: string): Promise<ContactResponse> {
    const contact = await this.contacts.findByIdInOrg(id, orgId);
    if (!contact) throw new ResourceNotFoundError("Contact not found");
    return toContactResponse(contact);
  }

  // emailNormalized пересчитывается в ТОМ ЖЕ update, что и email (§4.3) — не два пути записи.
  // Ключ email отсутствует → не трогаем ни email, ни канон; email=null → оба в null.
  async update(orgId: string, id: string, input: UpdateContactInput): Promise<ContactResponse> {
    if (!(await this.contacts.findByIdInOrg(id, orgId))) {
      throw new ResourceNotFoundError("Contact not found");
    }
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
    if (!(await this.contacts.findByIdInOrg(id, orgId))) {
      throw new ResourceNotFoundError("Contact not found");
    }
    await this.contacts.delete(id);
  }
}
