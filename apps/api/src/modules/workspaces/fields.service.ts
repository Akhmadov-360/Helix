import { Injectable } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import {
  isCompatibleFieldTypeChange,
  type CreateFieldDefinitionInput,
  type FieldDefinitionResponse,
  type UpdateFieldDefinitionInput,
} from "@helix/api-schemas";
import { IncompatibleFieldTypeChangeError, ResourceNotFoundError } from "../../core/errors/domain-error";
import { ensureUniqueFieldKey, generateFieldKeyBase } from "../fields/field-key";
import { toFieldDefinitionResponse } from "../fields/field.mapper";
import { FieldsRepository } from "../fields/fields.repository";
import { WorkspacesRepository } from "./workspaces.repository";

@Injectable()
export class FieldsService {
  constructor(
    private readonly workspaces: WorkspacesRepository,
    private readonly fields: FieldsRepository,
  ) {}

  // Новое поле всегда в конец списка (§3: нет order-колонки — порядок создания).
  async add(orgId: string, workspaceId: string, input: CreateFieldDefinitionInput): Promise<FieldDefinitionResponse> {
    const ws = await this.workspaces.findByIdInOrg(workspaceId, orgId);
    if (!ws) throw new ResourceNotFoundError("Workspace not found");

    const existing = await this.fields.listByWorkspaceOrdered(workspaceId);
    const taken = new Set(existing.map((f) => f.key));
    const key = ensureUniqueFieldKey(generateFieldKeyBase(input.label), taken);

    const created = await this.fields.create({
      workspaceId,
      key,
      label: input.label as Prisma.InputJsonValue,
      type: input.type,
      options: input.options as Prisma.InputJsonValue | undefined,
      required: input.required,
    });
    return toFieldDefinitionResponse(created);
  }

  async list(orgId: string, workspaceId: string): Promise<FieldDefinitionResponse[]> {
    const ws = await this.workspaces.findByIdInOrg(workspaceId, orgId);
    if (!ws) throw new ResourceNotFoundError("Workspace not found");
    const rows = await this.fields.listByWorkspaceOrdered(workspaceId);
    return rows.map(toFieldDefinitionResponse);
  }

  // key иммутабелен — отсутствует в UpdateFieldDefinitionSchema, дойти сюда не может.
  // type — только через allow-list (§5), иначе 400 INCOMPATIBLE_FIELD_TYPE_CHANGE.
  async update(orgId: string, id: string, input: UpdateFieldDefinitionInput): Promise<FieldDefinitionResponse> {
    const existing = await this.fields.findByIdInOrg(id, orgId);
    if (!existing) throw new ResourceNotFoundError("Field not found");

    if (input.type && input.type !== existing.type && !isCompatibleFieldTypeChange(existing.type, input.type)) {
      throw new IncompatibleFieldTypeChangeError();
    }

    const updated = await this.fields.update(id, {
      label: input.label as Prisma.InputJsonValue | undefined,
      options: input.options as Prisma.InputJsonValue | undefined,
      required: input.required,
      type: input.type,
    });
    return toFieldDefinitionResponse(updated);
  }

  // §6: не каскадит Project.fields[key] у существующих лидов — сирота в JSON, безвредна.
  async remove(orgId: string, id: string): Promise<void> {
    const existing = await this.fields.findByIdInOrg(id, orgId);
    if (!existing) throw new ResourceNotFoundError("Field not found");
    await this.fields.delete(id);
  }
}
