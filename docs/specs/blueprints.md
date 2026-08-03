# docs/specs/blueprints.md — Blueprints (M2, этап 3)

> **Назначение.** Реализационная спека третьего, финального среза M2. Claude Code читает перед
> кодом. Решения зафиксированы с обоснованием — **не разворачивать обратно** без флага.
> Соблюдать `CLAUDE.md`, `docs/decisions.md` (P1 — «blueprint-ссылки → key»), `workspaces-phases.md`
> (инстанцирование фаз, дефолт-транзакция), `custom-fields.md` (этап 1, `FieldDefinition`),
> `notifications.md` (этап 2, куда целится `notificationDefaults`).
>
> **Зачем этот срез последним.** Инстанцировать `projectFields[]` нечего без CRUD-слоя из этапа 1;
> `notificationDefaults` бессмысленно проектировать раньше живого email-пайплайна из этапа 2. Этот
> срез — конфигурация и UX поверх двух уже готовых труб, не третья труба одновременно с ними.

---

## 0. Скоуп

**В скоупе:** `Blueprint` CRUD (список с фильтром по `audience`, создание из существующего воркспейса —
FR-BP-4) · инстанцирование воркспейса из блюпринта — **атомарная копия**, не живая ссылка (FR-BP-3) ·
системные (org-независимые) блюпринты + org-private · сидинг системных блюпринтов · RBAC («Manage
blueprints» = O/A, PRD Appendix B).

**Реализуем в `Blueprint.definition` ТОЛЬКО три ключа** (продуктовое решение, зафиксировано в этой
сессии): `phases`, `projectFields`, `notificationDefaults`. PRD-образец определения блюпринта (§7.5)
несёт ещё `pageTemplates`, `kbSeed`, `automations` — они ссылаются на фичи (Pages/KB — M3, automations
— вне вехи вообще), которых физически нет. Схема (§2) **принимает** эти ключи как валидный, но
нереализованный JSON (`z.array(z.unknown()).optional()` / passthrough) — не отбрасывает и не падает на
них, чтобы M3 могла дописать инстанцирование без миграции формата; но инстанцирование (§4) их
**игнорирует**.

**НЕ в скоупе (свои вехи):**
- Инстанцирование `pageTemplates`/`kbSeed`/`automations` — приходит вместе с Pages/KB (M3) и
  автоматизациями (когда бы они ни попали в дорожную карту).
- Версионирование блюпринтов (`version`/`parentBlueprintId`/история ревизий) — в схеме этого поля нет
  и в PRD прямо не требуется; см. §7, почему не добавляем сейчас.
- Превью-изображения (`preview.thumbnail`) как загружаемые файлы — S3/MinIO не подключены до M3;
  на этом срезе `preview` — текстовое описание, без картинки (см. §2).
- Редактирование содержимого блюпринта после создания (`PATCH /v1/blueprints/:id`) — PRD не требует
  редактируемости, только создание (из воркспейса) и использование; создал неправильно — удали,
  сделай заново (тот же принцип минимализма, что несовместимая смена типа поля в `custom-fields.md` §5).

---

## 1. Эндпоинты

| Метод | Путь                              | Роли                              | Назначение                                    |
| ----- | --------------------------------- | ---------------------------------- | ----------------------------------------------- |
| GET   | `/v1/blueprints?audience=B2B`     | все                                 | список: системные + org-private своей орги      |
| POST  | `/v1/blueprints`                  | O/A (**Manage blueprints**, §6)     | сохранить существующий воркспейс как блюпринт   |
| DELETE| `/v1/blueprints/:id`               | O/A, только свои org-private        | удалить org-private блюпринт (§6)               |
| POST  | `/v1/workspaces`                  | O/A/M (как раньше, §3)              | создать воркспейс, **опционально** `blueprintId` |

`POST /v1/workspaces` — существующий эндпоинт (`workspaces-phases.md` §1), не новый; этот срез
добавляет ему необязательный `blueprintId` в теле (§3), поведение без него **не меняется** (текущий
`DEFAULT_PHASES`-путь остаётся дефолтом — обратная совместимость, ноль риска регрессии для M1-флоу).

---

## 2. Контракты (Zod в `api-schemas`)

```
BlueprintPhaseSchema      { key: string, name: LocalizedName, type: PhaseType, order: number }
BlueprintFieldSchema      { key: string, label: LocalizedName, type: FieldType, options?: string[], required?: boolean }
NotificationDefaultsSchema { newLead?: { email: boolean, recipients: ("owner"|"assignees")[] } }

BlueprintDefinitionSchema {
  phases: BlueprintPhaseSchema[],
  projectFields: BlueprintFieldSchema[],
  notificationDefaults?: NotificationDefaultsSchema,
  // Валидны, не реализованы (§0) — принимаем и сохраняем как есть, не типизируем строго:
  pageTemplates?: z.array(z.unknown()),
  kbSeed?: z.array(z.unknown()),
  automations?: z.array(z.unknown()),
}

CreateBlueprintFromWorkspaceSchema { workspaceId: string, name: string, audience: Audience }
BlueprintResponseSchema { id, orgId: string | null, audience, name, definition: BlueprintDefinitionSchema, createdAt }
```

**`preview`** из PRD-образца (`{thumbnail, summary}`) — в этом срезе только `summary` (текстовое
описание для карточки в UI), `thumbnail` не реализуем (§0, нет S3 до M3). Если нужно поле в схеме уже
сейчас — `preview: { summary: string }`, без `thumbnail`, чтобы не заводить nullable-заглушку на
фичу другой вехи.

**`BlueprintPhaseSchema.key`/`BlueprintFieldSchema.key`** — **обязательны** в определении блюпринта
(P1: «blueprint-ссылки → key», `decisions.md`). Инстанцирование **не** генерирует новый `key` по
алгоритму фазы/поля (`workspaces-phases.md` §5) — использует `key` из определения буквально, он уже
человекочитаемый и стабильный by design блюпринта.

---

## 3. Инстанцирование — атомарная копия (FR-BP-3)

Расширяем существующую транзакцию `WorkspacesService.create()` (`workspaces-phases.md`, уже даёт
`Workspace + DEFAULT_PHASES` одной транзакцией):

```
POST /v1/workspaces { name, audience?, blueprintId? }

если blueprintId передан:
  1. найти Blueprint (orgId IS NULL OR orgId = ctx.orgId) AND id = blueprintId — иначе 404
     (чужой org-private блюпринт по прямому id — та же IDOR-логика, что везде: 404, не 403)
  2. в ОДНОЙ транзакции:
     - Workspace.create (audience берём из blueprint.audience, если в запросе не передан явно —
       блюпринт для B2B не должен молча создать MIXED-воркспейс)
     - Phase.createMany из definition.phases (order уже в определении, key — буквально из него)
     - FieldDefinition.createMany из definition.projectFields (аналогично)
     - Workspace.settings.notifications ← definition.notificationDefaults, если задан (§3.1)
если blueprintId НЕ передан:
  — текущее поведение без изменений (DEFAULT_PHASES, workspaces-phases.md §10 решение B)
```

**Копия, не ссылка (FR-BP-3):** после инстанцирования `Workspace.blueprintId` хранит **только id для
происхождения** (уже в схеме, `blueprintId String?`, не FK — «инстанцирование — копия, не живая
ссылка», см. schema.prisma-комментарий). Последующее изменение/удаление `Blueprint` **не должно**
задевать уже созданные из него воркспейсы — раз `blueprintId` не FK, `ON DELETE` вопрос не встаёт
физически: удаление блюпринта просто оставляет висячий, ничем не проверяемый id в
`Workspace.blueprintId` (тот же принцип терпимости к dangling-ссылкам, что `contactRef` и др.).

### 3.1 `notificationDefaults` — решено: материализуем сейчас (вариант B)

Пересмотрено после `decisions.md` (ADR «Project.ownerId дефолтится создателем при create»):
жёсткий дефолт получателей (`notifications.md` §4, owner+assignees) теперь **надёжно осмыслен**
почти всегда — раньше он часто резолвился в «никого», что делало настройку блюпринта неотличимой
от отсутствия настройки. Плюс FR-BP-2 прямо перечисляет notification defaults в списке того, что
инстанцирование обязано скопировать — материализация не добавка сверх PRD, а то, что было
недоделано.

**Механика:** `WorkspacesService.create()` при инстанцировании из блюпринта копирует
`definition.notificationDefaults` в `Workspace.settings.notifications` (существующее bag-поле,
`z.record` — новый typed-контракт не заводим, читаем узкий, заранее известный подключ). Пример
значения: `{ "newLead": { "email": true, "recipients": ["owner","assignees"] } }` — то есть
буквально жёсткий дефолт из `notifications.md`, только теперь явно записан, а не подразумевается.

**`NotificationsService` (`notifications.md` §4) читает так:** есть `settings.notifications.newLead`
у воркспейса лида → берёт `email`/`recipients` оттуда; нет — жёсткий дефолт как раньше (обратная
совместимость с воркспейсами, созданными не из блюпринта, и вообще без этого среза). `recipients`
в M2 — фиксированный набор `("owner"|"assignees")[]`, не произвольные email (произвольные
статические адреса в блюпринте — расширение, не нужное для закрытия FR-BP-2 буквально, не строим
сейчас). `email: false` — воркспейс, инстанцированный из такого блюпринта, вообще не шлёт письма о
новых лидах (например, блюпринт «внутренний backlog» без внешней команды).

**Что не меняется:** per-workspace notification-настройки **вне** блюпринта (FR-NOTIF-4, ручной UI
редактирования `settings.notifications` без пересоздания воркспейса) по-прежнему не в скоупе M2 —
значение попадает в `settings` только через инстанцирование, не через отдельный `PATCH`-эндпоинт.

---

## 4. Системные vs org-private блюпринты

`Blueprint.orgId: String?` — уже в схеме, единственный различитель:
- **`orgId = null`** → системный, виден **всем** оргам, создаётся только сидингом (§5), не через API
  (`POST /v1/blueprints` всегда пишет `orgId = ctx.orgId` — юзер физически не может создать системный
  блюпринт через эндпоинт).
- **`orgId = <org>`** → org-private (FR-BP-4), виден только своей орге.

`GET /v1/blueprints?audience=B2B` → `WHERE (orgId IS NULL OR orgId = ctx.orgId) AND audience = :audience`
— системные и свои org-private в одном списке, тот же принцип, что видимость своих + общих ресурсов
везде в CRM-слое.

---

## 5. Сидинг системных блюпринтов

Не через миграцию (данные, не схема) — расширение `packages/db/prisma/seed.ts` (уже существует,
идемпотентный, заводит демо-юзеров/воркспейс). Добавить туда: 2–4 системных блюпринта (минимум по
одному на B2B и B2C — PRD-таблица §7.5 даёт готовый список фаз/полей как отправную точку), `orgId:
null`, `definition` по контракту §2. Идемпотентность — `upsert` по `(orgId, name)` или фиксированный
`id` (проще для сида: детерминированный `id: "bp-b2b-sales"` и т.п., не `cuid()` — сид должен быть
стабильным между запусками, не плодить дубли).

---

## 6. RBAC — два разных права, не одно

PRD Appendix B разводит их явно, важно не смешать в реализации:

- **«Manage blueprints» (создать/удалить блюпринт, `POST`/`DELETE /v1/blueprints`) = O/A only.**
  Строже, чем работа с воркспейсами (`workspaces-phases.md`: O/A/**M**) — управление библиотекой
  шаблонов организации весомее, чем создание одной доски.
- **Использование блюпринта при создании воркспейса (`blueprintId` в `POST /v1/workspaces`) = та же
  роль, что создание воркспейса вообще, O/A/**M***. Manager, не имеющий права управлять блюпринтами,
  всё равно может **выбрать** существующий при создании доски — это не управление библиотекой, а
  обычное использование готового инструмента.

`DELETE /v1/blueprints/:id` — только свой org-private (`orgId = ctx.orgId`), системные (`orgId =
null`) не удаляются через API вообще (404 на чужой/системный id — не 403, IDOR-логика).

---

## 7. Почему не версионируем блюпринты сейчас

В схеме нет `version`/`parentBlueprintId`/`isLatest`. FR-BP-3 требует только «копия, не живая ссылка»
— это уже гарантировано (§3) без версионирования: воркспейс не отслеживает, из какой **версии**
блюпринта он создан, только факт происхождения (`blueprintId`, инертная строка). Отследить, что
конкретно изменилось в блюпринте с момента инстанцирования конкретного воркспейса — PRD этого не
требует, `decisions.md` не поднимает. Заводить версионирование сейчас — проектировать под гипотетическое
будущее требование (`CLAUDE.md`: не строить структуру спекулятивно). Если понадобится — добавимо
позже (`version Int @default(1)` на существующей таблице, non-breaking).

---

## 8. Порядок реализации

1. Zod-схемы в `api-schemas` (§2) — `BlueprintDefinitionSchema` с `passthrough`/`unknown` на
   нереализованных ключах.
2. `packages/db/prisma/seed.ts` — системные блюпринты (§5), **до** эндпоинтов (иначе `GET
   /blueprints` тестировать не на чем).
3. `GET /v1/blueprints` (список, фильтр audience+orgId, §4).
4. `POST /v1/blueprints` (снапшот текущего воркспейса — читает его `Phase[]`+`FieldDefinition[]`,
   собирает `definition`, RBAC O/A, §6).
5. `DELETE /v1/blueprints/:id` (только org-private).
6. Расширить `WorkspacesService.create()`: `blueprintId` → инстанцирование (§3), включая запись
   `settings.notifications` (§3.1) — согласовать с `notifications.md` §4, который уже умеет её читать.
7. Убедиться, что порядок этапов M2 не сломан: `notifications.md` §4 читает `settings.notifications`
   с самого начала (жёсткий дефолт при пустом значении), этот шаг просто начинает его заполнять.
8. Фронт — после того как бэк целиком протестирован (тот же порядок, что `workspaces-phases.md` §11:
   «фронт после API»): грид блюпринтов с превью в диалоге создания воркспейса, экран «сохранить как
   блюпринт».

---

## 9. Тестирование — что покрыть обязательно

- **Инстанцирование:** `blueprintId` → воркспейс получает ИМЕННО фазы/поля из `definition`, не
  `DEFAULT_PHASES`; `key` фаз/полей — буквально из блюпринта, не сгенерирован заново.
- **Атомарность:** сбой на любом шаге транзакции (например, коллизия `FieldDefinition.key` внутри
  одного блюпринта — сам блюпринт невалиден) → воркспейс не создаётся частично, вся операция откатывается.
- **Без `blueprintId`:** поведение `POST /v1/workspaces` не изменилось (регрессионный тест на
  существующий `DEFAULT_PHASES`-путь).
- **Видимость:** системный блюпринт виден всем оргам · org-private орги A не виден орге B (ни в
  списке, ни по прямому id — 404) · `audience`-фильтр сужает список верно.
- **RBAC (§6):** Manager может инстанцировать существующий блюпринт (создать воркспейс с
  `blueprintId`), но не может `POST`/`DELETE /v1/blueprints` (403) · Member — ни то, ни другое.
- **Save-as-blueprint (FR-BP-4):** снапшот воркспейса с 5 фазами и 3 кастомными полями → блюпринт
  содержит все 8 сущностей с их `key`; последующее изменение исходного воркспейса (переименовать фазу)
  **не** меняет уже сохранённый блюпринт (снапшот, не ссылка — симметрично §3 в обратную сторону).
- **Сидинг:** повторный запуск `seed.ts` не плодит дубли системных блюпринтов (идемпотентность, §5).
- **`notificationDefaults` (§3.1):** блюпринт с `notificationDefaults: {email: false, ...}` →
  инстанцированный воркспейс, новый лид в нём **не** порождает email-job (`notifications.md` §4-тест
  на это же поведение с другой стороны) · блюпринт без `notificationDefaults` → `settings.notifications`
  не заполняется, поведение = жёсткий дефолт · блюпринт с кастомным `recipients: ["owner"]` (без
  `assignees`) → письмо не уходит co-workers'ам, только owner.
