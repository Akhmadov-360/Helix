# docs/specs/project-links.md — ProjectContact + ProjectAssignee + reassign (M1, срез 4)

> **Назначение.** Реализационная спека. Claude Code читает перед кодом.
> Соблюдать `CLAUDE.md`, `docs/decisions.md` (P1–P4, backbone, RBAC две оси, DealRole ADR),
> `projects.md` (move/activity), `contacts.md` (merge-редирект, D2 Restrict).
> Спека прошла adversarial review; спорное помечено **«принято осознанно»**.
>
> **Этот срез замыкает три висящих контракта:** merge-редирект оживает на живых `ProjectContact`;
> `audience` впервые валидируется; `reassign` закрывает field-level дыру `ownerId` в PATCH.

---

## 0. Скоуп

**В скоупе:** `ProjectContact` CRUD (привязать/отвязать контакт к сделке, роли) · `ProjectAssignee`
CRUD (co-workers) · `reassign` (смена `ownerId`, вынос из PATCH) · `audience`-валидация связей ·
верификация merge-редиректа на живых данных.

**НЕ в скоупе:** `Task` (срез 5) · per-workspace `RoleDefinition` (ADR: триггер — второй
несовместимый audience) · visibility-scope `ASSIGNED` (M6) · Company-как-B2B-account CRUD (уже есть
из contacts) · фронт.

---

## 1. Модель (из schema.prisma — данность, ревью не трогает)

```prisma
model ProjectContact {
  projectId String
  contactId String
  orgId     String                          // tenant-мост
  roles     DealRole[]                       // enum-массив (ADR); НЕ String[]

  project Project @relation(fields: [projectId, orgId], references: [id, orgId], onDelete: Cascade)
  contact Contact @relation(fields: [contactId, orgId], references: [id, orgId], onDelete: Restrict) // D2
  @@id([projectId, contactId])              // естественный PK — контакт в сделке максимум один раз
  @@index([contactId, orgId])               // merge-редирект: найти все сделки контакта
}

model ProjectAssignee {
  projectId String
  userId    String
  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([projectId, userId])
}

enum DealRole { CHAMPION DECISION_MAKER ECONOMIC_BUYER TECHNICAL_BUYER INFLUENCER BLOCKER }
```

> **Асимметрия onDelete осознанна.** `ProjectContact.contact = Restrict` (D2: контакт в сделке не
> удалить молча — участник сделки ценен). `ProjectContact.project = Cascade` (удалили сделку — связи
> с ней бессмысленны). `ProjectAssignee` обе Cascade (назначение — не ценность, а метка доступа).
> Разница: контакт существует **вне** сделки (справочник), assignee — только **внутри**.

---

## 2. Эндпоинты

| Метод  | Путь                                   | Мин. роль | Действие                   |
| ------ | -------------------------------------- | --------- | -------------------------- |
| GET    | `/v1/projects/:id/contacts`            | все       | контакты сделки + их роли  |
| POST   | `/v1/projects/:id/contacts`            | Member+   | привязать контакт (+роли)  |
| PATCH  | `/v1/projects/:id/contacts/:contactId` | Member+   | изменить роли связи        |
| DELETE | `/v1/projects/:id/contacts/:contactId` | Member+   | отвязать контакт от сделки |
| GET    | `/v1/projects/:id/assignees`           | все       | co-workers сделки          |
| POST   | `/v1/projects/:id/assignees`           | Manager+  | назначить co-worker        |
| DELETE | `/v1/projects/:id/assignees/:userId`   | Manager+  | снять co-worker            |
| POST   | `/v1/projects/:id/reassign`            | Manager+  | сменить `ownerId` (§6)     |

**Роли по матрице (decisions.md RBAC):**

- **Привязка контакта = Member+.** Это часть «edit leads» (`△` Member): работа с составом сделки —
  рутина агента. Capability=allow, scope=ORG в M1 (сужение до ASSIGNED — M6).
- **Assignee + reassign = Manager+.** Это `Reassign leads` (`—` Member по PRD): назначение
  ответственных — управленческое действие, не рядовое. Consistency: и owner (reassign), и co-workers
  (assignee) — одна модель прав, оба Manager+, оба отдельные action (не поля в PATCH).

`orgId` — только из токена (`request.auth`). Чужой проект/контакт по прямому id → **404**.

---

## 3. Контракты (Zod, api-schemas)

```
LinkContactSchema    { contactId: string, roles: DealRole[] (min 0) }
UpdateLinkSchema     { roles: DealRole[] }                    // полная замена набора ролей
AssignSchema         { userId: string }
ReassignSchema       { ownerId: string | null }              // null = снять владельца

ProjectContactResponse { contactId, name, email, companyName?, roles: DealRole[] }
```

`roles` — `DealRole[]` из общего `deal-roles.ts` (ADR action item). **Zod refinement:** роли валидны
для `audience` воркспейса (§4). Пустой массив ролей допустим (контакт привязан, роль не назначена).

---

## 4. audience — recommendation model (НЕ validation)

Первое реальное применение `audience` (contacts.md §5 фиксировал принцип, здесь он работает).

> **Терминология — важно.** Это **recommendation model, а не validation.** `validRolesFor(audience)`
> ничего не **отклоняет** — оно ранжирует/подсказывает. Называть это «валидацией» — ложь в имени:
> валидация подразумевает отказ (400), которого тут нет. Функция сегодня: **питать UI-подсказки**
> (подсветить уместные для audience роли) и **держать точку ужесточения готовой** — когда/если
> методология станет строгой, 400 вешается сюда, не переписывая модель. Two things it does today:
> (1) UI hint, (2) существующая точка расширения. Ничего сверх этого — by design.

`Workspace.audience ∈ {B2B, B2C}`. Контакт и Company существуют в любом режиме (схема оба держит).
audience — **рекомендация на входе связи**, не правило и не форма хранения:

```
B2B-воркспейс:
  - привязка контакта → UI рекомендует указать Company (сделка с организацией);
  - рекомендованные роли: полный набор (комитет по закупке).
B2C-воркспейс:
  - Company не ожидается (частное лицо);
  - рекомендованные роли: подмножество (DECISION_MAKER вырождается — один человек);
  - BLOCKER/ECONOMIC_BUYER на B2C-лид → РАЗРЕШЕНО (recommendation, не gate).
```

> **Почему recommendation, а не gate (принято осознанно).** Методология не строгая — B2C-сделка с
> семьёй реально имеет двух DECISION_MAKER. Жёсткий 400 превратил бы гибкость в баг-репорт. То же
> «дубль/нестандарт терпим, отказ пользователю — нет», что в dedup/rank. Ужесточить — если продукт
> потребует строгой методологии.

**Жёстко (validation):** роль ∈ enum `DealRole` (Zod, 400 при нарушении).
**Мягко (recommendation):** уместна ли роль для audience — hint для UI, никогда не 400.

---

## 5. Привязка контакта — инварианты

```
POST /v1/projects/:id/contacts { contactId, roles }
```

Проверки (в порядке, каждая — свой код):

```
проект существует и мой (orgId)                    → 404
контакт существует и мой (orgId)                   → 404
контакт НЕ смёржен (mergedIntoId IS NULL)          → 409 (§5.1!)
контакт ещё не привязан к этому проекту            → 409 (PK-конфликт, идемпотентность §5.2)
roles ⊆ DealRole enum                              → 400 (Zod)
```

Composite-FK `(contactId, orgId)` и `(projectId, orgId)` гарантируют tenant на уровне БД — сервис
превращает FK-violation в 404/409, не 500.

### 5.1 Нельзя привязать смёрженный контакт

Прямое следствие merge (contacts.md §7.5: смёрженный контакт неизменяем, 410 на мутации). Привязка
смёрженного = привязка «мёртвого» id. Проверка `mergedIntoId IS NULL` **до** вставки → 409 с
подсказкой «контакт слит в <target>, привяжите target». Иначе сделка ссылается на погашенный контакт.

### 5.2 Идемпотентность привязки

PK `(projectId, contactId)` → повторная привязка того же контакта = конфликт. Два варианта:

- **409** — «уже привязан» (строгая семантика);
- **upsert ролей** — повторный POST мёржит роли (мягкая).

**Принято: 409 на POST, изменение ролей — через PATCH.** POST создаёт связь, PATCH меняет.

> **Почему POST ≠ UPSERT (осознанно, API неидемпотентен — это ок).** Создание связи и изменение
> связи — **разные бизнес-операции**, как move ≠ PATCH и reassign ≠ PATCH по всему проекту. Да, клиент
> «добавить роль к существующей связи» делает PATCH, а не POST — API становится неидемпотентным на
> POST. Это сознательный контракт: идемпотентный upsert смешал бы «привязать» и «переназначить роли»
> в один глагол и скрыл бы, какое из двух намерений у клиента. Разделение глаголов > идемпотентность.
>
> **Пустой массив ролей = «контакт участвует, роль пока неизвестна» (валидное состояние).** `roles=[]`
> и на POST, и на PATCH допустим и осмыслен: агент привязал человека к сделке, но ещё не определил его
> роль в комитете. Не трактовать пустой массив как ошибку — это легальное промежуточное состояние.

---

## 6. reassign — вынос ownerId из PATCH (закрытие field-level дыры)

### 6.1 Проблема (из ревизии RBAC)

`edit Project = Member+`, но `Reassign leads = Manager+`. `ownerId` — поле Project. Action-level CASL
не видит полей → Member через `PATCH {ownerId}` выполнял бы Manager-операцию. Хуже: в M6 (scope=
ASSIGNED) Member, переназначив `ownerId` на себя, **присвоил бы лид вне своего scope** — field-level
дыра M1 становится обходом visibility в M6. Две оperiси смыкаются в уязвимость.

### 6.2 Решение

```
ownerId ВЫЧИЩАЕТСЯ из UpdateProjectSchema — PATCH его больше не принимает.
POST /v1/projects/:id/reassign { ownerId }   под can('reassign','Project')  (Manager+)
```

Тот же паттерн, что `move` и `status`: операция с иными правами/семантикой = отдельный action+эндпоинт,
не поле в общем update. `move` — прецедент, `reassign` — второй случай, `status` — третий (уже
защищён). **ADR-правило:** поле, смена которого требует роли выше общего update, выносится в action.

### 6.3 Инварианты reassign

```
новый ownerId — пользователь МОЕЙ орги (Membership существует)   → 400 если нет
ownerId = null → снять владельца (лид без owner допустим?)        → см. ниже
пишем ActivityEvent project.reassigned (P4, есть projectId)      → в ленту, не AuditLog
```

> **`owner = null` — именованное бизнес-состояние, НЕ случайность схемы.** `ownerId String?` легален
> не потому, что «забыли NOT NULL», а потому что «лид без владельца» — реальное состояние жизненного
> цикла: **свежий лид в общем пуле, ещё не распределён**; либо **менеджер вернул лид в пул** для
> перераспределения. reassign с `null` — валидный переход в это состояние, не ошибка. Инвариант
> «exactly one owner» = owner **один** (не массив), НЕ owner **обязателен**: один-или-ноль, не много.
>
> **owner ⊥ assignee — независимые понятия (зафиксировать, чтобы через полгода не спорили).** owner
> (ответственный) и assignee (co-workers с доступом) — разные оси. owner НЕ становится assignee
> автоматически, и наоборот. Лид с owner и пустым assignee — норма (владелец единственный видит). Лид
> в пуле (owner=null) с assignee — тоже норма. Не выводить одно из другого ни в коде, ни в scope M6.

reassign → событие `project.reassigned` в `ActivityEvent` (не AuditLog: у reassign есть projectId,
это факт о лиде, читается в ленте сделки; в отличие от merge, который вне проекта). Payload P2/P3:
`{fromOwnerName, toOwnerName}` — снапшот имён.

---

## 7. Merge-редирект — верификация на живых данных

Merge контактов (contacts.md §7.3) уже переводит `ProjectContact.contactId` source→target. Таблица
была пуста — теперь наполняется. **Заготовки-тесты оживают, это верификация написанного, не новый
код**, но спека фиксирует ожидаемое:

```
merge source→target, оба в РАЗНЫХ проектах:
  → ProjectContact.contactId source меняется на target, orgId цел (composite-FK держится)

merge source→target, ОБА в ОДНОМ проекте (дубль):
  → PK (projectId, contactId) конфликтует при переносе →
     НЕ создавать вторую строку: roles = union(target.roles, source.roles),
     source-строку удалить. Union по enum — dedupe значений.

after merge:
  → GET /projects/:id/contacts показывает target с объединёнными ролями, source отсутствует
  → AuditLog.contact.merged.payload.movedProjectContactIds содержит перенесённые id
```

> Это стык двух срезов. Если тест union-ролей краснеет — баг в **merge** (contacts срез), не в этом.
> Спека связывает явно, чтобы регрессию искали в правильном месте.

---

## 8. Порядок реализации

1. Zod-контракты (`project-links.ts`) + `deal-roles.ts` (enum + `validRolesFor(audience)`).
2. `ProjectContact`: GET/POST/PATCH/DELETE — привязка, роли, отвязка (Member+); смёрженный→409.
3. `ProjectAssignee`: GET/POST/DELETE (Manager+).
4. `reassign`: вычистить `ownerId` из `UpdateProjectSchema`, добавить `POST /reassign` (Manager+) +
   событие `project.reassigned`. **Проверить: не осталось ли в UpdateProjectSchema других полей выше
   Member** (status/phaseId уже вынесены; ownerId — здесь; больше быть не должно).
5. Верификация merge-редиректа: прогнать заготовки-тесты из contacts §10 на живых `ProjectContact`.
6. CASL: `can('reassign')`, `can('manage','ProjectAssignee')` = Manager+; `ProjectContact` мутации =
   Member+ (capability, scope=ORG).

---

## 9. Тестирование

**ProjectContact**

- Member привязывает контакт → 201; Viewer → 403 (capability);
- привязка контакта из чужой орги → 404; в чужой проект → 404;
- **привязка смёрженного контакта → 409** (страж §5.1, стык с merge);
- повторная привязка → 409, роли меняются только через PATCH (страж §5.2);
- роль вне enum → 400 (Zod); пустой массив ролей → 201 (допустимо, §5.2 «роль неизвестна»);
- **PATCH roles=[] → 200** (контакт участвует, роль сброшена в «неизвестно» — не ошибка, страж ⑦);
- отвязка → строка удалена, **контакт жив** (DELETE связи ≠ DELETE контакта);
- удаление контакта, привязанного к сделке → 409 Restrict (страж D2);
- удаление проекта → его ProjectContact каскадно удалены, контакты живы.

**audience**

- B2C-воркспейс: привязка без Company → 201 (страж «soft», §4);
- «неуместная» роль для audience → 201 + возможный hint, **не 400** (страж §4 soft);
- роль вне enum независимо от audience → 400.

**ProjectAssignee / reassign**

- Manager назначает co-worker → 201; Member → 403;
- reassign Manager → owner сменён + `project.reassigned` в ленте (P4, страж);
- **Member шлёт PATCH {ownerId} → ownerId игнорируется/отклонён** (страж §6.2 — дыра закрыта);
- reassign на пользователя чужой орги → 400;
- reassign ownerId=null → owner снят, лид в пуле (страж §6.3 nullable);
- reassign → событие в ActivityEvent, НЕ в AuditLog (страж разделения);
- **owner ⊥ assignee:** reassign owner → список assignee НЕ меняется; добавление assignee → ownerId
  НЕ меняется (страж независимости §6.3, ревьюер ⑥).

**merge-редирект (стык)**

- merge, контакты в разных проектах → contactId перенесён, orgId цел;
- merge, оба в одном проекте → roles union, дублей нет, source-строка удалена (страж §7);
- **union edge-cases (ревьюер ⑤):** `[] + [CHAMPION]` → `[CHAMPION]`; `[] + []` → `[]`;
  `[CHAMPION] + [CHAMPION]` → `[CHAMPION]` (dedupe, не `[CHAMPION,CHAMPION]`);
  `[CHAMPION] + [BLOCKER]` → оба, порядок неважен;
- movedProjectContactIds в AuditLog корректен.

**RBAC (capability, не scope)**

- все мутации ProjectContact: Member ✔, Viewer ✘;
- assignee/reassign: Manager ✔, Member ✘;
- ни один тест НЕ проверяет org-wide видимость как контракт (M6-safe).
