import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  companyQuerySchema,
  createCompanySchema,
  updateCompanySchema,
  type CompanyDetailResponse,
  type CompanyListResponse,
  type CompanyQuery,
  type CompanyResponse,
  type CreateCompanyInput,
  type UpdateCompanyInput,
} from "@helix/api-schemas";
import { CurrentAuth, type AuthContext } from "../../core/auth-context";
import { CheckPolicy } from "../../core/authz/check-policy.decorator";
import { PoliciesGuard } from "../../core/authz/policies.guard";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CompaniesService } from "./companies.service";

// orgId — только из токена (request.auth), никогда из тела/query (§2). Чужой ресурс → 404.
@ApiTags("companies")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("companies")
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Post()
  @CheckPolicy("create", "Company")
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createCompanySchema)) dto: CreateCompanyInput,
  ): Promise<CompanyResponse> {
    return this.companies.create(auth.activeOrgId, dto);
  }

  @Get()
  @CheckPolicy("read", "Company")
  list(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(companyQuerySchema)) query: CompanyQuery,
  ): Promise<CompanyListResponse> {
    return this.companies.list(auth.activeOrgId, query);
  }

  @Get(":id")
  @CheckPolicy("read", "Company")
  getById(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<CompanyDetailResponse> {
    return this.companies.getById(auth.activeOrgId, id);
  }

  @Patch(":id")
  @CheckPolicy("update", "Company")
  update(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCompanySchema)) dto: UpdateCompanyInput,
  ): Promise<CompanyResponse> {
    return this.companies.update(auth.activeOrgId, id, dto);
  }

  // delete Company — только O/A (§2), MANAGER не имеет delete Company.
  @Delete(":id")
  @CheckPolicy("delete", "Company")
  async remove(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<null> {
    await this.companies.remove(auth.activeOrgId, id);
    return null;
  }
}
