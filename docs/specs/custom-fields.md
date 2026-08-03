# docs/specs/custom-fields.md — Custom Fields / `FieldDefinition` (M2, этап 1)

> **Назначение.** Реализационная спека первого среза M2. Claude Code читает перед кодом.
> Решения зафиксированы с обоснованием — **не разворачивать обратно** без флага.
> Соблюдать `CLAUDE.md` (Controller→Service→Repository, Zod per-route, envelope, AllExceptionsFilter)
> и `docs/decisions.md` (P1–P4, «Custom fields — трёхуровневая модель», manual migration point #2).
>
> **Зачем этот срез первым в M2.** Blueprints (`docs/specs/blueprints.md`, этап 3) инстанцируют
> `projectFields[]` в `FieldDefinition[]` нового воркспейса — блюпринт физически нечего инстанцировать,
> пока CRUD и валидация полей не существуют. Custom Fields — фундамент, не витрина.

---

## 0. Скоуп

**В скоупе:** CRUD `FieldDefinition` (создать/список/переименовать/удалить) · генератор `key` (переиспользует
алгоритм `Phase.key`, `workspaces-phases.md` §5) · Zod-валидация `Project.fields` по актуальному набору
`FieldDefinition[]` воркспейса на create/update лида · ограниченный набор «совместимых» смен типа ·
CASL-guard (те же роли, что «Create/configure workspaces & phases», Appendix B PRD).

**НЕ в скоупе (свои вехи или сознательно урезано):**
- Generated column + btree под range-фильтр «горячих» полей (`decisions.md`, manual migration point #2) —
  строим **только когда** конкретное поле доказанно горячее (жалоба на медленный фильтр), не заранее.
- `FieldReferenceValue` с настоящим FK для `contactRef`/`companyRef`/`userRef` — эскейп-хетч из
  `decisions.md`, не нужен, пока dangling-ссылки не стали проблемой на практике.
- Per-workspace partial unique index на произвольном custom-поле — `decisions.md` явно не гарантирует.
- Отображение полей в UI Блюпринтов/Pages — приходит вместе с этими фичами (этап 3 и M3).

---

## 1. Эндпоинты

| Метод  | Путь                                  | Роли  | Назначение                                    |
| ------ | ------------------------------------- | ----- | ---------------------------------------------- |
| POST   | `/v1/workspaces/:id/fields`           | O/A/M | создать поле (всегда в конец списка, §3)       |
| GET    | `/v1/workspaces/:id/fields`           | все   | список полей воркспейса (упорядоченные)        |
| PATCH  | `/v1/fields/:id`                      | O/A/M | label / required / options / **type** (§5)     |
| DELETE | `/v1/fields/:id`                      | O/A/M | удалить поле (§6, значения в лидах не трогает) |

Роли: те же, что «Create/configure workspaces & phases» (Appendix B PRD) — O=OWNER, A=ADMIN,
M=MANAGER. Явной строки «custom fields» в PRD-матрице нет — поля это конфигурация воркспейса,
та же категория прав, что фазы (`workspaces-phases.md` §1).

**`orgId`/`workspaceId`-тенант** — тот же паттерн, что Phase: чужой воркспейс по прямому id → 404
(не 403, IDOR-логика `workspaces-phases.md` §8), `orgId` только из токена.

---

## 2. Контракты (Zod в `api-schemas`, schema-first)

```
CreateFieldDefinitionSchema { label: LocalizedName, type: FieldType, options?: string[], required?: boolean (default false) }
UpdateFieldDefinitionSchema { label?: LocalizedName, options?: string[], required?: boolean, type?: FieldType }
FieldDefinitionResponseSchema { id, workspaceId, key, label, type, options, required }
```

`label` — `LocalizedName` (как `Phase.name`, не `Workspace.name`): поле показывается пользователю,
локализация уместна. `type` **не редактируется по умолчанию** — `PATCH` принимает `type` только если
переход входит в allow-list §5, иначе 400 `INCOMPATIBLE_FIELD_TYPE_CHANGE`.

`options` обязателен (непустой массив строк) для `type: select | multiselect`, отсутствует/игнорируется
для остальных типов — валидируется `superRefine` в Zod-схеме (тот же приём, что `dealRoleSchema`
замкнутого enum, `decisions.md` ADR DealRole).

---

## 3. Генератор `key` — переиспользуем алгоритм Phase, не пишем новый

`FieldDefinition.key` — тот же контракт, что `Phase.key` (`workspaces-phases.md` §5): иммутабельный
слаг из `label`, транслит кириллицы, fallback `"field"` на пустой слаг (эмодзи/CJK), суффикс `-2`, `-3`
на коллизию в пределах `@@unique([workspaceId, key])`. **Не редактируется** после создания — на него
завязана валидация `Project.fields` (§6) и (позже) blueprint-ссылки (P1: «blueprint-ссылки → key»).

Порядок полей — `order`-подобного поля в схеме сейчас нет (`FieldDefinition` не хранит `order`); список
отдаётся в порядке создания (`orderBy: { id: "asc" }`, как `findDedupCandidates` и другие списки в CRM-
модуле). Если понадобится ручной reorder полей — отдельный срез (та же механика, что `phases/reorder`),
сейчас не запрашивается ни PRD, ни UX Блюпринтов.

---

## 4. Валидация значения по типу (`options`, границы)

| `type`                       | Zod для значения в `Project.fields[key]`                          |
| ----------------------------- | ------------------------------------------------------------------- |
| `text` / `longtext`           | `string`                                                             |
| `number` / `currency`         | `number` (currency — как `Project.value`, без встроенной ISO-4217; сама валюта не хранится на поле, только сумма) |
| `date` / `datetime`           | ISO-строка (`z.iso.date()` / `z.iso.datetime()`)                     |
| `boolean`                     | `boolean`                                                            |
| `select`                      | `string`, обязана входить в `FieldDefinition.options`                |
| `multiselect`                 | `string[]`, каждый элемент — в `options`                             |
| `url` / `email` / `phone`     | `string` + формат (`z.url()` / `z.email()`; `phone` — свободная строка, как `Contact.phone`) |
| `contactRef` / `companyRef` / `userRef` | `string` (id). **Целостность — на уровне приложения, не FK** (`decisions.md`): dangling id тератируем, резолвится в «удалён» при рендере. Ссылка — на `id`, не на `name` (P1). |

Каждое отдельное значение в Zod-схеме опционально по своей природе (пусто = не задано); **обязательность
на уровне набора** — по `FieldDefinition.required`, см. §7 (решено). Лишние ключи (не входящие в текущий
`FieldDefinition[]` воркспейса) **отбрасываются**, не 400: смена набора полей не должна ломать уже
летящие запросы с устаревшей формой (мягкая деградация формы, при этом требуемость — строгая, §7).

---

## 5. Смена типа поля — allow-list, не эвристика

`decisions.md`: «несовместимую (number→date) запрещаю; безопасную (number→text) — разрешаю».
Явный allow-list вместо эвристики (тот же стиль, что `DealRole`-enum вместо свободной строки —
замкнутое множество проще стеречь и объяснить на защите):

**Разрешено** (сужение до строки, данные не теряют смысл): `number → text`, `currency → text`,
`date → text`, `datetime → text`, `boolean → text`, `url → text`, `email → text`, `phone → text`,
`text → longtext`.

**Запрещено всё остальное**, в частности: `text → number` (свободный текст мог не парситься),
`select ↔ multiselect` (форма значения меняется: скаляр ↔ массив), любые переходы **из/в**
`contactRef`/`companyRef`/`userRef` (референс — не то же самое, что скаляр).

Хочешь несовместимую смену — **создай новое поле** (новый `key`), старое удали (§6). Старые значения
остаются в JSON под старым `key` как безвредный сирота (тот же принцип терпимости, что dangling
`contactRef`, §4) — отдельного механизма «архивации» поля не заводим (не золотить: FieldDefinition не
получает `archivedAt` ради одного редкого сценария).

---

## 6. Удаление поля — не трогает уже записанные значения

`DELETE /v1/fields/:id` удаляет строку `FieldDefinition`. **Не** каскадно чистит `Project.fields[key]`
у существующих лидов — те значения становятся безвредным сиротой в JSON (P3-логика: значение того же
масштаба, что и остальной `fields`, не отдельная сущность требующая cleanup-джобы). Рендер на фронте
просто перестаёт показывать это поле (нет `FieldDefinition` — нечего резолвить).

Удаление **не блокируется** наличием данных («поле используется в N лидах») — сознательно не строим
эту проверку в v1 (стоила бы отдельного COUNT-запроса ради предупреждения, которое не меняет решение:
GDPR/cleanup всё равно не в скоупе M2).

---

## 7. `required` enforcement — решено: жёсткий backend (вариант B)

**Решение автора:** сервер обязан отвергать запрос, если у воркспейса есть `required: true` поля
без значения — не полагаемся на UI-звёздочку. Причины: «обязательное» должно значить обязательное
на **обоих** концах контракта (фронт и API — единый источник правды, не два независимых мнения о
том, что required); ошибка видна сразу при создании, а не превращается в дыру в данных, которую
заметят через неделю на отчёте. Реализация небольшая (~20 строк) — не оправдывает более слабый вариант.

**Механика:**

- **`POST /v1/projects`** — после сборки итогового `fields` (входные + дефолты) проверить: для
  каждого `FieldDefinition{workspaceId, required: true}` соответствующий `key` присутствует и
  проходит type-валидацию (§4). Не хватает хотя бы одного → **400 `MISSING_REQUIRED_FIELDS`**,
  `details: { keys: string[] }` — тот же паттерн, что `PHASE_NOT_EMPTY` (ошибка называет, чего не
  хватает, а не просто «невалидно»).
- **`PATCH /v1/projects/:id`** — enforcement применяется, **только если запрос трогает `fields`**
  (ключ `fields` присутствует в теле PATCH). Если `fields` не передан — остальные поля (title/value/…)
  обновляются без пересчёта required (нельзя случайно потребовать дозаполнить старый лид патчем,
  который к custom-полям не имеет отношения). Если `fields` передан — **результирующий** объединённый
  набор (существующие значения + патч) обязан по-прежнему satisфy required — нельзя явным `null`
  стереть обязательное значение.
- **Публичный intake (M5, `POST /v1/public/leads`)** унаследует то же правило автоматически (тот же
  сервисный метод `create`) — держать в уме при проектировании M5: внешний вызывающий обязан знать
  текущий набор required-полей воркспейса заранее (`GET /v1/workspaces/:id/fields` уже отдаёт
  `required`), иначе получит 400. Не переделка сейчас, просто заметка на будущее.

---

## 8. `ActivityEvent` НЕ пишется на CRUD полей

Та же логика, что `workspaces-phases.md` §7: создание/переименование/удаление `FieldDefinition` —
конфигурация воркспейса, не факт о конкретном лиде. `ActivityEvent` требует `projectId`. Место для
такого события (если вообще нужно) — `AuditLog` (M6, org-scoped).

**Исключение уже описано в §7 workspaces-phases.md по аналогии:** если когда-нибудь появится факт
«значение custom-поля лида изменено» — это событие **проекта** (`project.field_changed`), не поля;
сейчас `Project.fields` обновляется как часть обычного `PATCH /v1/projects/:id`, отдельного эндпоинта
под custom-поля лида не заводим (то же поле, что title/value — не второй путь записи).

---

## 9. Authz

Тот же паттерн, что Phase (`workspaces-phases.md` §8): права по org-роли из `Membership`,
`WorkspaceMember`-override по-прежнему не используется (M6), скоуп — tenant-фильтр на каждом лукапе,
чужой ресурс → 404.

---

## 10. Порядок реализации

1. Zod-схемы в `api-schemas` (`CreateFieldDefinitionSchema`/`UpdateFieldDefinitionSchema`/
   `FieldDefinitionResponseSchema`), включая `superRefine` для `options` (§2) и type-value валидацию (§4)
   как переиспользуемый билдер `projectFieldsSchema(definitions: FieldDefinitionResponse[])` — динамическая
   Zod-схема, собранная из текущего набора полей воркспейса (нужна и `POST /projects`, и `PATCH /projects/:id`).
2. `POST /v1/workspaces/:id/fields` (генератор `key`, §3) + `GET /v1/workspaces/:id/fields`.
3. `PATCH /v1/fields/:id` (label/required/options свободно; `type` — только allow-list §5, иначе 400).
4. `DELETE /v1/fields/:id` (§6, без каскада).
5. Подключить `projectFieldsSchema` в `ProjectsService.create`/`update` — заменить голый `z.record` (если
   он там был) на схему, собранную из `FieldDefinition[]` воркспейса на момент запроса.
6. `MISSING_REQUIRED_FIELDS`-проверка в `ProjectsService.create`/`update` (§7) — правило зафиксировано,
   реализуется вместе с шагом 5 (тот же метод собирает и валидирует `fields`).

---

## 11. Тестирование — что покрыть обязательно

- **Генератор key:** коллизия → `-2` (переиспользует уже протестированный алгоритм Phase — доп. тест
  только на факт переиспользования, не дублировать полный набор кейсов).
- **Type-value валидация (§4):** каждый `FieldType` — валидное и невалидное значение; `select`/
  `multiselect` — значение вне `options` → 400; лишний ключ (не в `FieldDefinition[]`) — отбрасывается,
  не 400 (§4).
- **Смена типа (§5):** разрешённый переход (`number→text`) → 200, данные не потеряны; запрещённый
  (`text→number`, `select→multiselect`, любой `*Ref`) → 400 `INCOMPATIBLE_FIELD_TYPE_CHANGE`.
- **Удаление поля:** лид с непустым значением этого поля до удаления → после удаления `GET /fields`
  поля нет, `GET /projects/:id` данные лида не падают (сирота в JSON, не рендерится).
- **Required (§7):** create без значения required-поля → 400 `MISSING_REQUIRED_FIELDS` со списком `key`
  в `details` · create со всеми required-полями → 200 · `PATCH` без ключа `fields` в теле — не триггерит
  проверку (title-only патч на лид с незаполненным required проходит) · `PATCH {fields:{...}}`,
  пытающийся обнулить required-значение (`null`) → 400.
- **Tenant/authz:** чужой воркспейс по прямому id → 404 · Member на мутации → 403.
- **`referential` типы (`contactRef` и т.п.):** dangling id (контакт удалён/смёржен) не валит валидацию
  на записи — только резолв на чтении может вернуть «удалён» (это уже поведение `Contact`/`Company`
  merge-логики, не новый код здесь).
