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
import { ApiBearerAuth, ApiCreatedResponse, ApiTags } from "@nestjs/swagger";
import {
  contactQuerySchema,
  createContactSchema,
  dedupCheckSchema,
  updateContactSchema,
  type ContactListResponse,
  type ContactQuery,
  type ContactResponse,
  type CreateContactInput,
  type CreateContactResponse,
  type DedupCheckQuery,
  type DedupHint,
  type UpdateContactInput,
} from "@helix/api-schemas";
import { CurrentAuth, type AuthContext } from "../../core/auth-context";
import { CheckPolicy } from "../../core/authz/check-policy.decorator";
import { PoliciesGuard } from "../../core/authz/policies.guard";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ContactsService } from "./contacts.service";

// orgId — только из ALS (§2). Чужой ресурс → 404. dedup-check и merge — отдельные единицы (6/7).
@ApiTags("contacts")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("contacts")
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Post()
  @CheckPolicy("create", "Contact")
  @ApiCreatedResponse({ description: "Контакт создан (+ dedup-хинт, §4.2)" })
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createContactSchema)) dto: CreateContactInput,
  ): Promise<CreateContactResponse> {
    return this.contacts.create(auth.activeOrgId, dto);
  }

  @Get()
  @CheckPolicy("read", "Contact")
  list(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(contactQuerySchema)) query: ContactQuery,
  ): Promise<ContactListResponse> {
    return this.contacts.list(auth.activeOrgId, query);
  }

  // ВАЖНО: объявлено ДО GET :id, иначе "dedup-check" перехватится как :id (порядок роутов).
  @Get("dedup-check")
  @CheckPolicy("create", "Contact")
  dedupCheck(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(dedupCheckSchema)) query: DedupCheckQuery,
  ): Promise<DedupHint> {
    return this.contacts.dedupCheck(auth.activeOrgId, query.email);
  }

  @Get(":id")
  @CheckPolicy("read", "Contact")
  getById(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<ContactResponse> {
    return this.contacts.getById(auth.activeOrgId, id);
  }

  @Patch(":id")
  @CheckPolicy("update", "Contact")
  update(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateContactSchema)) dto: UpdateContactInput,
  ): Promise<ContactResponse> {
    return this.contacts.update(auth.activeOrgId, id, dto);
  }

  // delete Contact — только O/A (§2). Участник сделки → FK Restrict → 409 (§6).
  @Delete(":id")
  @CheckPolicy("delete", "Contact")
  async remove(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<null> {
    await this.contacts.remove(auth.activeOrgId, id);
    return null;
  }
}
