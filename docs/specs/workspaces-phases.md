# docs/specs/workspaces-phases.md — Workspaces + Phases (M1)

> **Назначение.** Реализационная спека первого среза M1. Claude Code читает перед кодом.
> Решения зафиксированы с обоснованием — **не разворачивать обратно** без флага.
> Соблюдать `CLAUDE.md` (Controller→Service→Repository, Zod per-route, envelope, AllExceptionsFilter)
> и `docs/decisions.md` (P1–P4, решения по Phase/Workspace).

---

## 0. Скоуп

**В скоупе:** CRUD воркспейсов · CRUD фаз · reorder фаз · удаление фазы с переносом проектов ·
CASL-guard на org-роли · raw-SQL миграция DEFERRABLE unique + тест-на-инвариант.

**НЕ в скоупе (свои вехи):** блюпринты (M2) · `WorkspaceMember` override + `visibility=ASSIGNED` (M6) ·
кастомные поля/`FieldDefinition` CRUD · projects (следующий срез M1) · фронт (после API).

---

## 1. Эндпоинты

| Метод  | Путь                                | Роли  | Назначение                                 |
| ------ | ----------------------------------- | ----- | ------------------------------------------ |
| POST   | `/v1/workspaces`                    | O/A/M | создать доску (+ дефолтные фазы, §4)       |
| GET    | `/v1/workspaces`                    | все   | список досок орга (без фаз, со счётчиком)  |
| GET    | `/v1/workspaces/:id`                | все   | доска + её фазы (упорядоченные)            |
| PATCH  | `/v1/workspaces/:id`                | O/A/M | переименовать / settings / audience        |
| DELETE | `/v1/workspaces/:id`                | O/A   | удалить доску (каскад: фазы, проекты)      |
| POST   | `/v1/workspaces/:id/phases`         | O/A/M | добавить фазу (всегда в конец, §5)         |
| PATCH  | `/v1/phases/:id`                    | O/A/M | name / color / type (**НЕ key, НЕ order**) |
| POST   | `/v1/workspaces/:id/phases/reorder` | O/A/M | переупорядочить (§3)                       |
| DELETE | `/v1/phases/:id`                    | O/A/M | удалить с переносом проектов (§6)          |

Роли: O=OWNER, A=ADMIN, M=MANAGER (Appendix B «Create/configure workspaces & phases»).
Member/Viewer — только чтение → 403 на мутации.

**`orgId` НИКОГДА не принимается из тела/query** — только из ALS-контекста (из токена). Иначе клиент
создаст ресурс в чужой орге. Тенант приходит из контекста, не из пользовательского ввода.

---

## 2. Контракты (Zod в `api-schemas`, schema-first)

```
CreateWorkspaceSchema  { name: string, audience?: Audience, settings?: Json }
UpdateWorkspaceSchema  { name?: string, audience?: Audience, settings?: Json }
CreatePhaseSchema      { name: LocalizedName, type?: PhaseType (default OPEN), color?: string }
UpdatePhaseSchema      { name?: LocalizedName, type?: PhaseType, color?: string }
ReorderPhasesSchema    { phaseIds: string[], version: number }
DeletePhaseQuerySchema { reassignTo?: string }

WorkspaceResponseSchema { id, name, audience, settings, version, createdAt, phases? }
PhaseResponseSchema     { id, workspaceId, key, name, type, order, color }
```

**`Workspace.name` — простая строка** (как `Organization.name` в schema.prisma), НЕ LocalizedName.
Локализуется только **`Phase.name`** (`LocalizedName {uz?, ru?, en?}`, минимум один непустой язык, рендер
через `localize()` — P1). Ранняя редакция §2 ошибочно ставила LocalizedName у обоих; источник истины —
schema.prisma, спека выровнена под неё (реализовано в `api-schemas`).

---

## 3. Reorder — отдельный эндпоинт, контракт = ПОЛНЫЙ желаемый порядок

```
POST /v1/workspaces/:id/phases/reorder
{ "phaseIds": ["ph_c","ph_a","ph_b"], "version": 5 }
```

- **Не** `PATCH /phases/:id {order}` — перенумерация это операция над **всем воркспейсом**, не над строкой.
- **`phaseIds` обязан содержать ВСЕ фазы воркспейса** (множества совпадают), иначе 400
  `INCOMPLETE_PHASE_SET`. Частичный список породил бы ветвление «куда девать неупомянутые» — а мы держим
  один примитив.
- Чужая/несуществующая фаза в списке → 400 (валидация множества; composite-FK как страховка БД).
- Сервер **нормализует в плотные 1..n** из присланной последовательности. Инкрементальные дельты
  («переставь X после Y») НЕ используем — ветвятся и багуют на batch/import.

**Почему полный список, а не дельта:** один примитив «нормализуй порядок воркспейса в 1..n» обслуживает
reorder / delete / multi-delete / blueprint-import разом. Кардинальность O(10) → переписать все строки
всегда дешевле и корректнее, чем считать минимальную дельту. (LexoRank окупается на карточках, не на колонках.)

---

## 4. `Workspace.version` — optimistic lock на ВСЮ конфигурацию фаз

**`version++` при КАЖДОЙ операции, меняющей состав ИЛИ порядок фаз: create, delete, reorder.**
Инкремент — в той же транзакции, что и перенумерация (мы там уже пишем, цена нулевая).

**Почему не только на reorder** (важно, это защита от lost update):

```
A читает доску [Lead, Proposal, Won]              version=5
B создаёт фазу [Lead, Discovery, Proposal, Won]    version НЕ вырос → дыра
A шлёт reorder [Won, Proposal, Lead] c version=5   → сервер принимает → Discovery теряется
```

`version` защищает не порядок, а **поколение конфигурации доски**. Любое изменение состава обязано его
двигать, иначе оптимистичный клиент работает с неверным снимком и не узнаёт об этом.

**Механика:** `UPDATE workspace SET version = version + 1 WHERE id = ? AND version = ?` внутри транзакции.
Не обновилась строка → **409 `WORKSPACE_VERSION_CONFLICT`** → клиент рефетчит и повторяет.
`version` отдаётся в `WorkspaceResponse` — клиенту он нужен для следующей мутации.

> Отвергнуто: pessimistic/advisory lock (платим всегда ради редкого конфликта), serializable (оверкилл +
> ретраи). Конфликты редки → цена оптимизма при их отсутствии = 0.

---

## 5. Создание фазы — всегда в конец

```
POST /v1/workspaces/:id/phases  { "name": {...}, "type": "OPEN" }
→ order = max(order) + 1, version++
```

Позиционирование при создании (`afterPhaseId` / полный порядок) **НЕ поддерживаем**: иначе два механизма
управления порядком (create-with-position + reorder), оба надо стеречь. Хочешь вставить в середину — создал
(упала в конец) и вызвал reorder. Один примитив.

### Генератор `key` (иммутабельный слаг, P1)

```
1. взять name.en, если есть; иначе первый непустой язык
2. слагифицировать (транслит кириллицы, нормализация)
3. если результат ПУСТ (эмодзи "😀🔥", "!!!", CJK "空白") → fallback "phase"
4. если key занят в этом воркспейсе → суффикс: key-2, key-3, ...
```

**Инвариант генератора: никогда не возвращает пустую строку и всегда уникален в пределах воркспейса.**
Пустой `key` упёрся бы в `@@unique([workspaceId, key])` на второй такой фазе — непонятная ошибка юзеру.
Суффикс-число, **не** cuid: `key` обязан остаться человекочитаемым (на него смотрят в автоматизациях).

**`key` не редактируется** (`PATCH /phases/:id` его не принимает) — на него завязаны автоматизации/блюпринты.
`name` меняется свободно (три силы тянут `name`: переименование, ребрендинг, i18n — ни одна не трогает `key`).

---

## 6. Удаление фазы — перенос в ТОМ ЖЕ запросе

```
DELETE /v1/phases/:id?reassignTo=ph_other
```

Одна транзакция: перенести проекты в `reassignTo` → удалить фазу → перенумеровать оставшиеся в 1..n →
`version++`.

- Фаза пуста → `reassignTo` не нужен, удаляем сразу.
- Фаза не пуста, `reassignTo` не передан → **409 `PHASE_NOT_EMPTY`**, в `details` — список фаз-кандидатов
  (фронт покажет выбор).
- `reassignTo` из чужого воркспейса / не существует → 400.
- Удаление **последней** фазы воркспейса — разрешено (доска может быть пустой; создать новую можно всегда).

**Почему одним запросом, а не «сначала move, потом delete»:** между двумя запросами окно, в котором кто-то
создаст лид в удаляемой фазе. Атомарность закрывает окно. `onDelete: Restrict` остаётся страховкой БД —
ловит, если сервис ошибётся (превратить violation в 409, не 500).

**Гонка delete-vs-move безопасна без явного лока:** Restrict ловит с одной стороны, FK-violation с другой.
Задача сервиса — осмысленный 409.

---

## 7. ActivityEvent НЕ пишется на операции с доской/фазами

`ActivityEvent` требует `projectId` — это лента **проекта**, не свалка аудита (решение из decisions.md).
Изменения структуры доски (создал/переименовал/удалил колонку) — это **конфигурация**, их место в
`AuditLog` (M6, org-scoped, admin-only), не в ленте лида.

**Исключение:** перемещение проекта между фазами — событие _проекта_, пишется в `ActivityEvent` в той же
транзакции (P4). Появится в следующем срезе M1 (projects), не здесь.

---

## 8. Authz — первый настоящий CASL-guard

До сих пор guard клал identity (`userId`, `activeOrgId`, `role`). Теперь появляется «что тебе можно».

- Права по org-роли из `Membership` (читается per-request, свежая).
- **`WorkspaceMember` (per-workspace override + `visibility`) на M1 НЕ используем** — модель в схеме есть,
  логика откладывается (M6). Иначе RBAC разрастётся раньше времени.
- **Скоуп, не только роль:** любой лукап по id из URL идёт вместе с tenant-фильтром
  (`WHERE id = ? AND orgId = ctx.orgId`). Иначе IDOR — чужой воркспейс по прямому id.
- **Чужой ресурс → 404, не 403.** 403 подтвердил бы существование чужого ресурса (та же логика, что
  user enumeration в auth).

---

## 9. Manual migration #1 — DEFERRABLE unique (чек-лист)

```sql
ALTER TABLE "Phase" ADD CONSTRAINT phase_ws_order_unique
  UNIQUE ("workspaceId", "order") DEFERRABLE INITIALLY DEFERRED;
-- DO NOT let prisma regenerate: DEFERRABLE не выражается в schema.prisma.
```

Обязательны все пять пунктов:

```
[ ] raw SQL миграция с DEFERRABLE INITIALLY DEFERRED
[ ] комментарий-запрет в теле миграции
[ ] запись в ADR (есть: decisions.md → "Manual migration points")
[ ] integration-тест: два дубля order в deferred-транзакции → violation НА COMMIT
[ ] после каждого prisma migrate — проверить, что констрейнт на месте
```

Тест (п.4) — автоматическая версия п.5: человек забудет ревью миграции, тест — нет. Он краснеет, если
Prisma молча пересоздала констрейнт без DEFERRABLE.

**Зачем DEFERRABLE:** перенумерация в транзакции временно создаёт дубли `order`; при обычном UNIQUE это
упало бы в середине. DEFERRABLE проверяет на COMMIT, когда порядок уже целостен → и жёсткий инвариант,
и безопасная перенумерация.

---

## 10. Дефолтные фазы при создании воркспейса

**РЕШЕНИЕ ЗА АВТОРОМ (продуктовое) — уточнить перед реализацией:**

- **A. Пустая доска.** Формально по PRD FR-BP-2 («No → blank workspace»). Но воркспейс без фаз
  **нежизнеспособен**: `Project.phaseId` обязателен (лид некуда положить), без WON/LOST-фазы статус
  никогда не станет WON. Требует, чтобы фронт сразу вёл «создай первую колонку».
- **B. Дефолтный минимальный набор** в той же транзакции: `Lead (OPEN) → In Progress (OPEN) → Won (WON) →
Lost (LOST)`. Доска сразу рабочая; лишнее юзер удалит/переименует. Блюпринты (M2) заменят этот дефолт
  на богатые наборы.

Если B — транзакция: `Workspace.create` → `Phase.createMany` (order 1..4, key сгенерён) → commit.
Атомарно: доска с половиной фаз недопустима.

---

## 11. Порядок реализации

1. Zod-схемы в `api-schemas` (workspaces + phases).
2. Raw-SQL миграция DEFERRABLE + тест-на-инвариант (§9) — **до** reorder, он на неё опирается.
3. `POST /v1/workspaces` (+ дефолтные фазы, если B) + `GET /v1/workspaces` + `GET /:id`.
4. CASL-guard на org-роли (§8) + тесты «чужая орга → 404», «Member → 403».
5. `POST /phases` (генератор key, order=max+1, version++).
6. `PATCH /phases/:id` (name/color/type; key и order — нельзя).
7. `POST /phases/reorder` (полный порядок, нормализация 1..n, version-конфликт → 409).
8. `DELETE /phases/:id` (перенос + перенумерация + version++).
9. `PATCH`/`DELETE` workspace.

Каждый шаг — с тестами. Приоритет негативным и конкурентным путям (как в auth).

---

## 12. Тестирование — что покрыть обязательно

- **Инвариант DEFERRABLE** (§9) — тест-страж от регрессии констрейнта.
- **Reorder:** happy path (1..n плотные) · неполный набор → 400 · чужая фаза → 400 ·
  **устаревший version → 409** · **lost-update сценарий из §4** (A читает, B создаёт, A шлёт reorder → 409).
- **version++ на create/delete** (не только reorder) — иначе §4 дыра вернётся.
- **Генератор key:** коллизия → `-2` · пустой слаг (эмодзи/CJK) → `phase` · кириллица → транслит.
- **Удаление фазы:** пустая → ок · непустая без `reassignTo` → 409 + кандидаты в details ·
  с `reassignTo` → проекты переехали, order уплотнился.
- **Tenant/authz:** чужой воркспейс по прямому id → **404** · Member на мутации → 403 ·
  `orgId` из тела игнорируется (берётся из контекста).
- **Плотность order** после каждой операции (create/delete/reorder) — 1..n без дырок.
