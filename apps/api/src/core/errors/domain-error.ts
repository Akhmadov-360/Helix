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
 * Соседи (after/before) при move устарели: их переставили/убрали, пара перевёрнута
 * или сосед ушёл в другую фазу (§4.5). 409 = «запрос был верен, мир изменился», не 400.
 */
export class StaleNeighborsError extends ConflictError {
  readonly code = "STALE_NEIGHBORS";

  constructor() {
    super("Neighbour cards changed; refetch and retry the move");
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

/** Нельзя создать лид в доске без фаз (§10): Project.phaseId NOT NULL, класть некуда. */
export class WorkspaceHasNoPhasesError extends ConflictError {
  readonly code = "WORKSPACE_HAS_NO_PHASES";

  constructor() {
    super("Workspace has no phases; create a phase before adding leads");
  }
}

/** Реализация раздваивает семантику merge: source ≠ target — форменное нарушение (§7.1). */
export class SelfMergeError extends BadRequestError {
  readonly code = "SELF_MERGE";

  constructor() {
    super("Cannot merge a contact into itself");
  }
}

/**
 * Merge требует, чтобы И source, И target были активны (§7.1/§7.4). Уже смёрженный участник
 * → 409: создавать цепочку A→B→C нельзя (инвариант «ровно один хоп»). Отличается от 410
 * (§7.5): 410 — про чтение/правку смёрженного по его id; здесь — про попытку merge с ним.
 */
export class ContactNotActiveError extends ConflictError {
  readonly code = "CONTACT_NOT_ACTIVE";

  constructor() {
    super("Both contacts must be active (not already merged)");
  }
}

/**
 * Ресурс существовал, но погашен и более недоступен по этому id (§7.5). Именно 410, не 404:
 * ссылка исторически валидна, клиент должен узнать новый id и обновиться. В details —
 * mergedIntoId (куда смотреть).
 */
export abstract class GoneError extends DomainError {}

export class ContactMergedError extends GoneError {
  readonly code = "CONTACT_MERGED";

  constructor(override readonly details: { mergedIntoId: string }) {
    super("Contact was merged into another contact");
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
