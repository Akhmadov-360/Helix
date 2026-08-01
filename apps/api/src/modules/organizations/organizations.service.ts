import { Injectable } from "@nestjs/common";
import type { OrgMemberListResponse } from "@helix/api-schemas";
import { OrganizationsRepository } from "./organizations.repository";

@Injectable()
export class OrganizationsService {
  constructor(private readonly orgs: OrganizationsRepository) {}

  listMembers(orgId: string): Promise<OrgMemberListResponse> {
    return this.orgs.listMembers(orgId);
  }
}
