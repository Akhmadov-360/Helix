# docs/specs/tasks.md — Task (чеклист на сделке) (M1, срез 5 — последний бэк-срез M1)

> **Назначение.** Реализационная спека. Claude Code читает перед кодом.
> Соблюдать `CLAUDE.md`, `docs/decisions.md` (P1–P4, RBAC две оси, `assertOrgMember`),
> `projects.md` (ActivityEvent §6.3, event-taxonomy), `project-links.md` (assertOrgMember, паттерн
> назначения на member орги). Спека прошла adversarial review; спорное — **«принято осознанно»**.
>
> **Самый лёгкий срез M1:** нет merge-класса сложности, нет fractional indexing, нет composite-
> хитростей. Три реальных решения (события, overdue, «кто закрывает чужой таск»), остальное — типовой
> tenant/RBAC-каркас. После него **M1 закрыт**.

---

## 0. Скоуп

**В скоупе:** Task CRUD (create/list/update/complete/delete) · `assigneeId` через `assertOrgMember` ·
события `task.created`/`task.completed` в ленту · overdue как **вычисляемое** поле.

**НЕ в скоупе (FR-PRJ-4 прямо ограничивает + async-вехи):** сабтаски · зависимости между тасками ·
рекуррентные таски · напоминания/нотификации (M4 async, BullMQ) · overdue-фильтр с индексом (см. §4).

---

## 1. Модель (из schema.prisma — данность)

```prisma
model Task {
  id         String   @id @default(cuid())
  orgId      String
  projectId  String
  title      String
  done       Boolean  @default(false)
  assigneeId String?                          // nullable: таск без исполнителя легален (§3)
  dueAt      DateTime?                         // nullable: таск без срока легален
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  org      Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  project  Project      @relation(fields: [projectId, orgId], references: [id, orgId], onDelete: Cascade)
  assignee User?        @relation(fields: [assigneeId], references: [id], onDelete: SetNull)

  @@index([projectId, done])                   // список тасков сделки, разделение done/open
}
```

> **onDelete осознанно.** `project = Cascade` (таск живёт только внутри сделки — нет сделки, нет
> смысла в чеклисте). `assignee = SetNull` (исполнитель уволился → таск остаётся, просто без
> исполнителя — как `AuditLog.actor`, работа переживает человека, P2-родственная логика).
> `project` через composite-FK `(projectId, orgId)` — tenant-мост, как везде.

> **`done: Boolean`, НЕ `status: enum`.** FR-PRJ-4 — простой чеклист, два состояния. Enum
> (`OPEN/IN_PROGRESS/DONE`) — соблазн, но IN_PROGRESS не требуется ТЗ и потянул бы за собой правила
> переходов. YAGNI: boolean сейчас, enum — если продукт потребует стадий. Расширение boolean→enum
> дёшево (backfill `done=true → DONE`).

> **Task принадлежит Project композиционно (DDD).** Задача не имеет самостоятельной ценности вне
> сделки — это не сущность, живущая своей жизнью, а часть чеклиста конкретного лида. Именно поэтому
> `onDelete: Cascade`, а не Restrict/SetNull: нет сделки — нет и её чеклиста. Composition, не
> aggregation.

---

## 2. Эндпоинты

| Метод  | Путь                         | Мин. роль | Действие                  |
| ------ | ---------------------------- | --------- | ------------------------- |
| GET    | `/v1/projects/:id/tasks`     | все       | список тасков сделки (§4) |
| POST   | `/v1/projects/:id/tasks`     | Member+   | создать таск              |
| PATCH  | `/v1/tasks/:taskId`          | Member+   | title / dueAt / assignee  |
| POST   | `/v1/tasks/:taskId/complete` | Member+   | done=true (§5)            |
| POST   | `/v1/tasks/:taskId/reopen`   | Member+   | done=false (§5)           |
| DELETE | `/v1/tasks/:taskId`          | Member+   | удалить таск              |

**Роли = Member+ (capability, scope=ORG в M1).** Task — часть «edit leads» (`△` Member): работа по
лиду, рутина агента. `assertOrgMember` для `assigneeId` (§3). `orgId` только из токена (`request.auth`); чужой
проект/таск → 404.

> **complete/reopen — отдельные action, НЕ `PATCH {done}`.** Тот же паттерн, что move/reassign:
> «завершить таск» — бизнес-действие с побочным эффектом (событие в ленту, §5), а не правка поля.
> PATCH меняет title/dueAt/assignee (событий не пишет). Смена `done` идёт через complete/reopen,
> потому что только она порождает событие. `done` **отсутствует в** `UpdateTaskSchema`, и схема
> `.strict()` → `PATCH {done:true}` даёт **400 (Zod unknown key), НЕ тихое игнорирование.** Тихо
> проглотить хуже: клиент получит 200 и решит, что сработало, а таск остался открыт. Явный отказ →
> понятная ошибка вместо молчаливого бага. Консистентно с выносом `ownerId`/`status`/`phaseId` из
> update Project.

---

## 3. `assigneeId` — nullable + assertOrgMember

```
POST/PATCH с assigneeId → assertOrgMember(assigneeId, ctx.orgId)  → 400 если не член орги
assigneeId = null → таск без исполнителя (легально, не ошибка)
```

> **Третий потребитель `assertOrgMember`** (после reassign owner, assign co-worker). `Task.assignee →
User(id)` — FK проверяет **существование** юзера, НЕ членство в орге. Назначить таск на юзера чужой
> орги через голый FK было бы можно → дыра tenant-изоляции. `assertOrgMember` закрывает: существование
> ≠ принадлежность (та же граница FK, что в project-links §6.3). Единый helper — единая точка
> изоляции «назначить пользователя на ресурс».

`assigneeId = null` — валидное состояние (таск создан, исполнитель не определён), симметрично
`owner=null` и `roles=[]`: «сущность есть, атрибут пока не назначен» — легальное промежуточное
состояние, не ошибка.

---

## 4. overdue — вычисляемое, НЕ хранимое (FR-PRJ-6, SHOULD)

```
overdue = (dueAt IS NOT NULL) AND (dueAt < now()) AND (done = false)
```

Вычисляется **на чтении**, в ответе API — производное поле, не колонка.

> **`dueAt` — абсолютный момент времени (`timestamptz`), НЕ календарный день (обязательно зафиксировать).**
> `dueAt` хранится как `timestamptz`; `overdue` определяется **сравнением абсолютных моментов**
> (`dueAt < now()`), поэтому таймзона не влияет: оба операнда — точки на оси времени, сравнение
> корректно в любой зоне. Понятие «конец дня в зоне пользователя» **не поддерживается** в M1 — таск
> с `dueAt = 2026-09-20T23:59Z` просрочен ровно в этот момент UTC, а не «в конце суток по Ташкенту».
> Без этой фиксации на защите гарантирован вопрос про таймзоны, а в коде — баг «просрочено за 5 часов
> до дедлайна пользователя». Если продукт потребует календарных дедлайнов в зоне юзера — это отдельная
> модель (хранить зону, сравнивать «конец суток dueAt в зоне» с now), отложено явно.

> **Почему не хранить `isOverdue: Boolean` (принято осознанно).** Хранимое протухает в ту же секунду,
> когда `dueAt` проходит: булево не «узнаёт», что время наступило. Пришлось бы пересчитывать кроном —
> лишний механизм, рассинхрон между пересчётами. Производное от `dueAt`+`done`+`now()` всегда точно.
> То же, что `status` лида **хранится** (не выводится) по обратной причине: там нужна стабильность к
> переименованию фазы; здесь наоборот — нужна свежесть относительно текущего времени. Правило: хранить
> то, что не выводится из других данных; вычислять то, что зависит от `now()`.

**overdue-фильтр/сортировка — НЕ в скоупе M1.** FR-PRJ-6 — SHOULD. Если появится «показать
просроченные» — это `WHERE dueAt < now() AND NOT done` + индекс `(orgId, done, dueAt)` (частичный
`WHERE done = false` эффективнее). Пока — вычисляем в ответе, индекс не заводим. Названо, отложено.

---

## 5. События — created/completed в ленту, остальное нет

У Task есть `projectId` → события идут в `ActivityEvent` (не AuditLog — есть проект-владелец, факт о
лиде, читается в ленте сделки).

```
task.created    → ActivityEvent  (появилась работа по лиду)
task.completed  → ActivityEvent  (работа сделана — значimая веха)
task.reopened   → НЕТ            (см. ниже)
PATCH title/dueAt/assignee → НЕТ (мелкие правки, зашумят ленту)
task.deleted    → НЕТ            (см. ниже)
```

> **`complete` идемпотентен (обязательно), и идемпотентность — АТОМАРНАЯ, не «прочитать-потом-записать».**
> `POST /complete` на уже завершённом таске (`done=true`) → **no-op, успех, нового `ActivityEvent` НЕ
> создаётся.** Два слоя защиты:
> - **fast-path:** чтение `done` до записи; если уже `true` — вернуть 200 без мутации и без события.
>   Ловит **последовательный** двойной клик (второй пришёл после коммита первого).
> - **compare-and-set:** сам переход пишется как `UPDATE … SET done=true WHERE id=? AND done=false`
>   (Prisma `updateMany`, возвращает count). Событие `task.completed` создаётся **только если
>   count=1** — то есть этот вызов реально завершил таск. Ловит **истинную гонку** (два запроса в
>   полёте до коммита любого): один выигрывает CAS, второй получает count=0 → no-op без второго
>   события. Один `task.completed` на таск, а не два.
>
> Fast-path без CAS ловил бы только последовательный случай — при истинной конкурентности оба
> прочитали бы `done=false` и оба записали бы событие. **Тот же атомарный идиом, что `markUsed`
> (auth) и `bumpVersionIf` (доска): гонку решает БД, не код.** «Завершить завершённое» безвредно, в
> отличие от «привязать привязанное» (project-links §5.2, где 409 — там намерение двусмысленно).
> `reopen` симметрично идемпотентен (тем же CAS `done=true → false`); события он не пишет, поэтому
> его гонка безобидна, но примитив единый — ради консистентности.

> **reopen не пишет событие — аргумент архитектурный, не психологический.** `ActivityEvent` хранит
> **достижение бизнес-вех**. `completed` — достижение. `reopen` — **отмена достижения, не несущая
> новой бизнес-информации** о лиде. Дело не в том, «ошибся ли пользователь» (намерение неизвестно и
> неважно), а в том, что отмена вехи — не веха. Полный трек изменений, если понадобится аудит — это
> `AuditLog`-территория (M6), не лента сделки.

> **delete не пишет событие — то же правило, что reorder карточек (projects §6.3).** Удаление таска
> **не отражает изменение состояния сделки** — это изменение чеклиста, а не бизнес-факт о лиде. Лид не
> продвинулся и не откатился оттого, что из его чеклиста убрали пункт. Поэтому `ActivityEvent` не
> создаётся — консистентно с «порядок карточек — представление, не факт».

Payload P2/P3 — снапшот, без живых FK на исполнителя:

```json
{ "type": "task.completed", "schemaVersion": 1,
  "payload": { "taskId": "tsk_...", "taskTitle": "Позвонить клиенту",
               "assigneeName": "Мария" | null, "actorName": "Иван" } }
```

`taskId` в payload, **несмотря на** привязку события к Project: копейка сейчас, но позже включит
«перейти к задаче / открыть чеклист» из ленты без миграции payload. `assigneeName` nullable (таск без
исполнителя). Событие пишется **атомарно с мутацией** (P4) — в той же транзакции, что `done=true`.
Откат мутации → события нет.

---

## 6. «Кто может закрыть чужой таск?» — scope-sensitive

Иван (Member) создал таск, может ли Пётр (Member) его завершить?

> **В M1: да (scope=ORG).** При capability=Member+ и scope=ORG все члены орги видят и трогают все
> таски. Это следствие временного org-wide scope, НЕ отдельное решение. **В M6** (scope=ASSIGNED)
> разграничится по visibility воркспейса — но это добавится как условие на объект, не переписывая
> capability (две оси, ADR RBAC). Помечено scope-sensitive, чтобы в M6 не забыть.

> **Тест это НЕ фиксирует как контракт.** «Member закрывает чужой таск → 200» в M1 верно, но
> тестировать это как **инвариант** нельзя — в M6 покраснеет. Тест проверяет **capability** («Member
> может complete»), не «Member может complete ЧУЖОЙ» (последнее — временный scope). M6-safe by
> construction, как остальные capability-тесты.

---

## 7. Порядок реализации

1. Zod-контракты (`tasks.ts`): `CreateTaskSchema {title, dueAt?, assigneeId?}`,
   `UpdateTaskSchema {title?, dueAt?, assigneeId?}` (**без `done`**, `.strict()` → лишний ключ 400 —
   §2), `TaskResponse` (+ `overdue` вычисляемое, + `taskId`/`assigneeName` в событиях). `dueAt` —
   `z.coerce.date()` → `timestamptz` (§4).
2. Task CRUD: POST/GET/PATCH/DELETE (Member+), `assertOrgMember` на `assigneeId` (§3).
3. complete/reopen: отдельные action; complete/created → `ActivityEvent` атомарно (P4).
4. overdue в `TaskResponse` — вычисляется на чтении (§4).

---

## 8. Тестирование

**CRUD + tenant**

- Member создаёт таск → 201; Viewer → 403 (capability);
- таск в чужой сделке → 404; PATCH чужого таска → 404;
- удаление проекта → его таски каскадно удалены (Cascade);
- `assigneeId` чужой орги → 400 (страж assertOrgMember §3);
- `assigneeId = null` → 201 (легально, §3);
- увольнение исполнителя (delete User) → таск жив, `assigneeId = null` (SetNull, страж onDelete);
- `done` в теле PATCH → **400** (Zod strict unknown key, НЕ тихо проигнорирован — страж §2).

**Событийность (P4)**

- complete → `task.completed` в ленте, payload содержит `taskId` + `taskTitle` + `actorName`;
  откат tx → события нет;
- **двойной complete (уже done) → одно событие, 200** (страж идемпотентности §5);
- reopen на open таске → `done=false`; **reopen на уже-open → no-op, 200** (идемпотентность §5);
- create → `task.created` в ленте;
- **reopen → события НЕ пишется** (страж §5);
- PATCH title/dueAt → события НЕ пишется (страж §5);
- delete таска → события НЕ пишется (страж §5);
- payload `assigneeName = null` для таска без исполнителя (страж §5).

**overdue**

- `dueAt` в прошлом + `done=false` → `overdue=true`;
- `dueAt` в прошлом + `done=true` → `overdue=false` (сделан — не просрочен);
- `dueAt = null` → `overdue=false` (нет срока — не просрочен);
- `dueAt` в будущем → `overdue=false`;
- overdue **не хранится** — меняется только от времени, без записи в БД (страж §4: два чтения одного
  таска до и после `dueAt` дают разный overdue без UPDATE).

**RBAC (capability, не scope)**

- complete/reopen: Member ✔, Viewer ✘;
- ни один тест НЕ фиксирует «Member трогает ЧУЖОЙ таск» как контракт (M6-safe, §6).
