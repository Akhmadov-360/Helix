import { Injectable } from "@nestjs/common";
import type { LinkContactInput, ProjectContactResponse } from "@helix/api-schemas";
import {
  ContactAlreadyLinkedError,
  LinkMergedContactError,
  ResourceNotFoundError,
} from "../../core/errors/domain-error";
import { ContactsRepository } from "../crm/contacts.repository";
import { ProjectsRepository } from "../projects/projects.repository";
import { ProjectContactRepository, type ProjectContactRow } from "./project-contact.repository";

@Injectable()
export class ProjectContactsService {
  constructor(
    private readonly projects: ProjectsRepository,
    private readonly contacts: ContactsRepository,
    private readonly links: ProjectContactRepository,
  ) {}

  async list(orgId: string, projectId: string): Promise<ProjectContactResponse[]> {
    await this.assertProjectInOrg(orgId, projectId);
    const rows = await this.links.listByProject(projectId);
    return rows.map(toProjectContactResponse);
  }

  // §5 инварианты по порядку, каждый — свой код: проект 404, контакт 404, смёржен 409, дубль 409.
  async link(
    orgId: string,
    projectId: string,
    input: LinkContactInput,
  ): Promise<ProjectContactResponse> {
    await this.assertProjectInOrg(orgId, projectId);

    const contact = await this.contacts.findByIdInOrg(input.contactId, orgId);
    if (!contact) throw new ResourceNotFoundError("Contact not found");
    // §5.1: смёрженный контакт — «мёртвый» id, привязка запрещена (стык с merge, contacts.md §7.5).
    if (contact.mergedIntoId !== null) {
      throw new LinkMergedContactError({ mergedIntoId: contact.mergedIntoId });
    }
    // §5.2: повторная привязка — конфликт; роли меняются через PATCH, не повторным POST.
    if (await this.links.findLink(projectId, input.contactId)) {
      throw new ContactAlreadyLinkedError();
    }

    const row = await this.links.create({
      projectId,
      contactId: input.contactId,
      orgId,
      roles: dedupeRoles(input.roles),
    });
    return toProjectContactResponse(row);
  }

  // PATCH — полная замена набора ролей (§5.2); roles=[] допустим («роль неизвестна»).
  async updateRoles(
    orgId: string,
    projectId: string,
    contactId: string,
    roles: LinkContactInput["roles"],
  ): Promise<ProjectContactResponse> {
    await this.assertProjectInOrg(orgId, projectId);
    if (!(await this.links.findLink(projectId, contactId))) {
      throw new ResourceNotFoundError("Contact is not linked to this project");
    }
    const row = await this.links.updateRoles(projectId, contactId, dedupeRoles(roles));
    return toProjectContactResponse(row);
  }

  // Отвязка ≠ удаление контакта: строка связи удалена, контакт жив (справочник, §9).
  async unlink(orgId: string, projectId: string, contactId: string): Promise<void> {
    await this.assertProjectInOrg(orgId, projectId);
    if (!(await this.links.findLink(projectId, contactId))) {
      throw new ResourceNotFoundError("Contact is not linked to this project");
    }
    await this.links.delete(projectId, contactId);
  }

  // Tenant-скоуп: чужой/несуществующий проект → 404 (§2, IDOR).
  private async assertProjectInOrg(orgId: string, projectId: string): Promise<void> {
    if (!(await this.projects.findByIdInOrg(projectId, orgId))) {
      throw new ResourceNotFoundError("Project not found");
    }
  }
}

// Множество ролей, не список: дубли в наборе схлопываются (§3).
function dedupeRoles(roles: LinkContactInput["roles"]): LinkContactInput["roles"] {
  return Array.from(new Set(roles));
}

function toProjectContactResponse(row: ProjectContactRow): ProjectContactResponse {
  return {
    contactId: row.contactId,
    name: row.contact.name,
    email: row.contact.email,
    phone: row.contact.phone,
    roles: row.roles,
    ...(row.contact.company ? { companyName: row.contact.company.name } : {}),
  };
}
