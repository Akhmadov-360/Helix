import { Injectable } from "@nestjs/common";
import type {
  CompanyDetailResponse,
  CompanyListResponse,
  CompanyQuery,
  CompanyResponse,
  CreateCompanyInput,
  UpdateCompanyInput,
} from "@helix/api-schemas";
import { ResourceNotFoundError } from "../../core/errors/domain-error";
import { toCompanyDetailResponse, toCompanyResponse } from "./company.mapper";
import { CompaniesRepository } from "./companies.repository";
import { normalizeDomain } from "./normalize";

@Injectable()
export class CompaniesService {
  constructor(private readonly companies: CompaniesRepository) {}

  async create(orgId: string, input: CreateCompanyInput): Promise<CompanyResponse> {
    const row = await this.companies.create({
      orgId,
      name: input.name,
      domain: input.domain,
      domainNormalized: normalizeDomain(input.domain),
      industry: input.industry,
    });
    return toCompanyResponse(row);
  }

  async list(orgId: string, query: CompanyQuery): Promise<CompanyListResponse> {
    const rows = await this.companies.listByOrg(orgId, {
      q: query.q,
      cursorId: query.cursorId,
      limit: query.limit,
    });
    const hasMore = rows.length > query.limit;
    return { companies: rows.slice(0, query.limit).map(toCompanyResponse), hasMore };
  }

  async getById(orgId: string, id: string): Promise<CompanyDetailResponse> {
    const company = await this.companies.findDetailInOrg(id, orgId);
    if (!company) throw new ResourceNotFoundError("Company not found");
    return toCompanyDetailResponse(company);
  }

  // domainNormalized пересчитывается ТОЛЬКО когда domain реально пришёл в патче (§4.3):
  // ключ отсутствует → не трогаем ни domain, ни его канон; domain=null → оба в null.
  async update(orgId: string, id: string, input: UpdateCompanyInput): Promise<CompanyResponse> {
    if (!(await this.companies.findByIdInOrg(id, orgId))) {
      throw new ResourceNotFoundError("Company not found");
    }
    const row = await this.companies.update(id, {
      name: input.name,
      ...(input.domain !== undefined
        ? { domain: input.domain, domainNormalized: normalizeDomain(input.domain) }
        : {}),
      industry: input.industry,
    });
    return toCompanyResponse(row);
  }

  // Каскада нет: контакты компании получают companyId=NULL (FK SET NULL, §6, manual-point #5).
  async remove(orgId: string, id: string): Promise<void> {
    if (!(await this.companies.findByIdInOrg(id, orgId))) {
      throw new ResourceNotFoundError("Company not found");
    }
    await this.companies.delete(id);
  }
}
