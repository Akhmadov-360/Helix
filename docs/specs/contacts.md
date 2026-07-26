# docs/specs/contacts.md — Contacts / Companies + soft-dedup + merge (M1, срез 3)

> **Назначение.** Реализационная спека. Claude Code читает перед кодом.
> Соблюдать `CLAUDE.md` (Controller→Service→Repository, Zod per-route, envelope, AllExceptionsFilter),
> `docs/decisions.md` (P1–P4, backbone composite-FK, soft dedup), `projects.md` (паттерны move/activity).
> Спека прошла ДВА прохода adversarial review; спорные места помечены **«принято осознанно»**.
> Правки второго прохода: анти-дедлок при merge (§7.4), единый инвариант 410 для погашенных (§7.5),
> событие `contact.merged` (§7.3), честная граница обратимости (§7.7), не-транзакционность хинта (§4.2).

---

## 0. Скоуп

**В скоупе:** CRUD Contact · CRUD Company · soft-dedup хинт по email (lowercase+trim) ·
**merge двух контактов** · tenant-скоуп + composite-FK backbone.

**НЕ в скоупе (свои срезы):** `ProjectContact` / `ProjectAssignee` (связи — следующий срез) ·
merge компаний (только контактов сейчас, см. §7.6) · Task · импорт CSV · дедуп по телефону.

> **Зависимость.** Этот срез идёт ДО `ProjectContact`, но merge (§7) уже обязан корректно
> обращаться с будущими ссылками из `ProjectContact`. Значит форма `ProjectContact` фиксируется
> здесь как контракт, даже если таблица наполняется в следующем срезе.

---

## 1. Модель

Из `schema.prisma` (init-миграция уже содержит `emailNormalized`/`domainNormalized` + индексы —
миграция под них НЕ нужна). Этим срезом добавляется только `mergedIntoId`, `AuditLog` и правки
`onDelete` (D2/D3):

```prisma
model Contact {
  id              String  @id @default(cuid())
  orgId           String
  name            String              // PII
  email           String?             // PII, nullable
  phone           String?             // PII, nullable
  emailNormalized String?             // dedup hint: lower(trim(email)); NULL если email пуст — В СХЕМЕ
  companyId       String?
  mergedIntoId    String?             // D1: NULL = активный; заполнен = смёржен (§7.3)
  // + createdAt / updatedAt

  org        Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  // D3: SetNull — распустили компанию, люди остались. ⚠ composite-FK + orgId NOT NULL → §9.1 эмпирика
  company    Company?     @relation(fields: [companyId, orgId], references: [id, orgId], onDelete: SetNull)
  mergedInto Contact?     @relation("Merge", fields: [mergedIntoId, orgId], references: [id, orgId])
  mergedFrom Contact[]    @relation("Merge")

  @@unique([id, orgId])                        // backbone: цель composite-FK из ProjectContact
  @@index([orgId, emailNormalized])            // dedup-lookup (§4) — В СХЕМЕ
}

model Company {
  id               String  @id @default(cuid())
  orgId            String
  name             String
  domain           String?
  domainNormalized String?             // dedup hint компаний — В СХЕМЕ (зрелее спеки, D4)
  industry         String?
  // + createdAt / updatedAt

  org      Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  contacts Contact[]

  @@unique([id, orgId])                        // backbone
  @@index([orgId, domainNormalized])           // В СХЕМЕ
}

// D5: НОВАЯ сущность. Merge контактов пишет сюда, НЕ в ActivityEvent (§7.3).
// org-scoped, admin-читаемый; ActivityEvent.projectId NOT NULL → merge (вне проекта) туда не ложится.
model AuditLog {
  id        String   @id @default(cuid())
  orgId     String
  actorId   String?                    // кто; SetNull при удалении пользователя (актор мог уйти)
  action    String                     // "contact.merged", …
  payload   Json                       // снапшот (P2/P3): что произошло, без живых FK
  createdAt DateTime @default(now())

  org   Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  actor User?        @relation(fields: [actorId], references: [id], onDelete: SetNull)

  @@index([orgId, createdAt])          // лента аудита org, свежие сверху
  @@index([orgId, action, createdAt])  // фильтр по типу действия
}
```

> **D2 (в `ProjectContact`, срез связей): `onDelete: Restrict`, НЕ Cascade.** Init-схема сейчас
> ставит Cascade — это **тихая потеря данных**: удалил контакт → из сделок молча исчезли строки
> связи (пропал участник сделки). Restrict заставляет оператора сначала отвязать/смёржить — ошибка
> видна как 409, а не обнаруживается через месяц. Правку `ProjectContact.contact` на Restrict внести
> здесь, применить в срезе связей.

Что добавляется этим срезом (миграция):

- `Contact.mergedIntoId String?` + self-relation "Merge" (D1).
- Новая таблица `AuditLog` + 2 индекса (D5).
- `onDelete`: `Contact.company` → SetNull (D3, ⚠ §9.1), `ProjectContact.contact` → Restrict (D2).
- `emailNormalized` / `domainNormalized` / dedup-индексы — **уже в init-схеме, no-op** (D4).

---

## 2. Эндпоинты

| Метод  | Путь                       | Роли  | Назначение                            |
| ------ | -------------------------- | ----- | ------------------------------------- |
| POST   | `/v1/contacts`             | O/A/M | создать (+ dedup-хинт в ответе, §4)   |
| GET    | `/v1/contacts`             | все   | список (keyset-пагинация, фильтры)    |
| GET    | `/v1/contacts/:id`         | все   | карточка                              |
| PATCH  | `/v1/contacts/:id`         | O/A/M | правка (email → пересчёт norm, §4.3)  |
| DELETE | `/v1/contacts/:id`         | O/A   | удалить (см. §6 про ссылки)           |
| GET    | `/v1/contacts/dedup-check` | O/A/M | явная проверка перед созданием (§4.2) |
| POST   | `/v1/contacts/:id/merge`   | O/A   | слить `sourceId` в `:id` (§7)         |
| POST   | `/v1/companies`            | O/A/M | создать                               |
| GET    | `/v1/companies`            | все   | список                                |
| GET    | `/v1/companies/:id`        | все   | карточка (+ контакты)                 |
| PATCH  | `/v1/companies/:id`        | O/A/M | правка                                |
| DELETE | `/v1/companies/:id`        | O/A   | удалить (контакты → companyId NULL)   |

**`orgId` НИКОГДА не из тела/query** — только ALS. **Чужой ресурс → 404, не 403.**
Merge и delete — только O/A (деструктивно), остальное — O/A/M. Member/Viewer — чтение.

---

## 3. Контракты (Zod, `api-schemas`)

```
CreateContactSchema  { name: string(1..), email?: email, phone?: string, companyId?: string }
UpdateContactSchema  { name?, email? | null, phone? | null, companyId? | null }
DedupCheckSchema     { email: email }                        // query
MergeContactSchema   { sourceId: string }                    // тело POST /:id/merge
ContactQuerySchema   { q?: string, companyId?: string, cursorId?, limit? }

CreateCompanySchema  { name: string(1..), domain?: string, industry?: string }
UpdateCompanySchema  { name?, domain? | null, industry? | null }

ContactResponseSchema { id, orgId, name, email, phone, companyId, createdAt, updatedAt }
// emailNormalized НЕ в ответе — внутреннее поле, не контракт (§4.4)
// mergedIntoId НЕ в ответе для активных; всплывает только на 410 (§7.5)
DedupHintSchema       { candidates: [{ id, name, email, companyName? }] }
```

Nullable-семантика PATCH: **`email: null` очищает, отсутствие ключа — не трогает.** Разведение
«очистить» и «не менять» — Zod `.optional().nullable()`, не путать (в JSON `undefined` не
сериализуется, поэтому ключа просто нет).

---

## 4. Soft dedup — хинт, НЕ констрейнт

### 4.1 Почему soft, а не UNIQUE

Два реальных человека могут легально делить один email (общий `info@`, семейный ящик, секретарь на
почте руководителя). UNIQUE превратил бы легальный кейс в отказ. Дедуп — **подсказка оператору**,
решение оставляем человеку. Та же философия, что `rank` не уникален (§4.2 projects): дубль терпим и
лечится (merge, §7), ложный отказ — нет.

### 4.2 Механика

`emailNormalized = lower(trim(email))` — **консервативно, принято осознанно.**

> Gmail-правила (`+tag`, точки в локальной части) отвергнуты: `.` значим на многих корпоративных и
> кастомных доменах, а применять gmail-логику ко всем доменам → **ложные слияния разных людей** —
> в CRM это худший класс бага (потеря данных о клиенте под видом дедупа). lower+trim ловит реальный
> кейс («John@x.com» vs «john@x.com ») без риска ложного позитива.

Два пути подсказки:

- **на создание:** POST возвращает `201 + { contact, dedupHint: { candidates } }` — контакт создан,
  но клиент показывает «возможно, дубль: …». Не блокируем — по §4.1.
- **явная проверка:** `GET /contacts/dedup-check?email=` — до создания, для UX «проверить перед
  сохранением». Возвращает кандидатов, ничего не создаёт.

Lookup: `WHERE orgId = ctx.orgId AND emailNormalized = lower(trim($email)) AND mergedIntoId IS NULL`.
Индекс `[orgId, emailNormalized]` покрывает.

> **Хинт не транзакционно-точен — by design.** `dedup-check` read-only и не берёт блокировок, поэтому
> может кратко вернуть контакт, находящийся в процессе merge (окно между копированием email в target
> и погашением source, §7.2 — оба на миг активны с одним `emailNormalized`). Это допустимо: дедуп —
> подсказка, а не инвариант (§4.1). Важно **назвать** это, а не чинить: транзакционная точность хинта
> не стоит блокировки read-пути. На защите «почему тут гонка?» → «хинт эвентуально-точен намеренно,
> цена точности — лок на чтение, не окупается».

### 4.3 Пересчёт при PATCH

`emailNormalized` — **производное поле, единственный источник истины — `email`**. Любая запись
`email` (create/update/merge) обязана в **той же транзакции** пересчитать `emailNormalized`. Иначе
рассинхрон: сменил email, дедуп ищет по старому.

> Кандидат на generated column (`emailNormalized text GENERATED ALWAYS AS (lower(trim(email)))`) —
> это исключило бы рассинхрон by construction и стало бы **применением того же приёма, что горячие
> поля fields** (manual point из decisions). Но: Postgres generated column не может быть частью
> обычного индекса без ограничений в старых версиях, и Prisma его не выражает → пятый manual point.
> **Принято осознанно: пока обычная колонка + пересчёт в сервисе**, потому что запись email проходит
> ровно через один слой (ContactService), риск рассинхрона мал и покрыт тестом. Перевести в
> generated column — если появится второй путь записи (импорт CSV, M-later).

### 4.4 `emailNormalized` не в ответе API

Внутреннее поле дедупа, не часть доменного контракта. Клиент видит `email`, нормализацию — нет.
Отдавать → соблазн клиента считать дедуп самому и разъехаться с сервером.

---

## 5. B2B / B2C — данные vs представление

`Workspace.audience` (B2B|B2C|MIXED) **не меняет модель** — `Contact` и `Company` существуют всегда,
`Contact.companyId` nullable в любом режиме. audience — правило **валидации на входе и подсказка UI**,
не форма хранения. (Схема поддерживает оба одновременно — decisions.)

> **Тонкость:** сами Contact/Company — org-scoped, НЕ workspace-scoped. `audience` живёт на
> воркспейсе, а контакт — общий по орге (один человек может фигурировать в лидах разных воркспейсов).
> Поэтому в ЭТОМ срезе audience не участвует вообще — он вступит в игру в срезе `ProjectContact`, где
> связь контакта с проектом происходит внутри воркспейса. Здесь только фиксируем: **контакт не знает
> про audience, связь — знает.** Не тащить audience в ContactService.

---

## 6. Удаление и ссылочная целостность

`Contact` будет мишенью FK из `ProjectContact(contactId, orgId)` (следующий срез). Значит удаление
контакта, на который ссылается сделка, — это вопрос уже сейчас, до наполнения таблицы. **Обе строки
ниже — правки init-схемы** (сверка спека↔схема выявила расхождения D2/D3):

- **D2. `onDelete` на `ProjectContact.contact`: `Restrict`** (init-схема ставит `Cascade` — меняем).
  Cascade = тихая потеря участника сделки при удалении контакта. Restrict: нельзя удалить контакт в
  сделке, оператор сначала отвязывает/мёржит; ошибка видна как 409.
- **D3. `Company` delete → `Contact.companyId` = NULL** (`onDelete: SetNull`; init-схема ставит
  `Restrict` — меняем). Компанию распустили — люди остались без работодателя. Restrict запрещал бы
  ликвидацию компании с сотрудниками — чрезмерно.
- **Каскад от `Organization`** — Cascade (удаление орги сносит всё, tenant-boundary; уже в схеме).

> **D3 → §9.1 эмпирика, ОБЯЗАТЕЛЬНА.** Composite-FK `(companyId, orgId) → Company(id, orgId)`. При
> `SetNull` Postgres по стандарту зануляет **обе** колонки, включая `orgId` — а он `NOT NULL` →
> наивный `SET NULL` упадёт (на DDL или на первом удалении). Postgres 15+ умеет
> `ON DELETE SET NULL (companyId)` (подмножество колонок), но **Prisma этот синтаксис не выражает** —
> сгенерит полный `SET NULL`. Почти наверняка → raw SQL, **manual point #5**. Но не верить
> предсказанию: сгенерировать `migrate diff`, посмотреть вывод, при поломке — raw SQL + guard-тест.

---

## 7. Merge двух контактов

Самая содержательная часть среза. `POST /v1/contacts/:targetId/merge { sourceId }` — влить `source`
в `target`, `source` погашается.

### 7.1 Инварианты

- оба контакта — из орги вызывающего (tenant, composite проверка);
- `source ≠ target` (400);
- **и source, И target активны** (`mergedIntoId IS NULL` у обоих) — не только source. Проверять оба
  явно: реализация легко проверит лишь source и пропустит «merge X → уже-смёрженный target». Иначе
  merge цепочкой (409, §7.4);
- всё — в **одной транзакции** (частичный merge = порча данных).

### 7.2 Что происходит с полями

Стратегия **target wins, source заполняет пустоты**:

```
target.email  ??= source.email          // если у target пусто — берём из source
target.phone  ??= source.phone
target.companyId ??= source.companyId
target.name   — остаётся target (не перезаписываем осознанный выбор оператора)
→ пересчитать target.emailNormalized если email изменился (§4.3)
```

> **Принято осознанно:** «умного» слияния конфликтов (оба имеют разный email) в этом срезе нет —
> при конфликте побеждает target, source-значение теряется. Показать оба и дать выбрать — UX-фича
> позже. Сейчас контракт: **target — источник истины, merge не спрашивает.** Оператор выбирает,
> какой контакт target, и этим выражает намерение.
>
> **`companyId` — тоже продуктовое, не «раз пусто, заполним».** target и source могли быть в разных
> компаниях осознанно (один человек — два работодателя, консалтинг). `??=` назначит target компанию
> source ТОЛЬКО при пустом target.companyId. Это правило «target wins», применённое к companyId, а не
> побочный эффект зануления. Композитный FK гарантирует лишь ту же оргу, не «правильность» компании —
> правильность на операторе, выбравшем target.

### 7.3 Что происходит со ссылками — ядро merge

Все FK, указывавшие на `source`, переводятся на `target`:

```
ProjectContact.contactId:  source → target    (в след. срезе таблица есть, контракт — здесь)
  ⚠️ дубль: если target УЖЕ в том же проекте — не создавать вторую строку,
     слить roles: target.roles = union(target.roles, source.roles), source-строку удалить.
  ⚠️ orgId-консистентность: при переносе (UPDATE contactId у НЕ-дубля) строка сохраняет свой orgId,
     меняется только contactId → composite-FK (contactId, orgId) → Contact(id, orgId) обязан
     продолжать держаться. Держится, т.к. target из той же орги (§7.1) — но ПРОВЕРИТЬ тестом, не
     логикой: UPDATE contactId на composite-FK не должен ругнуться.
ProjectContact.ActivityEvent:  НЕ переписываем FK существующих событий проекта — см. §7.5 (P2!)
```

**Merge пишет запись `contact.merged` — в `AuditLog`, НЕ в `ActivityEvent` (P4 — атомарно, в той же tx):**

```json
{
  "action": "contact.merged",
  "schemaVersion": 1,
  "payload": {
    "sourceId": "...",
    "sourceName": "...",
    "sourceEmail": "...",
    "targetId": "...",
    "movedProjectContactIds": ["..."],
    "fieldsFilledFromSource": ["email", "phone"]
  }
}
```

> **Почему `AuditLog`, а не `ActivityEvent` (D5 — разрешение конфликта модели).** `ActivityEvent.projectId`
> — **NOT NULL**: событие по определению принадлежит проекту (лента лида, RBAC проекта). Merge контактов
> происходит **вне какого-либо проекта** — это org-scoped операция над справочником. Событию некуда
> взять `projectId`. Ослаблять `projectId` до nullable ради одного типа — размывать инвариант, на
> который опирается половина запросов ленты. Поэтому merge пишет в **`AuditLog`** (org-scoped,
> admin-читаемый) — сущность, уже разведённую в `projects.md` §6.3 и `decisions.md`: `ActivityEvent` =
> факты о лиде для людей, `AuditLog` = org-уровень, административные действия. `contact.merged` не
> проходит по первому определению и точно проходит по второму. **Merge — первый реальный потребитель
> `AuditLog`.** На защите: адресат события доказывает, что разделение сущностей продумано, а не скопировано.

Зачем снапшот перенесённого: это **след для ручного un-merge** (§7.7). Автоматического отката нет, но
оператор по записи `AuditLog` восстановит, что именно уехало. Третий пример P4 в проекте (после
`project.moved` и атомарности события создания) — merge это мутация, запись аудита неотделима от неё.

`source` не удаляется физически — помечается:

```prisma
model Contact {
  // ...
  mergedIntoId String?                                  // NULL = активный; заполнен = смёржен
  mergedInto   Contact?  @relation("Merge", fields: [mergedIntoId, orgId], references: [id, orgId])
  mergedFrom   Contact[] @relation("Merge")
}
```

Почему soft, а не `DELETE`: (1) частичная обратимость по идентичности — source-строка жива (полная
обратимость связей требует журнала, §7.7); (2) старые ссылки (внешние системы, кэши, уже отправленные
webhook с `contactId`) не превращаются в битые — редирект по `mergedIntoId` (§7.5); (3) аудит — видно,
что слияние было.

### 7.4 Цепочки и гонки

- **Цепочка A→B, потом B→C:** запретить merge контакта, у которого `mergedIntoId` уже стоит (он не
  активен) → 409. Follow-редирект разрешения (§7.5) при чтении и так дотянет A→B→C, но **создавать**
  цепочку нельзя: усложняет инвариант «ровно один хоп».
- **Гонка «два merge в один target одновременно»** — безопасна (оба льют в target, target не
  меняет mergedIntoId).
- **Гонка «source мёржат в двух запросах одновременно»** — оба прочитают `mergedIntoId IS NULL`,
  оба начнут. Защита: `SELECT ... FOR UPDATE` на обоих контактах в начале транзакции. Второй запрос
  увидит уже установленный `mergedIntoId` → 409.

  ⚠️ **АНТИ-ДЕДЛОК — не «сначала target, потом source».** Два встречных merge (`A→B` и `B→A`
  одновременно: двойной клик, retry, две вкладки) при захвате в порядке target→source возьмут блокировки
  крест-накрест и упрутся в `deadlock detected` → 500. Захватывать обе строки **одним запросом в
  детерминированном порядке**:

  ```sql
  SELECT * FROM "Contact"
  WHERE id IN ($target, $source) AND "orgId" = $org
  ORDER BY id           -- фиксированный порядок → встречный merge встаёт в очередь, а не в клинч
  FOR UPDATE;
  ```

  Один запрос, оба ряда, `ORDER BY id`. Постгрес-дедлок здесь — не гипотетика, а прямое следствие
  «логичного» порядка target→source; порядок по id его исключает by construction.

### 7.5 Чтение смёрженного контакта → 410, не 404

`GET /contacts/:id`, где `id` — смёрженный source:

```
410 Gone + { mergedIntoId: "<target>", message: "contact merged" }
```

Не 404 (контакт существовал, ссылка валидна исторически), не молчаливый редирект (клиент должен
узнать, что id устарел, и обновить свою ссылку). 410 — точный HTTP-семантический код «был, стал
недоступен, вот куда смотреть».

**Единый инвариант, а не частные правила: `mergedIntoId IS NOT NULL` → ЛЮБОЙ метод по этому id даёт 410.**

```
GET    смёрженного  → 410 + mergedIntoId
PATCH  смёрженного  → 410 (правь target, не погашенного)
DELETE смёрженного  → 410 (погашенный неизменяем через API; «оживить» — только будущий un-merge)
merge X → смёрженный (как target) → 410/409 (см. §7.1: target тоже проверяется на активность)
```

Один инвариант «погашенный контакт неизменяем через API» проще и надёжнее набора частных правил для
каждого глагола. Реализуется одной проверкой в ContactService на входе любого мутирующего пути.

> **P2 в чистом виде.** Существующие `ActivityEvent` **проектов** (например «контакт X добавлен в
> сделку», записанное в срезе ProjectContact) при merge **не переписываются**: это исторический факт,
> он случился с source. Payload события — снапшот имени (`contactName`), не живой FK, поэтому оно
> **читается и после погашения source**. Переписать FK на target = переписать историю (P2 нарушено).
> Лента показывает, что было, а не текущее состояние. Прямая демонстрация P2 — то же, что «событие
> переживает удаление фазы». (Отдельно от этого merge пишет СВОЮ запись в `AuditLog` — §7.3; это два
> разных потока: неизменяемая история лида vs новый факт админ-аудита.)

### 7.7 Граница обратимости — сказать вслух, не заявлять «merge обратим»

`source` не удалён физически (§7.3) — заманчиво заявить «merge обратим». **Это полуправда:**

```
обратимо:      идентичность source (строка жива), поля target (правятся вручную)
НЕ обратимо:   перенесённые связи — ProjectContact source→target уже переписаны,
               а source-строки, слитые по union roles, УДАЛЕНЫ. Без журнала не восстановить.
```

Честная формулировка на защите: **«merge обратим на уровне идентичности контакта, но НЕ на уровне
перенесённых связей — для полного un-merge нужен merge-journal, отложено».** Запись `contact.merged`
в `AuditLog` (§7.3) со снапшотом `movedProjectContactIds` — половинчатая страховка: не автооткат, но
след, по которому оператор восстановит связи руками. Заявить обратимость без этой оговорки → на защите
вопрос «а связи?» застанет врасплох.

### 7.8 Merge компаний — НЕ в этом срезе

Компании тоже дублируются (домен-хинт есть), но их merge сложнее: у компании есть **дети-контакты**,
перевод которых — отдельная логика с теми же дубль-вопросами. Отложено явно, не забыто. Хинт по
`domain` работает (§2 companies list), merge — позже.

---

## 8. Миграция

> `emailNormalized` / `domainNormalized` + их индексы **уже в init-миграции** — здесь их НЕТ.
> Эта миграция добавляет только D1 (`mergedIntoId`), D5 (`AuditLog`), D2/D3 (`onDelete`).

```sql
-- D1: mergedIntoId + self-FK (mergedIntoId, orgId) → Contact(id, orgId) — генерит Prisma из @relation
ALTER TABLE "Contact" ADD COLUMN "mergedIntoId" text;

-- D5: AuditLog + индексы — генерит Prisma из model AuditLog
CREATE TABLE "AuditLog" (...);
CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog" ("orgId", "createdAt");
CREATE INDEX "AuditLog_orgId_action_createdAt_idx" ON "AuditLog" ("orgId", "action", "createdAt");

-- D2: ProjectContact.contact  Cascade → Restrict (генерит Prisma при смене onDelete)
-- D3: Contact.company  Restrict → SetNull
--     ⚠ composite-FK (companyId, orgId) + orgId NOT NULL. Смотреть, что Prisma сгенерит:
--       если полный SET NULL на оба столбца → УПАДЁТ на orgId NOT NULL.
--       → тогда raw SQL: ALTER TABLE "Contact"
--           DROP CONSTRAINT <fk>,
--           ADD CONSTRAINT <fk> FOREIGN KEY ("companyId","orgId") REFERENCES "Company"("id","orgId")
--             ON DELETE SET NULL;   -- PG зануляет только nullable-колонку из набора? ПРОВЕРИТЬ (§9.1)
--       если и это не даёт нужного поведения → SET NULL (companyId) [PG15+] — manual point #5.
```

> **Порядок эмпирики (§9.1) — до написания сервисов.** Сгенерировать `prisma migrate dev`, прочитать
> `.sql`, руками проверить на тестовой БД: `DELETE FROM "Company" WHERE id=…` при живом контакте →
> `companyId` занулён, `orgId` цел, контакт жив. Если Prisma сгенерила падающий SET NULL — raw SQL +
> комментарий-запрет + guard-тест (по образцу manual points #1–#4). Зафиксировать в `decisions.md`,
> стал ли это #5.

> **Блокировки на объёме.** `CREATE TABLE`/`ADD COLUMN` без volatile default — метаданные, мгновенно.
> Смена `onDelete` пересоздаёт constraint (`DROP`+`ADD FK`), `ADD FK` берёт `SHARE ROW EXCLUSIVE` и
> **валидирует существующие строки** — на непустой таблице блокирует запись. Сейчас `ProjectContact`
> пуст, `Contact` мал → не укусит. На объёме: `ADD CONSTRAINT ... NOT VALID` + отдельный `VALIDATE
CONSTRAINT`. Это тот же zero-downtime-вопрос, что панель проверяет; держим формулировку наготове.

---

## 9. Порядок реализации

1. **Эмпирика §9.1 — ДО кода:** сгенерировать миграцию с D3 (`Contact.company` SetNull на composite-FK),
   прочитать `.sql`, проверить на тестовой БД удаление компании при живом контакте. Зафиксировать,
   стал ли это manual point #5 (raw SQL) → в `decisions.md`.
2. Миграция: D1 (`mergedIntoId` + self-relation) + D5 (`AuditLog`) + D2 (Restrict) + D3 (SetNull, по
   результату §9.1). `emailNormalized`/`domainNormalized` — уже в init, не трогаем.
3. Zod-контракты (`contacts.ts`, `companies.ts`).
4. Company CRUD (проще, без дедупа) — как разминка.
5. Contact CRUD + пересчёт `emailNormalized` в той же транзакции при записи `email` (§4.3).
6. Dedup: `dedup-check` эндпоинт + хинт в ответе POST.
7. Merge: транзакция, `FOR UPDATE ... ORDER BY id` (анти-дедлок), поля (target wins), soft-погашение,
   запись `AuditLog contact.merged`, единый 410 на любой мутирующий метод по смёрженному.
8. Delete-семантика: guard-тесты D2 (Restrict от ProjectContact — контракт след. среза) и D3 (Company
   delete → контакты `companyId=NULL`, `orgId` цел).

Каждый шаг — с тестами, приоритет негативным/конкурентным путям.

---

## 10. Тестирование

**Dedup**

- `John@X.com` и `john@x.com  ` → один `emailNormalized` → хинт находит;
- разные домены с точками (`j.doe@corp.com` vs `jdoe@corp.com`) → **разные** (страж от gmail-логики);
- email NULL → `emailNormalized` NULL, в дедуп-lookup не участвует;
- два контакта с одним email создаются оба (хинт не блокирует, §4.1);
- PATCH email → `emailNormalized` пересчитан в той же транзакции (страж §4.3);
- `emailNormalized` отсутствует в теле ответа (страж §4.4).

**Merge — ядро**

- поля: target пустой email + source с email → target получает email + пересчёт norm;
- поля: оба с разным email → target побеждает, source-email теряется (страж §7.2 «осознанно»);
- поля: разные companyId, target пустой → берёт source; target заполнен → остаётся target (§7.2);
- soft-погашение: source.mergedIntoId = target, физически не удалён;
- запись `AuditLog` с `action='contact.merged'` создана **в той же транзакции**, payload содержит
  `movedProjectContactIds`, `sourceName`, `targetId` (страж §7.3, P4); откат merge-транзакции →
  записи в AuditLog нет;
- merge НЕ пишет в `ActivityEvent` (страж разделения сущностей D5/§7.3);
- **единый 410:** `GET` / `PATCH` / `DELETE` смёрженного source → **410** + mergedIntoId
  (не 404, не 200 — страж §7.5);
- merge X → смёрженный target → отказ (target проверен на активность, страж §7.1);
- ActivityEvent source читается после merge (страж P2, §7.5);
- ProjectContact-редирект: source в проекте → после merge target в проекте, дублей нет, roles union;
  **orgId строки консистентен после переноса** (composite-FK держится, страж §7.3) — тест-заготовка
  для след. среза;
- цепочка: merge уже-смёрженного (как source ИЛИ как target) → 409 (страж §7.4);
- гонка: два параллельных merge одного source → один успех, второй 409 (FOR UPDATE);
- **анти-дедлок:** встречные `A→B` и `B→A` одновременно → НЕ `deadlock detected`/500; один успех,
  второй 409 (страж §7.4 `ORDER BY id`);
- tenant: source и target из разных орг → 404; merge чужого → 404.

**Delete / целостность**

- Company delete → её контакты получают `companyId = NULL`, не удаляются;
- Contact delete при наличии ProjectContact → Restrict → 409 (контракт след. среза);
- каскад Organization сносит контакты и компании.

**Tenant / roles**

- Member на POST contact → 201; Member на merge → 403 (только O/A);
- `orgId` из тела игнорируется, берётся из ALS;
- чужой контакт по прямому id → 404.
