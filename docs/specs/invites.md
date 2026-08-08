# docs/specs/invites.md — Org member invites by email (M2, доп. срез)

> **Назначение.** Реализационная спека. Claude Code читает перед кодом. Решения зафиксированы с
> обоснованием — **не разворачивать обратно** без флага. Соблюдать `CLAUDE.md`
> (Controller→Service→Repository, envelope, AllExceptionsFilter, Zod-контракты в `api-schemas`) и
> `docs/decisions.md` (P1 — id, не email, как стабильная ссылка на инвайт; P2 — снапшот в аудите,
> не только живая ссылка; P4 — письмо после коммита, через уже существующую очередь `email`).
>
> **Это не отдельная веха, а расширение уже сделанного.** Токен-механика 1:1 повторяет
> `PasswordResetToken`/`password-reset.service.ts` (случайный 32-байтный токен, в БД — только
> SHA-256 хеш). Доставка письма — тот же BullMQ-пайплайн `notifications.md`, пятый job после
> `lead.created`/`password.reset`/`project.assigned`/`project.phase_changed`. Ничего из
> инфраструктуры не изобретается заново — только новая доменная сущность (`Invite`) и новая
> точка входа в уже существующий инвариант «каждый `User` состоит хотя бы в одной `Membership`
> всегда» (auth.md §9.1).
>
> **Почему сейчас, а не отдельной future-вехой.** Комментарий уже стоит в коде заранее —
> `organizations.repository.ts` (`findDefaultOrgIdForUser`): *«с приглашениями (позже) понадобится
> либо явный флаг в схеме, либо "последняя активная"»*. Функция уже написана с оговоркой под эту
> задачу — её игнорировать значило бы держать долг там, где авторы уже оставили явную зарубку.

---

## 0. Скоуп и на чём основано (нет отдельного FR-INVITE-*)

PRD не содержит `FR-INVITE-*` — приглашение по email нигде не сформулировано как отдельное
требование. Основание для фичи — расширение уже существующих MUST:

- **Appendix B, строка «Manage members & roles»** — ✔ только Owner/Admin, "—" всем остальным.
  Сегодня это управление уже СУЩЕСТВУЮЩИМИ участниками (`PATCH`/`DELETE
  /organizations/members/:userId`); приглашение нового человека — тот же по духу пункт матрицы,
  для которого сегодня физически нет входной точки (см. `capabilities.ts` комментарий: *«создание
  [Membership] — это `POST /v1/organizations` (новая орга целиком), не Membership конкретного
  юзера) — отдельный сценарий без CASL-гейта»* — вот этот пробел и закрываем).
- **FR-ORG-2 (MUST)** — «пользователь может состоять в нескольких оргах». Инвайт для уже
  существующего юзера — прямое применение этого пункта (добавление ещё одной `Membership`),
  просто инициированное чужим админом, а не самим юзером через `POST /organizations`.
- **auth.md §9.1** — «каждый `User` состоит хотя бы в одной `Membership` всегда». Инвайт для
  email БЕЗ существующего `User` обязан создать `User`+`Membership` атомарно, не нарушая
  инвариант — раздел §3 ниже посвящён именно этому.

**В скоупе:** `Invite` Prisma-модель · токен-механика (7 дней TTL) · `POST/GET/DELETE
/v1/organizations/invites*` (Owner/Admin) · публичные `GET/POST /v1/invites/:token[/accept]` ·
письмо через существующий email-пайплайн · resend = revoke+recreate · ограничение роли инвайта
рангом самого пригласившего (общий `role-hierarchy.ts`, §4) · audit-трейл
(`invite.created`/`invite.accepted`/`invite.revoked`) · периодическая чистка терминальных
`Invite` третьим потребителем `MAINTENANCE_QUEUE` (§13 — построено сразу, не отложено).

**НЕ в скоупе:**
- **Bulk-инвайт** (список email через запятую/CSV) — не запрошено, один email за раз достаточен
  для текущего масштаба; добавить позже без переделки модели (```Invite``` уже per-email).
- **Кастомизация письма-приглашения** (свой текст от админа) — шаблон фиксированный, как и все
  остальные транзакционные письма (`notifications.md` §5).
- **SSO-приглашения** (инвайт сразу привязывает identity-провайдера) — `User.ssoSub` существует в
  схеме, но flow с SSO не проектируется здесь; инвайт создаёт password-based `User`, если его ещё
  нет. `acceptMode` (§3) уже расширяем под будущий `SSO`-вариант без переделки контракта.

---

## 1. Данные — новая модель `Invite`

Ничего из существующих моделей не подходит по форме (см. сравнение в §0 auth.md): `Membership`
требует существующего `userId`, `PasswordResetToken.userId` тоже non-null (юзер уже есть на
момент сброса пароля). Инвайт адресован **email**, не обязательно существующему `User`.

```prisma
model Invite {
  id               String    @id @default(cuid())
  orgId            String
  email            String
  role             Role
  invitedByUserId  String
  tokenHash        String    @unique
  createdAt        DateTime  @default(now())
  expiresAt        DateTime
  acceptedAt       DateTime?
  acceptedByUserId String?
  revokedAt        DateTime?

  org        Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  invitedBy  User         @relation("InviteInvitedBy", fields: [invitedByUserId], references: [id], onDelete: Cascade)
  acceptedBy User?        @relation("InviteAcceptedBy", fields: [acceptedByUserId], references: [id], onDelete: SetNull)

  @@index([orgId])
  @@index([email])
}
```

`Organization`/`User` получают back-relations (`invites`, `sentInvites`, `acceptedInvites`) —
виртуальные, без своей колонки, тот же приём, что `ActivityEvent.actorId` back-relation на `User`.

**Композитный tenant-FK не нужен** (в отличие от `Workspace @@unique([id, orgId])` → `Phase`):
`Invite.orgId` ссылается напрямую на корень тенант-дерева (`Organization`), не на дочернюю
сущность — нет промежуточного звена, чью консистентность нужно было бы гарантировать в БД.

**Manual-migration point НЕ заводим.** Рассматривался partial unique index
`UNIQUE(orgId, email) WHERE acceptedAt IS NULL AND revokedAt IS NULL` («не больше одного pending
инвайта на email в орге») — **отвергнуто**: это админ-only, низкочастотное действие (человек
вводит email в форму), и даже при гонке двух параллельных «Пригласить» на один email хуже, чем
два одновременно живых инвайта, не бывает — `Membership.@@unique([orgId, userId])` всё равно не
даст создать вторую `Membership`, когда до этого дойдёт (§3). Цена шестого raw-SQL
manual-migration-инварианта (см. `CLAUDE.md` список из пяти уже существующих) не оправдана ради
гонки, которая не портит данные. Уникальность «один активный инвайт» обеспечивается **на уровне
сервиса** (§4 — revoke-then-create в одной транзакции), не на уровне БД.

---

## 2. Токен — 1:1 паттерн `password-reset-token.ts`

```ts
const INVITE_TOKEN_BYTES = 32;

export function generateInviteToken(): string {
  return randomBytes(INVITE_TOKEN_BYTES).toString("base64url");
}

export function hashInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex"); // высокоэнтропийный секрет, argon2 не нужен
}
```

**TTL: 7 дней** (`INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000`) — **длиннее**, чем
`RESET_TOKEN_TTL_MS` (1 час). Разное окно осознанно: password-reset защищает **живой** аккаунт от
захвата (короткое окно), инвайт-ссылка не даёт немедленного доступа ни к чему — она лишь
приглашение вступить, а B2B-приглашения типично отлёживаются в почте днями (Slack/GitHub — тот же
порядок). Длинное окно не создаёт риска компрометации существующего аккаунта.

Сырой токен — **только в письме**, в БД остаётся `tokenHash` (тот же принцип, что refresh-token и
password-reset-token: `@unique`, ищем по хешу, raw никогда не возвращаем и не логируем).

**Токен — bearer-secret, 256 бит энтропии** (32 случайных байта из `crypto.randomBytes`). Явно
фиксируем это здесь, потому что `GET /v1/invites/:token` (§6) публичный и раскрывает
`orgName`/`inviterName`/`role`/`email` любому, кто предъявит токен, без дополнительной
аутентификации. Это осознанно, не дыра: сам факт обладания строкой такой энтропии эквивалентен
владению почтовым ящиком, куда она пришла (тот же довод, что уже принят для
`password-reset.service.ts`) — перебор/угадывание нерелевантны, а лишняя проверка личности здесь
не добавила бы защиты, только трение.

---

## 3. Двe ветки accept — как не сломать «≥1 Membership всегда»

`POST /v1/invites/:token/accept` обязан различать два принципиально разных случая:

**(a) Email ещё не имеет `User`.** Accept обязан создать `User` + `Membership(orgId, role)`
атомарно (одна транзакция) — но **не** проходить через `RegistrationService.register()`
(регистрация создаёт **личную** организацию, которая здесь не нужна и не должна создаваться: юзер
вступает в ЧУЖУЮ существующую оргу, не бутстрапит свою). Нужна параллельная, более узкая
транзакция:

```ts
await this.prisma.client.$transaction(async (tx) => {
  if ((await this.invites.markAccepted(invite.id, tx)) === 0) throw new InvalidInviteTokenError(); // race-guard, markUsed-паттерн
  const user = await this.users.create({ email: invite.email, name: input.name!, passwordHash }, tx);
  await this.organizations.addMember({ orgId: invite.orgId, userId: user.id, role: invite.role }, tx);
  return this.auth.issueFor(user, { activeOrgId: invite.orgId, tx });
});
```

**(b) Email уже имеет `User`** (в этой же орге или в других — не важно). Accept **не трогает**
`User`, только добавляет `Membership`:

```ts
await this.prisma.client.$transaction(async (tx) => {
  if ((await this.invites.markAccepted(invite.id, tx)) === 0) throw new InvalidInviteTokenError();
  await this.organizations.addMember({ orgId: invite.orgId, userId: existingUser.id, role: invite.role }, tx);
  return this.auth.issueFor(existingUser, { activeOrgId: invite.orgId, tx });
});
```

Оба случая заканчиваются `AuthService.issueFor(...)` (тот же метод, что `login`/`register`) —
accept **сразу логинит** принявшего в только что полученную оргу, тем же способом, что
регистрация логинит нового юзера в свою личную оргу сразу после создания. Не вводим отдельную
ветку «просто подтвердить членство без выдачи токенов» — один путь проще поддерживать, а разница
в UX (юзер и так был бы обязан залогиниться следующим шагом) не оправдывает её.

**Как контроллер узнаёт, какая ветка нужна, ДО отправки формы:** `GET /v1/invites/:token`
(публичный, §6) возвращает `acceptMode: "REGISTER" | "ACCEPT"`, **не** сырой `userExists: boolean`.
Разница не косметическая: булев флаг протекает деталь реализации («у нас есть/нет `User`-строка»)
прямо во фронтовый контракт. Фронту не нужно знать ПОЧЕМУ показывается та или иная форма — только
КАКОЙ экран рисовать. `enum` также растёт вперёд без ломающих изменений контракта: когда появится
SSO/OIDC (§0 — сознательно не в скоупе сейчас), добавится `"SSO"` рядом, а не превращение
`boolean` в `string | boolean` где-то на фронте.

```ts
export const acceptModeSchema = z.enum(["REGISTER", "ACCEPT"]);
// REGISTER — email без User, форма имя+пароль (ветка a).
// ACCEPT   — email уже User, кнопка «Принять», без формы (ветка b).
```

**Логин НЕ требуется для ветки `ACCEPT`.** Это осознанное решение, а не дыра: тот же принцип, что
уже есть в `password-reset.service.ts` — обладание токеном (пришедшим на email) само по себе
подтверждает владение почтовым ящиком, отдельный вход не добавляет защиты, только трение.

**Явный UX-trade-off, а не незамеченный побочный эффект.** Если в браузере на момент клика уже
была живая сессия ДРУГОГО аккаунта (например, случайно открыли письмо-приглашение, будучи
залогинены в рабочий аккаунт) — `issueFor` молча перезапишет refresh-cookie, и пользователя
незаметно переключит на приглашённый аккаунт. Это то же самое поведение, что и обычный `login`
сегодня (залогиниться под другим юзером в открытой вкладке уже делает то же самое) — инвайты не
вводят НОВЫЙ класс риска, только дают ещё один путь к уже существующему. Альтернатива
(«Membership добавлена → войдите заново») безопаснее в этом узком сценарии, но добавляет трение
всем остальным ради редкого случая случайного клика. **Решено:** оставляем авто-логин; если
станет проблемой на практике — тогда добавить предупреждение «вы сейчас войдёте под другим
аккаунтом» перед подтверждением, не заранее.

**Уже член этой орги на момент accept** (гонка/повторный клик по письму) — полагаемся на
`Membership.@@unique([orgId, userId])`: `addMember` бросит P2002, `AllExceptionsFilter` превратит
в 409. Отдельную pre-check здесь не ставим (см. `UsersRepository.create` комментарий: «дубль email
заранее не проверяем — `@unique` единственный источник истины, pre-check создал бы гонку») — тот
же принцип применён к дублю `Membership` на accept.

---

## 4. Роль инвайта не выше роли пригласившего

**Решено (явный выбор пользователя, не дефолт):** `POST /organizations/invites` бросает
`InviteRoleExceedsInviterError`, если приглашаемая роль выше ранга самого пригласившего.

**Иерархия — общий модуль, не приватная константа `InvitesService`.** Ранжирование ролей —
не факт, специфичный для инвайтов: это политика, которая рано или поздно понадобится где-то ещё
(например, если `changeMemberRole` когда-нибудь захочет ту же проверку, §ниже). Держать
`ROLE_RANK` внутри `invites.service.ts` значило бы: появится `SUPERVISOR` — надо синхронно помнить
обновить и `app-ability.ts`, и эту приватную константу, и любое третье место, которое тоже решит
её продублировать. Выносим в `apps/api/src/core/authz/role-hierarchy.ts` (тот же слой, что
`app-ability.ts` — это CASL-смежная, но не сама CASL, политика):

```ts
// core/authz/role-hierarchy.ts
const ROLE_RANK: Record<Role, number> = { VIEWER: 0, MEMBER: 1, MANAGER: 2, ADMIN: 3, OWNER: 4 };

export function roleRank(role: Role): number {
  return ROLE_RANK[role];
}

export function compareRoles(a: Role, b: Role): number {
  return roleRank(a) - roleRank(b);
}

/** true, если granter вправе выдать role (т.е. role не выше его собственного ранга). */
export function canGrantRole(granterRole: Role, role: Role): boolean {
  return roleRank(role) <= roleRank(granterRole);
}
```

`InvitesService` только вызывает `canGrantRole(actorRole, dto.role)` — не знает про ранги
напрямую. Практическое следствие (приглашать может только O/A, §5): **Admin не может инвайтнуть
нового Owner**, но может — Admin/Manager/Member/Viewer; **Owner может инвайтнуть кого угодно,
включая Owner**.

Это НЕ повторяет уже существующую логику `changeMemberRole`/`removeMember` (там такой иерархии
нет вообще — Admin сегодня может понизить/повысить кого угодно, включая сделать другого Owner) —
новая, более консервативная граница вводится **только** для инвайтов, сознательно асимметрично
относительно уже существующего `PATCH /members/:userId`. Если впоследствии захочется
единообразия — `changeMemberRole` вызовет тот же `canGrantRole` из того же модуля, а не заведёт
свою копию.

---

## 5. RBAC — новый CASL-субъект `Invite`

`app-ability.ts`:

```ts
export const APP_SUBJECTS = [
  // ...существующие,
  "Invite",
] as const;
```

Явных grant'ов для `MANAGER`/`MEMBER`/`VIEWER` **не добавляется** — отсутствие в свиче уже
означает deny (тот же паттерн, что `Membership` сегодня: только `OWNER`/`ADMIN` получают доступ
через бланковый `can("manage", "all")`).

`capabilities.ts`:

```ts
const SUBJECT_OPERATIONS = {
  // ...существующие,
  Invite: ["create", "read", "delete"], // accept — публичный, не через CASL (§3)
};
```

Зеркало в `packages/api-schemas/src/capabilities.ts` (`capabilitySubjectSchema`) — добавить
`"Invite"` туда же (единственный источник контракта для фронта, `CLAUDE.md` «Zod — единственный
источник»).

---

## 6. Эндпоинты

| Метод | Путь | Guard/роли | Назначение |
| --- | --- | --- | --- |
| `POST` | `/v1/organizations/invites` | `@CheckPolicy("create", "Invite")` (O/A) | Пригласить участника — revoke старого pending на тот же email + создать новый (§1) |
| `GET` | `/v1/organizations/invites` | `@CheckPolicy("read", "Invite")` (O/A) | Список **pending**-инвайтов текущей орги |
| `DELETE` | `/v1/organizations/invites/:id` | `@CheckPolicy("delete", "Invite")` (O/A) | Отозвать инвайт |
| `GET` | `/v1/invites/:token` | публичный, без guard | Превью для формы accept (email/orgName/role/inviterName/acceptMode) |
| `POST` | `/v1/invites/:token/accept` | публичный, без guard | Принять — создаёт `User`, если нужно (§3), выдаёт токены |

Живёт в новом модуле `apps/api/src/modules/invites/` (не в `organizations/`) — своя
токен-механика, репозиторий, сервис; ровно тот же принцип обособления, что у `password-reset/`
внутри `auth/` (§3 auth.md). Контроллер один класс, guard — per-route (не class-level), тот же
приём, что `AuthController` (публичные `login`/`register`/`forgot-password` рядом с закрытыми
`logout-all`/`me`).

---

## 7. Контракты (`packages/api-schemas/src/invites.ts`)

```ts
export const createInviteSchema = z.object({
  email: z.email(),
  role: roleSchema,
});
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

export const inviteResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: roleSchema,
  invitedByName: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
});
export type InviteResponse = z.infer<typeof inviteResponseSchema>;
export const inviteListResponseSchema = z.array(inviteResponseSchema);

export const invitePreviewResponseSchema = z.object({
  email: z.string(),
  orgName: z.string(),
  role: roleSchema,
  inviterName: z.string(),
  acceptMode: acceptModeSchema, // REGISTER | ACCEPT (§3) — какой экран рисовать, не факт про User
});
export type InvitePreviewResponse = z.infer<typeof invitePreviewResponseSchema>;

// name/password ОБЯЗАТЕЛЬНЫ только для ветки (a) §3 — Zod этого не знает (нет доступа к БД),
// сервис проверяет условно и бросает InviteAcceptRequiresProfileError, если email БЕЗ User
// прислал accept без name/password.
export const acceptInviteSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  password: passwordSchema.optional(), // переиспользуем auth.ts (min 12, OWASP ASVS), не своя константа
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
// accept response = AuthResult (auth.ts) — тот же конверт, что login/register (§3: тоже issueFor).
```

---

## 8. Ошибки (`core/errors/domain-error.ts`)

```ts
/** Токен инвайта: не найден, отозван, принят или истёк — причина не раскрывается (§2, тот же
 *  приём, что InvalidPasswordResetTokenError). */
export class InvalidInviteTokenError extends UnauthorizedError {
  readonly code = "INVALID_INVITE_TOKEN";
}

/** §4: запрошенная роль выше ранга самого пригласившего. */
export class InviteRoleExceedsInviterError extends BadRequestError {
  readonly code = "INVITE_ROLE_EXCEEDS_INVITER";
}

/** §3(a): accept для email без User пришёл без name/password. */
export class InviteAcceptRequiresProfileError extends BadRequestError {
  readonly code = "INVITE_ACCEPT_REQUIRES_PROFILE";
}

/** create-time UX-guard (§3): email уже состоит в этой орге — инвайт бессмыслен. */
export class AlreadyOrgMemberError extends ConflictError {
  readonly code = "ALREADY_ORG_MEMBER";
}
```

---

## 9. Письмо (пятый job в существующем пайплайне)

```ts
// org-invite-job.ts
export interface OrgInviteJobData {
  email: string;
  orgName: string;
  inviterName: string;
  role: Role;
  token: string; // сырой — тот же случай, что PasswordResetJobData: одноразовый payload, без рефетча
}
export const ORG_INVITE_JOB = "org.invite";
```

`renderOrgInviteEmail(data): RenderedEmail` — тот же стиль, что `renderPasswordResetEmail`
(инлайновый CSS, `subject`/`html`/`text`). Deep link:
`${appUrl}/invite/accept?token=${encodeURIComponent(token)}` (query-param, не path — тот же приём,
что reset-password).

`NotificationsService.enqueueOrgInvite(data)` — добавляется в `EmailJobData`-union, вызывается
**после** `$transaction()` создания `Invite` (P4, тот же порядок, что везде в этом пайплайне).
`EMAIL_JOB_OPTIONS` (5 попыток, exponential backoff) переиспользуются без изменений.

---

## 10. Audit-трейл

Три события через `AuditRecorder.record(tx, {...})` (тот же вызов, что
`membership.role_changed`/`membership.removed`):

- `invite.created` — payload: `{ email, role, invitedByName }`.
- `invite.accepted` — payload: `{ email, role, acceptedByName }` (P2: снапшот имени на момент
  принятия, не живая ссылка — юзер может переименоваться позже).
- `invite.revoked` — payload: `{ email, role, revokedByName }`.

Видимость в списке аудита — та же роль, что читает `AuditLog` сегодня (Manager+, см.
`app-ability.ts` комментарий: «словарь не секретнее уже публичного ростера участников»).

---

## 11. Жизненный цикл `Invite` — терминальное состояние + плановая чистка, не eager-delete

**Рассматривалось:** удалять строку `Invite` синхронно внутри транзакции accept/revoke,
оставляя историю только в `AuditLog` (у него уже есть снапшот `{email, role, name}`, P3).

**Отвергнуто.** Три причины:

1. **Нет выигрыша в консистентности данных** — ничего не читает терминальные (`acceptedAt`/
   `revokedAt` set) строки `Invite` на горячем пути; удаление добавило бы запись в транзакцию,
   которая сегодня ничего не пишет сверх нужного.
2. **Расходится с уже принятым паттерном.** `PasswordResetToken` устроен ИДЕНТИЧНО по форме
   (одноразовый токен, привязанный к событию) и **тоже никогда не удаляется синхронно** — только
   помечается `usedAt`. Если `Invite` удалять eager, а `PasswordResetToken` — нет, следующий, кто
   тронет любой из двух модулей, обязан будет держать в голове, почему они ведут себя по-разному,
   без структурной причины.
3. **`AuditLog` — снапшот, не замена FK.** `invitedByUserId`/`acceptedByUserId` в `Invite` — живые
   связи на `User`; `AuditLog.payload` хранит только `{userName, userEmail}` на момент события
   (P2/P3 — минимум для истории). Если в течение окна retention понадобится точный ответ «кто
   именно прислал этот инвайт» через FK (а не текстовый снапшот) — eager-delete эту возможность
   убивает мгновенно, а не через 90 дней.

**Решено:** `Invite` — третий потребитель `MAINTENANCE_QUEUE` (после `RefreshSession`, §
`project-refresh-session-cleanup`), тот же repeatable-job паттерн:

```ts
// invite-cleanup-job.ts
export const INVITE_CLEANUP_JOB = "invite.cleanup";
export const INVITE_CLEANUP_REPEAT_OPTIONS = { pattern: "0 4 * * *" }; // сдвинут на час от refresh-session.cleanup — не толкаться в 03:00
export const INVITE_RETENTION_DAYS = 90; // отдельное число от RefreshSession (30) — другая причина: support/отладка «правда ли отправили инвайт», не security-инцидент-анализ
```

`InviteCleanupRepository.deleteStale(cutoff)` — `deleteMany` по `acceptedAt|revokedAt|expiresAt <
cutoff` (то же OR-условие, что `RefreshSessionCleanupRepository`, другая таблица). Строится и
тестируется **в этом же проходе реализации** (§13), не переносится в отдельный будущий тикет —
инфраструктура (`MAINTENANCE_QUEUE`, паттерн worker/module) уже доказана на `RefreshSession`,
цена третьего потребителя предельно мала, а откладывать означало бы повторить путь
`project-refresh-session-cleanup` (отложено → забыто на несколько недель → отдельная сессия на
разгребание) вместо того, чтобы закрыть сразу.

---

## 12. Почему `Invite` — не `Membership.pending`

Вопрос предсказуемый: зачем новая таблица, если можно было бы добавить `Membership.status:
"pending" | "active"` и обойтись без `Invite` вообще?

Ответ — в требуемом FK. `Membership` (`@@unique([orgId, userId])`) **обязана** ссылаться на
существующего `User.id` — это буквально её PK-пара. Инвайт же (§3, ветка a) по определению может
адресовать email, для которого `User` ещё не существует: `pending`-Membership для
несуществующего `userId` физически невозможна без превращения `userId` в nullable — что сломало
бы `@@unique([orgId, userId])` (nullable-колонка в unique-паре не гарантирует того же, что она
гарантирует сегодня: два `NULL` не конфликтуют друг с другом в Postgres) и заставило бы каждого
потребителя `Membership` (авторизация, ростер, `countOwners`, `countOrgsForUser` — везде, где
роль читается «на каждый запрос», §`organizations.repository.ts`) добавить проверку «а вдруг это
pending-строка без юзера» — цена размывания уже критичного для авторизации инварианта ради
экономии одной таблицы. `Invite` и `Membership` — не два состояния одной сущности, а сущности
с разным обязательным набором полей: `Invite` существует ДО `User`, `Membership` не может
существовать без него.

---

## 13. Порядок реализации

1. `packages/db`: модель `Invite` + back-relations на `Organization`/`User` (§1), `prisma migrate`.
2. `core/errors/domain-error.ts`: четыре новых класса (§8).
3. `core/authz/role-hierarchy.ts`: `roleRank`/`compareRoles`/`canGrantRole` (§4).
4. `core/authz/app-ability.ts` + `capabilities.ts` + `packages/api-schemas/src/capabilities.ts`:
   субъект `Invite` (§5).
5. `packages/api-schemas/src/invites.ts`: контракты + `acceptModeSchema` (§7).
6. `apps/api/src/modules/invites/`: `invite-token.ts` (§2), `invites.repository.ts`
   (`create`/`findValidByTokenHash`/`markAccepted`/`markRevoked`/`listPending`/`findPendingByEmail`),
   `invites.service.ts` (§3–4, зовёт `canGrantRole` из шага 3), `invites.controller.ts` (§6).
7. `apps/api/src/modules/notifications/`: `org-invite-job.ts`, `templates/org-invite-email.ts`,
   `enqueueOrgInvite` в `NotificationsService`, диспетч в `EmailWorker` (§9).
8. Подключить `AuditRecorder` вызовы (§10).
9. `apps/api/src/modules/maintenance/`: `invite-cleanup-job.ts`, `invite-cleanup.repository.ts`,
   `invite-cleanup.worker.ts` — третий потребитель `MAINTENANCE_QUEUE`, регистрация repeatable
   job в `MaintenanceModule.onModuleInit` рядом с `RefreshSession` (§11).
10. `AppModule`: зарегистрировать `InvitesModule` (импортирует `AuthModule` за `issueFor`,
    `OrganizationsModule` за `addMember`/`findMembershipRole`, `NotificationsModule`,
    `UsersModule`).

---

## 14. Тестирование — что покрыть обязательно

- **§9.1-инвариант:** accept для email без `User` → создаётся ровно один `User` + одна
  `Membership`, **без** личной организации (в отличие от `register`).
- **Существующий юзер:** accept для email с `User` в другой орге → **новая** `Membership`
  добавляется, существующие не трогаются, `User` не дублируется.
- **Race-guard:** `markAccepted` — конкурентный двойной accept одного токена → второй получает
  `InvalidInviteTokenError`, не создаёт вторую `Membership` (тот же паттерн, что
  `password-reset.service.ts` тест на двойной reset).
- **Resend:** повторный `POST /invites` на email с уже pending-инвайтом → старый токен из письма
  после этого невалиден (`InvalidInviteTokenError`), новый работает.
- **Role hierarchy (§4):** юнит-тесты на `canGrantRole`/`roleRank`/`compareRoles` отдельно от
  `InvitesService` (чистые функции `role-hierarchy.ts`, без БД); плюс интеграционный: Admin
  приглашает role=OWNER → `InviteRoleExceedsInviterError`; Admin приглашает role=ADMIN → проходит;
  Owner приглашает role=OWNER → проходит.
- **acceptMode (§3):** `GET /invites/:token` → `REGISTER` для email без `User`, `ACCEPT` — для
  email с `User`; `POST /accept` без `name`/`password` в ветке `REGISTER` →
  `InviteAcceptRequiresProfileError`.
- **Already member (§3):** инвайт на email, уже состоящий в этой орге → `AlreadyOrgMemberError`
  на create; если всё же протух до accept и стал участником другим путём — 409 на accept через
  `@@unique` (P2002), не 500.
- **TTL:** истёкший (`expiresAt < now`), отозванный (`revokedAt` set), уже принятый (`acceptedAt`
  set) токен → `InvalidInviteTokenError` во всех трёх случаях, без различения причины в ответе.
- **RBAC:** Manager/Member/Viewer → 403 на все три org-scoped эндпоинта; O/A → 2xx.
- **Письмо:** `renderOrgInviteEmail` deep link содержит правильный токен; `enqueueOrgInvite`
  вызывается после коммита транзакции создания инвайта (тот же тест-паттерн, что
  `notifications.service.spec.ts`).
- **Tenant:** `GET /organizations/invites` не показывает pending-инвайты чужой орги.
- **Cleanup (§11):** тот же набор, что уже покрыт для `RefreshSessionCleanup` (§
  `project-refresh-session-cleanup`), применённый к `Invite` — репозиторий не трогает
  живой/в-окне-retention инвайт, удаляет терминальный дольше 90 дней; worker считает cutoff
  корректно; `MaintenanceModule` регистрирует `invite.cleanup` как repeatable job наравне с
  `refresh-session.cleanup`, без дублирования при повторной инициализации.
