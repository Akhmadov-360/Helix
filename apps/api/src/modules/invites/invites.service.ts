import { Injectable } from "@nestjs/common";
import type { Role } from "@helix/db";
import type {
  AcceptInviteInput,
  CreateInviteInput,
  InviteListResponse,
  InvitePreviewResponse,
} from "@helix/api-schemas";
import { canGrantRole } from "../../core/authz/role-hierarchy";
import {
  AlreadyOrgMemberError,
  InvalidInviteTokenError,
  InviteAcceptRequiresProfileError,
  InviteRoleExceedsInviterError,
  ResourceNotFoundError,
} from "../../core/errors/domain-error";
import { PrismaService } from "../../core/prisma/prisma.service";
import type { IssuedAuth } from "../auth/auth.service";
import { AuthService } from "../auth/auth.service";
import { PasswordService } from "../auth/password.service";
import type { SessionMetadata } from "../auth/sessions/refresh-session.service";
import { AuditRecorder } from "../audit/audit.recorder";
import { NotificationsService } from "../notifications/notifications.service";
import { OrganizationsRepository } from "../organizations/organizations.repository";
import { UsersRepository } from "../users/users.repository";
import { generateInviteToken, hashInviteToken, INVITE_TOKEN_TTL_MS } from "./invite-token";
import { InvitesRepository } from "./invites.repository";

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invites: InvitesRepository,
    private readonly orgs: OrganizationsRepository,
    private readonly users: UsersRepository,
    private readonly passwords: PasswordService,
    private readonly auth: AuthService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditRecorder,
  ) {}

  /**
   * invites.md §1/§4. resend = revoke текущего pending (если есть) + create нового, одной
   * транзакцией — старый токен из предыдущего письма после этого мёртв (findValidByTokenHash
   * его больше не найдёт).
   */
  async create(
    orgId: string,
    actorId: string,
    actorRole: Role,
    dto: CreateInviteInput,
  ): Promise<void> {
    if (!canGrantRole(actorRole, dto.role)) throw new InviteRoleExceedsInviterError();

    // create-time UX-guard (§3): дубль по email — DB-инвариант (Membership.@@unique) всё равно
    // защитит accept, здесь только чтобы не слать бессмысленное письмо.
    const existingUser = await this.users.findByEmailWithHash(dto.email);
    if (existingUser && (await this.orgs.findMembershipRole(existingUser.id, orgId)) !== null) {
      throw new AlreadyOrgMemberError();
    }

    const [actor, org] = await Promise.all([
      this.users.findProfileById(actorId),
      this.orgs.findById(orgId),
    ]);
    if (!actor || !org) throw new ResourceNotFoundError();

    const rawToken = generateInviteToken();

    await this.prisma.client.$transaction(async (tx) => {
      const pending = await this.invites.findPendingByEmail(orgId, dto.email, tx);
      if (pending) await this.invites.markRevoked(pending.id, tx);

      await this.invites.create(
        {
          orgId,
          email: dto.email,
          role: dto.role,
          invitedByUserId: actorId,
          tokenHash: hashInviteToken(rawToken),
          expiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS),
        },
        tx,
      );

      await this.audit.record(tx, {
        orgId,
        actorId,
        event: {
          action: "invite.created",
          schemaVersion: 1,
          payload: { email: dto.email, role: dto.role, invitedByName: actor.name },
        },
      });
    });

    // P4: enqueue ПОСЛЕ $transaction() — тот же порядок, что весь остальной email-пайплайн.
    await this.notifications.enqueueOrgInvite({
      email: dto.email,
      orgName: org.name,
      inviterName: actor.name,
      role: dto.role,
      token: rawToken,
    });
  }

  async list(orgId: string): Promise<InviteListResponse> {
    const pending = await this.invites.listPending(orgId);
    return pending.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      invitedByName: i.invitedByName,
      createdAt: i.createdAt.toISOString(),
      expiresAt: i.expiresAt.toISOString(),
    }));
  }

  async revoke(orgId: string, actorId: string, id: string): Promise<void> {
    const invite = await this.invites.findPendingInOrg(orgId, id);
    if (!invite) throw new ResourceNotFoundError("Invite not found");

    const actor = await this.users.findProfileById(actorId);
    if (!actor) throw new ResourceNotFoundError();

    await this.prisma.client.$transaction(async (tx) => {
      await this.invites.markRevoked(id, tx);
      await this.audit.record(tx, {
        orgId,
        actorId,
        event: {
          action: "invite.revoked",
          schemaVersion: 1,
          payload: { email: invite.email, role: invite.role, revokedByName: actor.name },
        },
      });
    });
  }

  /** invites.md §3/§6: публичный превью, не раскрывает причину невалидности (InvalidInviteTokenError). */
  async preview(rawToken: string): Promise<InvitePreviewResponse> {
    const invite = await this.invites.findValidByTokenHash(hashInviteToken(rawToken));
    if (!invite) throw new InvalidInviteTokenError();

    const existingUser = await this.users.findByEmailWithHash(invite.email);

    return {
      email: invite.email,
      orgName: invite.orgName,
      role: invite.role,
      inviterName: invite.inviterName,
      acceptMode: existingUser ? "ACCEPT" : "REGISTER",
    };
  }

  /**
   * invites.md §3 — две ветки. Обе заканчиваются AuthService.issueFor (тот же метод, что
   * login/register): accept сразу логинит принявшего в только что полученную оргу.
   */
  async accept(
    rawToken: string,
    input: AcceptInviteInput,
    metadata?: SessionMetadata,
  ): Promise<IssuedAuth> {
    const invite = await this.invites.findValidByTokenHash(hashInviteToken(rawToken));
    if (!invite) throw new InvalidInviteTokenError();

    const existingUser = await this.users.findByEmailWithHash(invite.email);

    // Хешируем ДО транзакции (registration.service.ts комментарий: argon2id — десятки мс,
    // держать открытую транзакцию всё это время незачем).
    const passwordHash = existingUser
      ? null
      : await (async () => {
          if (!input.name || !input.password) throw new InviteAcceptRequiresProfileError();
          return this.passwords.hash(input.password);
        })();

    return this.prisma.client.$transaction(async (tx) => {
      const user = existingUser
        ? existingUser
        : await this.users.create({ email: invite.email, name: input.name!, passwordHash: passwordHash! }, tx);

      // Race-guard (§3): конкурентный двойной accept — второй видит count 0 и откатывается,
      // не создав вторую Membership. markAccepted ПОСЛЕ users.create — идентичный порядок для
      // обеих веток, проще держать в голове, чем условный.
      if ((await this.invites.markAccepted(invite.id, user.id, tx)) === 0) {
        throw new InvalidInviteTokenError();
      }

      // Membership.@@unique([orgId, userId]) — P2002, если email каким-то путём уже стал членом
      // между enqueue и обработкой (см. invites.md §3 комментарий, тот же приём, что
      // UsersRepository.create про дубль email: единственный источник истины — constraint, не pre-check).
      await this.orgs.addMember({ orgId: invite.orgId, userId: user.id, role: invite.role }, tx);

      await this.audit.record(tx, {
        orgId: invite.orgId,
        actorId: user.id,
        event: {
          action: "invite.accepted",
          schemaVersion: 1,
          payload: { email: invite.email, role: invite.role, acceptedByName: user.name },
        },
      });

      return this.auth.issueFor(user, { activeOrgId: invite.orgId, metadata, tx });
    });
  }
}
