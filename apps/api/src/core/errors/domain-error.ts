/**
 * Доменные ошибки. О HTTP тут НЕ знают ничего — ни статусов, ни заголовков.
 *
 * Сервис бросает семантическую ошибку («учётные данные неверны»), а решение,
 * какой это HTTP-код, принимает единственное место — AllExceptionsFilter.
 * Поэтому здесь нет поля `status`: если бы ошибка несла его сама, «фильтр решает»
 * превратилось бы в фикцию, а транспортный слой протёк бы в домен.
 *
 * `code` — часть КОНТРАКТА с фронтом: стабильный машиночитаемый идентификатор,
 * по которому клиент различает причины (в отличие от `message`, который для людей
 * и может меняться/переводиться).
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  /** Доп. данные для клиента (напр. список фаз-кандидатов при PHASE_NOT_EMPTY). */
  readonly details?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    // Без этого instanceof ломается при компиляции в ES5-подобные цели и
    // stack-трейс называет базовый класс вместо конкретного.
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }
}

/** Не установлена личность: нет токена, токен негоден, пароль не подошёл. */
export abstract class UnauthorizedError extends DomainError {}

export class InvalidCredentialsError extends UnauthorizedError {
  readonly code = "INVALID_CREDENTIALS";

  constructor() {
    // Единый текст на «нет такого email», «неверный пароль» и «SSO-only юзер»:
    // разный текст превратил бы ответ в оракул существования аккаунта.
    super("Invalid email or password");
  }
}

export class InvalidTokenError extends UnauthorizedError {
  readonly code = "INVALID_TOKEN";

  constructor(message = "Access token is missing, invalid or expired", options?: { cause?: unknown }) {
    super(message, options);
  }
}

/**
 * Ресурс не найден ИЛИ принадлежит чужой орге — намеренно неразличимо (§8 спеки):
 * 403 на чужой ресурс подтвердил бы его существование. Оба случая → 404.
 */
export class ResourceNotFoundError extends DomainError {
  readonly code = "NOT_FOUND";

  constructor(message = "Resource not found") {
    super(message);
  }
}

/** Запрос корректен по форме (Zod), но нарушает бизнес-правило. */
export abstract class BadRequestError extends DomainError {}

/**
 * Присланный набор phaseIds не совпадает с фазами воркспейса (неполный, чужие или
 * дубли). Reorder оперирует ПОЛНЫМ порядком — частичный список неоднозначен (§3).
 */
export class InvalidPhaseSetError extends BadRequestError {
  readonly code = "INCOMPLETE_PHASE_SET";

  constructor() {
    super("phaseIds must contain exactly the workspace's phases");
  }
}

/** reassignTo не существует, из другого воркспейса или равен удаляемой фазе. */
export class InvalidReassignTargetError extends BadRequestError {
  readonly code = "INVALID_REASSIGN_TARGET";

  constructor() {
    super("reassignTo must be another phase of the same workspace");
  }
}

/** Конфликт состояния — оптимистическая блокировка не сошлась и т.п. */
export abstract class ConflictError extends DomainError {}

/**
 * Клиент прислал reorder со старым version: доска изменилась под ним (§4, lost update).
 * → refetch и повтор. Отдельный код, чтобы фронт отличал от прочих 409.
 */
export class WorkspaceVersionConflictError extends ConflictError {
  readonly code = "WORKSPACE_VERSION_CONFLICT";

  constructor() {
    super("Workspace was modified concurrently; refetch and retry");
  }
}

/**
 * Удаляемая фаза содержит проекты, а reassignTo не передан (§6). В details —
 * фазы-кандидаты, чтобы фронт показал выбор «куда перенести».
 */
export class PhaseNotEmptyError extends ConflictError {
  readonly code = "PHASE_NOT_EMPTY";

  constructor(override readonly details: unknown) {
    super("Phase has projects; provide reassignTo to move them");
  }
}

/** Личность установлена, но действие не разрешено. */
export abstract class ForbiddenError extends DomainError {}

/**
 * Юзер не состоит в организации, от имени которой пришёл запрос.
 *
 * Именно 403, а НЕ 401: 401 означал бы «переаутентифицируйся», клиент пошёл бы на
 * /refresh, получил новый токен для того же lastActiveOrgId и упёрся бы в тот же
 * отказ — бесконечный цикл. 403 честно говорит «личность в порядке, эта орга недоступна»,
 * и клиенту остаётся switch-org или логин.
 */
export class NotOrgMemberError extends ForbiddenError {
  readonly code = "NOT_ORG_MEMBER";

  constructor() {
    super("You are not a member of this organization");
  }
}

/** Член орги, но роль не позволяет действие (CASL-политика отказала). */
export class ForbiddenActionError extends ForbiddenError {
  readonly code = "FORBIDDEN";

  constructor(message = "Your role does not allow this action") {
    super(message);
  }
}

/**
 * Отдельный код от INVALID_TOKEN: фронту нужно различать «протух access —
 * сходи на /refresh» и «сессия мертва — показывай форму логина». Один код на
 * оба случая загнал бы клиент в цикл бесплодных refresh-запросов.
 *
 * Причина непригодности (не найден / истёк / отозван / уже потрачен) наружу
 * НЕ раскрывается: для владельца токена разницы нет, а атакующему подсказка.
 */
export class InvalidRefreshTokenError extends UnauthorizedError {
  readonly code = "INVALID_REFRESH_TOKEN";

  constructor() {
    super("Refresh session is missing, invalid or expired");
  }
}
