import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  createOrganizationSchema,
  type CreateOrganizationInput,
  type MyOrgListResponse,
  type MyOrgResponse,
} from "@helix/api-schemas";
import { CurrentAccount, type AccountContext } from "../../core/auth-context";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe";
import { AccountGuard } from "../auth/jwt-auth.guard";
import { OrganizationsService } from "./organizations.service";

@ApiTags("organizations")
@ApiBearerAuth()
@UseGuards(AccountGuard)
@Controller("organizations")
export class MyOrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get("mine")
  listMine(@CurrentAccount() account: AccountContext): Promise<MyOrgListResponse> {
    return this.organizations.listMine(account.userId);
  }

  @Post()
  create(
    @CurrentAccount() account: AccountContext,
    @Body(new ZodValidationPipe(createOrganizationSchema)) dto: CreateOrganizationInput,
  ): Promise<MyOrgResponse> {
    return this.organizations.create(account.userId, dto.name);
  }
}
