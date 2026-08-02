import { Injectable } from "@nestjs/common";
import type {
  CompanyDedupHint,
  CompanyDetailResponse,
  CompanyListResponse,
  CompanyQuery,
  CompanyResponse,
  CreateCompanyInput,
  CreateCompanyResponse,
  UpdateCompanyInput,
} from "@helix/api-schemas";
import { ResourceNotFoundError } from "../../core/errors/domain-error";
import { toCompanyDetailResponse, toCompanyResponse } from "./company.mapper";
import { CompaniesRepository } from "./companies.repository";
import { normalizeDomain } from "./normalize";

@Injectable()
export class CompaniesService {
  constructor(private readonly companies: CompaniesRepository) {}

  // POST → компания + dedupHint (§4.2, тот же приём, что ContactsService.create) — кандидаты
  // ищутся ДО создания, поэтому новая компания не попадает в собственный хинт. Не блокирует.
  async create(orgId: string, input: CreateCompanyInput): Promise<CreateCompanyResponse> {
    const domainNormalized = normalizeDomain(input.domain);
    const dedupHint = await this.dedupByNormalized(orgId, domainNormalized);
    const row = await this.companies.create({
      orgId,
      name: input.name,
      domain: input.domain,
      domainNormalized,
      industry: input.industry,
    });
    return { company: toCompanyResponse(row), dedupHint };
  }

  // domain пуст → канон null → в дедупе не участвует (§4.2), пустой хинт без запроса.
  private async dedupByNormalized(orgId: string, domainNormalized: string | null): Promise<CompanyDedupHint> {
    if (domainNormalized === null) return { candidates: [] };
    const rows = await this.companies.findDedupCandidates(orgId, domainNormalized);
    return { candidates: rows };
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
