import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  contactQuerySchema,
  createContactSchema,
  dedupCheckSchema,
  mergeContactSchema,
  updateContactSchema,
  type ContactListResponse,
  type ContactQuery,
  type ContactResponse,
  type CreateContactInput,
  type CreateContactResponse,
  type DedupCheckQuery,
  type DedupHint,
  type MergeContactInput,
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

  // Слить sourceId в :id (target). Необратим по связям (§7.7) → отдельный action merge (=Owner/Admin,
  // строже delete=Manager+). Не создание → 200.
  @Post(":id/merge")
  @HttpCode(HttpStatus.OK)
  @CheckPolicy("merge", "Contact")
  @ApiOkResponse({ description: "source влит в target, source погашен (§7)" })
  merge(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(mergeContactSchema)) dto: MergeContactInput,
  ): Promise<ContactResponse> {
    return this.contacts.merge(auth.activeOrgId, auth.userId, id, dto.sourceId);
  }
}
