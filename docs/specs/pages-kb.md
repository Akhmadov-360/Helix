# docs/specs/pages-kb.md — Project Pages & Knowledge Base (M3, часть 2 из 2)

> **Назначение.** Реализационная спека. Читать после `docs/specs/files.md` (часть 1) — `Page` и
> `KBArticle` не зависят от `Attachment` напрямую, но обе части одной M3-вехи и делят общий
> TipTap-контент-формат (§1). Соблюдать `CLAUDE.md` (Controller→Service→Repository, envelope,
> Zod-контракты в `api-schemas`) и `docs/decisions.md` (P1 — id/key не имя; P4 — сайд-эффекты
> после коммита; тенант-скоуп через `orgId`).
>
> **Явно ВНЕ скоупа** (ADR «embedding ingest → M4»): индексация для RAG, эмбеддинги. `Page` и
> `KBArticle` здесь — цели для будущего FR-PG-3, сам FR-PG-3 не реализуется.

---

## 0. Скоуп

**FR-PG-1 (MUST)** — Pages на Project: rich-text (headings/lists/tables/embeds/file references)
через block editor (TipTap/ProseMirror JSON). **FR-PG-2 (MUST)** — Knowledge Base, org-wide ИЛИ
per-workspace, с тегами и поиском. **FR-PG-4 (SHOULD)** — page templates из блюпринта
инстанцируются при создании проекта.

**FR-PG-5 (SHOULD) — РАЗДЕЛЯЕМ на две части, разная судьба:**
- **Comments + @mention — В СКОУПЕ.** В отличие от FR-FILE-4 (virus scan, реально блокирован
  отсутствующей инфраструктурой), здесь блокиратор был чисто структурный: `@mention`-нотификация
  (`project-m2-notifications-gaps.md`) стояла "blocked on Pages/comments, M3+" — комментарии на
  Pages **и есть** та сущность, которую ждали. Строим сейчас, попутно закрываем и старый M2-гэп
  (`enqueueMention` в уже существующий `notifications.md`-пайплайн, не новый механизм).
- **Version history — ОТЛОЖЕНО.** Это отдельная фича (снапшот на каждое сохранение, diff/restore
  UX), не побочный продукт остального. Откладывается явно, с ADR-пометкой в §8, не молчаливым
  пропуском.

**В скоупе:** `Page` (project-scoped) · `KBArticle` (org-scoped, опционально
workspace-scoped) · `PageComment` (+ `@mention` → email) · инстанцирование
`pageTemplates`/`kbSeed` из блюпринта (закрывает FR-BP-2 недострой, `project-prd-status-m0-m2.md`)
· простой поиск KB (Postgres `ILIKE`/`GIN`, не полнотекстовый движок) · RBAC.

**НЕ в скоупе:** version history (см. выше) · вложения ВНУТРИ TipTap-контента как отдельная
сущность (embed — просто `attachmentId`-ссылка в JSON-контенте, см. §1; не нужен отдельный
join-table) · real-time совместное редактирование (TipTap поддерживает, но Yjs/collab-сервер —
инфраструктура, которой физически нет, тот же класс решения, что virus scan в `files.md`) ·
экспорт Page/KB в PDF (Markdown — см. ревизию ниже).

> **Ревизия после первого прохода (пользовательский запрос, вне PRD на момент написания):**
> и `Page`, и `KBArticle` получили (1) полнотекстовый поиск title+content — `searchText`-колонка
> + функциональный GIN по `to_tsvector('simple', searchText)`, префиксный `tsquery` (`word:*`,
> находит по неполному слову при вводе), вместо `ILIKE`/`title`-only (замена §7 KB ниже, "простой
> поиск" в скоупе выше устарел); (2) клиентский экспорт в **Markdown** (не PDF — не запрошено) —
> без похода на бэкенд, весь content уже на клиенте. `KBArticle` дополнительно получил `icon`
> (emoji, Notion-style) и `authorId` (создатель, `SetNull`, тот же паттерн, что
> `Attachment.uploadedById`). См. CLAUDE.md manual-migration points #6/#7.

---

## 1. Данные

```prisma
model Page {
  id        String   @id @default(cuid())
  orgId     String
  projectId String
  title     String
  content   Json     @default("{}") // TipTap/ProseMirror JSON document — форма не валидируется
  //                                   схемой построчно (см. врезку ниже), только z.record на входе
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  org      Organization   @relation(fields: [orgId], references: [id], onDelete: Cascade)
  project  Project        @relation(fields: [projectId, orgId], references: [id, orgId], onDelete: Cascade)
  comments PageComment[]

  @@index([projectId])
}

model PageComment {
  id        String   @id @default(cuid())
  pageId    String
  authorId  String?
  body      String   // plain text — комментарий НЕ TipTap-документ, простой текст с @упоминаниями
  //                    как отмеченными подстроками (см. §3), не rich-text сам по себе
  createdAt DateTime @default(now())

  page   Page  @relation(fields: [pageId], references: [id], onDelete: Cascade)
  author User? @relation(fields: [authorId], references: [id], onDelete: SetNull)

  @@index([pageId])
}

model KBArticle {
  id          String   @id @default(cuid())
  orgId       String
  workspaceId String?  // null = org-wide; задан = видна только этому воркспейсу (FR-PG-2 "org-wide ИЛИ per-workspace")
  title       String
  content     Json     @default("{}")
  tags        String[] @default([])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  // Composite-FK ТОЛЬКО если workspaceId задан — Prisma не умеет условный composite-FK на
  // nullable-поле напрямую; решение см. врезку "composite-FK на nullable" ниже.
  workspace Workspace?   @relation(fields: [workspaceId, orgId], references: [id, orgId])

  @@index([orgId])
  @@index([workspaceId])
  @@index([tags], type: Gin) // поиск по тегам (§6)
}
```

> **Почему `content: Json`, не типизированная Zod-схема TipTap-документа.** TipTap/ProseMirror
> JSON — рекурсивная древовидная структура с расширяемым набором node/mark-типов (paragraph,
> heading, bulletList, table, и далее по мере добавления TipTap-расширений на фронте). Типизировать
> её целиком в Zod означало бы держать бэкенд-копию схемы синхронно с ЛЮБЫМ изменением набора
> TipTap-расширений на фронте — тогда как бэкенду форма контента реально не важна: он её не читает,
> не валидирует по полям, только хранит и отдаёт назад (P3 — бэкенд не источник истины по форме
> rich-контента, фронт/TipTap — источник). Валидация на входе — `z.record(z.string(), z.unknown())`
> (это валидный JSON-объект, не что-то более специфичное) + ограничение размера (§5), не структуры.

> **Composite-FK на nullable `workspaceId` — Prisma ограничение, не наш выбор.** `@@unique([id,
> orgId])` на `Workspace` требует непустых обоих полей для composite-relation; Prisma это
> поддерживает и с nullable FK-полем (relation просто не резолвится, когда `workspaceId IS NULL`) —
> проверено на паттерне `Company?` в `Project` (`companyId String?` + `company Company? @relation(
> fields: [companyId, orgId], references: [id, orgId])`, уже существует в схеме). Ничего нового не
> изобретаем, переиспользуем уже принятый в кодовой базе паттерн nullable composite-FK.

**GIN-индекс на `tags` (`String[]`) — синтаксис НЕ проверен на этом проекте, не принимать как
данность.** Первая редакция спеки утверждала, что `@@index([tags], type: Gin)` "уже используется в
проекте" — это неправда: в `schema.prisma` на момент написания нет ни одного GIN-индекса, я это не
проверил перед тем, как написать. Prisma (актуальная версия в проекте — 6.19.3) поддерживает
`type: Gin` для PostgreSQL без preview-флага, но точный синтаксис для array-колонки может
потребовать `@@index([tags(ops: ArrayOps)], type: Gin)`, а не голый `@@index([tags], type: Gin)` —
**проверить это первым делом в реализации** (`prisma migrate dev --create-only`, посмотреть
сгенерированный SQL до применения), не полагаясь на память. Если синтаксис не работает как ожидается
или требует preview-feature — это шестой manual-migration-инвариант (raw SQL в миграции, как
DEFERRABLE-уникальность у `Phase`), не блокер, но требует явной пометки в `CLAUDE.md`, если до
этого дойдёт.

---

## 2. Комментарии и @mention — закрывает M2-гэп

`PageComment.body` — простой текст, `@mention` внутри распознаётся **на бэкенде при создании
комментария**, не хранится отдельным полем: `POST /pages/:pageId/comments` принимает
`{body, mentionedUserIds: string[]}` — **фронт** резолвит `@Имя` в `userId` (используя уже
существующий ростер участников, `orgMembersQueryOptions`, тот же список, что typeahead в
assignee-пикерах) и передаёт готовые id, бэкенд не парсит текст на предмет `@`-паттернов (парсинг
имён из текста хрупок — коллизии имён, редактирование после парсинга; explicit id-список надёжнее
и уже соответствует тому, как остальной фронт резолвит people-references).

**Уведомление** — шестой job в существующем email-пайплайне (`notifications.md`), не новый
механизм:
```ts
// mention-job.ts
export interface MentionJobData {
  mentionedUserEmail: string;
  mentionedUserName: string;
  actorName: string;
  pageId: string;
  pageTitle: string;
  projectId: string;
  commentBody: string; // P3: обрезанное превью (первые ~200 символов), не весь текст, если длинный
}
export const MENTION_JOB = "page.mention";
```
`NotificationsService.enqueueMention(...)` — вызывается после коммита создания `PageComment` (P4),
по одному job на каждого упомянутого (не один job со списком получателей — тот же паттерн, что
`project.assigned`, один получатель = одно письмо, проще ретраить частично).

**Self-mention игнорируется** — тот же принцип, что phase-changed исключает актора: упомянуть
самого себя не должно генерить письмо самому себе.

---

## 3. Blueprint instantiation — закрывает FR-BP-2 недострой

`blueprints.md` §0 принимает `pageTemplates`/`kbSeed` как `z.array(z.unknown())`, не инстанцирует.
Теперь, когда `Page`/`KBArticle` существуют, инстанцирование добавляется в уже существующий поток
создания воркспейса из блюпринта (`WorkspacesService.createFromBlueprint`, вне этой спеки —
расширяется, не переписывается):

- `pageTemplates: [{title, contentJson}]` → создаётся `Page` **на каждый Project**, который
  создаётся из этого блюпринта? **Нет** — перечитать PRD-формулировку: "Page templates (from
  blueprint) auto-created **on Project creation**" (FR-PG-4), не на создание воркспейса. Значит
  `pageTemplates` копируются из `Workspace.blueprintId` (уже хранится, §1 workspaces-phases.md) в
  момент **создания Project** внутри этого воркспейса, не в момент создания самого воркспейса.
  Требует: `ProjectsService.create` при наличии `workspace.blueprintId` — прочитать
  `Blueprint.definition.pageTemplates`, создать `Page`-строки с тем же `contentJson`, привязанные к
  новому `projectId`, в той же транзакции, что создание проекта (P4-соседний принцип: связанные
  факты одной транзакцией).
- `kbSeed: [{title, contentJson}]` → создаётся `KBArticle` **один раз**, при создании
  **воркспейса** из блюпринта (не на каждый проект — KB не project-scoped, дублировать one-per-project
  было бы неверно по смыслу: kbSeed — это стартовый набор статей для воркспейса, не для сделки).
  `workspaceId` нового `KBArticle` = только что созданный воркспейс (per-workspace, не org-wide —
  блюпринт целится в конкретный воркспейс, у него нет мандата на org-wide контент).

**Ошибки инстанцирования не блокируют создание воркспейса/проекта** — тот же принцип, что
`notificationDefaults` (`notifications.md`): если `contentJson` в блюпринте почему-то невалиден
(defensive, не ожидается при нормальном UI создания блюпринта), логируем и продолжаем, не
откатываем всю транзакцию ради necessarily-secondary контента.

---

## 4. RBAC — новые CASL-субъекты `Page`, `KBArticle`

Appendix B "Upload files / edit pages" — та же строка матрицы, что `Attachment` (`files.md` §7):
✔ Owner/Admin/Manager, △ Member (scope=ORG до M6, тот же принцип).

```ts
export const APP_SUBJECTS = [/* ...существующие, */ "Page", "KBArticle"] as const;

// MANAGER:
can("manage", "Page");
can("manage", "KBArticle");

// MEMBER:
can("create", "Page"); can("read", "Page"); can("update", "Page"); // редактирование = часть "edit pages"
can("read", "KBArticle"); can("create", "KBArticle"); // △: Member создаёт/читает KB, не удаляет чужое

// VIEWER:
can("read", "Page"); can("read", "KBArticle");
```

`KBArticle.delete` — только Manager+ (тот же паттерн, что `Company`/`Contact` update/delete —
общий org-ресурс, удаление видно всем, не должно быть у Member). `Page.delete` — тоже Manager+
(страница на сделке — не личный контент одного участника).

`PageComment` — не отдельный CASL-субъект: право оставить комментарий = право читать `Page`
(`can("read", "Page")` уже покрывает всех, включая Viewer — комментировать может тот же круг, что
видит страницу; удалить свой комментарий может автор всегда, тот же паттерн, что нет отдельного
"Comment.delete" субъекта нигде в системе — простая проверка `comment.authorId === auth.userId` в
сервисе, не CASL-грант).

`capabilities.ts` + зеркало в `packages/api-schemas/src/capabilities.ts`:
```ts
Page: ["create", "read", "update", "delete"],
KBArticle: ["create", "read", "delete"], // нет update — правки статьи считаем replace (как Blueprint, §0 blueprints.md)
```

> **`KBArticle` без `update`?** Решение по аналогии с `Blueprint` (`blueprints.md` §0: "PRD не
> требует редактируемости — создал неправильно, удали"), но здесь PRD **прямо не говорит** ни
> того, ни другого. Взвешено: KB-статья — не то, что создаётся раз и навсегда, как блюпринт; живой
> документ, который правят по мере устаревания информации. **Решено добавить `update`** — вопреки
> первому импульсу скопировать паттерн Blueprint бездумно. `KBArticle: ["create", "read", "update",
> "delete"]`, `update` — Manager+ (та же логика, что delete).

---

## 5. Лимиты

`content` (`Json`) — ограничение размера **на уровне Zod**, не БД: `z.record(z.string(),
z.unknown())` с post-hoc проверкой `Buffer.byteLength(JSON.stringify(value), "utf8") <=
MAX_CONTENT_JSON_BYTES` (константа, `256 * 1024` — 256KB, с запасом больше, чем типичный текстовый
документ; embed-ссылки на файлы/картинки — это только `attachmentId`-строки в JSON, не сами
байты, §6, так что документ даже с десятками embed'ов остаётся лёгким). Тот же принцип, что
`MAX_LOGO_FILE_BYTES`, `MAX_ATTACHMENT_SIZE_BYTES` — числовая константа в коде, не env.

**Важно: `Buffer.byteLength(str, "utf8")`, НЕ `str.length`.** Первая редакция спеки использовала
`.length`, что считает UTF-16 code units, не байты — для контента на кириллице (продукт
ru/uz-первый) это занижает реальный размер почти вдвое (кириллический символ — 1 code unit, но 2
байта в UTF-8, как реально хранится в Postgres `jsonb`). Лимит "256KB", посчитанный так, на
практике пропускал бы контент весом до ~512KB — ошибка, не найденная бы до продакшена на
русскоязычном контенте. Исправлено при критике до реализации.

`PageComment.body` — `z.string().trim().min(1).max(5000)`.

`KBArticle.tags` — `z.array(z.string().trim().min(1).max(50)).max(20)`.

---

## 6. Embed-ссылки на файлы — просто `attachmentId` в JSON, не отдельная связь

FR-PG-1 упоминает "file references" среди block-типов Page. Решено: TipTap-расширение на фронте
(вне скоупа бэкенда) хранит `attachmentId` внутри node-атрибутов JSON-документа (`{"type":
"attachmentEmbed", "attrs": {"attachmentId": "..."}}`) — бэкенд **не** парсит `content` в поисках
таких ссылок и не создаёт для них отдельную join-таблицу `PageAttachment`. Резолвинг "какой файл
показать" происходит на фронте: рендерер embed-node'а берёт `attachmentId` из атрибутов узла и
запрашивает `GET .../attachments/:id/download-url` (`files.md` §8) как обычно.

**Следствие:** удаление `Attachment`, на который ссылается Page, не каскадится и не блокируется —
embed просто перестанет резолвиться (фронт покажет "файл удалён", как битая ссылка). Это осознанно
принятый trade-off, не недосмотр: держать ссылочную целостность между произвольным JSON-деревом и
внешней таблицей потребовало бы либо парсить/индексировать содержимое `content` при каждом
изменении (стоимость на каждую правку документа ради редкого случая "файл был удалён"), либо
Restrict-связь, которая заблокировала бы удаление файла, если на него где-то в тексте есть
упоминание — обе цены больше, чем цена редкой битой ссылки в UI.

---

## 7. Эндпоинты

| Метод | Путь | Guard | Назначение |
| --- | --- | --- | --- |
| `POST` | `/v1/projects/:projectId/pages` | `@CheckPolicy("create", "Page")` | Создать Page |
| `GET` | `/v1/projects/:projectId/pages` | `@CheckPolicy("read", "Page")` | Список Pages проекта |
| `GET` | `/v1/pages/:id` | `@CheckPolicy("read", "Page")` | Одна Page |
| `PATCH` | `/v1/pages/:id` | `@CheckPolicy("update", "Page")` | Обновить title/content |
| `DELETE` | `/v1/pages/:id` | `@CheckPolicy("delete", "Page")` | Удалить |
| `POST` | `/v1/pages/:id/comments` | `@CheckPolicy("read", "Page")` (см. §4) | Добавить комментарий (+ mention) |
| `GET` | `/v1/pages/:id/comments` | `@CheckPolicy("read", "Page")` | Список комментариев |
| `DELETE` | `/v1/pages/:id/comments/:commentId` | автор ИЛИ Manager+ (сервис, не CASL, §4) | Удалить комментарий |
| `POST` | `/v1/kb-articles` | `@CheckPolicy("create", "KBArticle")` | Создать (body: `workspaceId?: string`) |
| `GET` | `/v1/kb-articles` | `@CheckPolicy("read", "KBArticle")` | Список — query: `workspaceId?`, `tag?`, `q?` (§ниже) |
| `GET` | `/v1/kb-articles/:id` | `@CheckPolicy("read", "KBArticle")` | Одна статья |
| `PATCH` | `/v1/kb-articles/:id` | `@CheckPolicy("update", "KBArticle")` | Обновить |
| `DELETE` | `/v1/kb-articles/:id` | `@CheckPolicy("delete", "KBArticle")` | Удалить |

**Поиск KB (`GET /v1/kb-articles?q=...`)** — `title ILIKE '%q%'` (Postgres, не отдельный движок —
FR-PG-2 просит "search", не "full-text ranked search"; масштаб текущей вехи не оправдывает
`pg_trgm`/Elasticsearch). `tag=` — точное совпадение по элементу массива (`tags @> ARRAY[tag]`,
использует GIN-индекс §1). `workspaceId=` — фильтр видимости: без параметра возвращает и org-wide
(`workspaceId IS NULL`), и все per-workspace статьи, доступные пользователю; с параметром — только
`workspaceId IS NULL OR workspaceId = :workspaceId` (org-wide статьи видны из любого воркспейса).

Новые модули: `apps/api/src/modules/pages/` (Page + PageComment вместе — одна агрегатная граница,
тот же принцип, что Membership живёт в `organizations.repository.ts`) и
`apps/api/src/modules/kb/`.

---

## 8. Version history — явно отложено, не забыто

**Рассматривалось:** хранить `PageVersion` snapshot на каждый `PATCH /pages/:id` (весь `content`
целиком на каждую правку — TipTap-документы небольшие, § 5 капит на 256KB, дублирование терпимо).

**Отложено, не отвергнуто.** Причины:
1. **Нет UI-потребителя ещё** — "показать историю версий, откатить" это отдельный экран (diff или
   хотя бы список снапшотов с превью), которого нет ни в одном текущем макете. Строить бэкенд-
   хранение без экрана, который его покажет — задел без потребителя (тот же принцип, что уже не
   раз применялся: pgvector, embedding ingest).
2. **Реальная развилка требует решения, которого спека сейчас не принимает:** снапшот на КАЖДЫЙ
   `PATCH` (включая автосейв при печати, если TipTap на фронте настроен на debounced autosave) даст
   огромное количество версий за короткое время правки одного абзаца — нужна либо дедупликация
   (не снапшотить чаще, чем раз в N минут), либо явная кнопка "сохранить версию" отдельно от
   автосейва контента. Это дизайн-решение самой Pages UI, не техническая деталь бэкенда — принимать
   его здесь, без утверждённого UX, преждевременно.

**Решено:** version history — отдельный `/engineering:system-design` заход после того, как Pages
UI существует и понятно, как выглядит автосейв (тот же порядок, что уже применён к FR-WS-5/6:
не тянуть в текущую веху как довесок, не откладывать неопределённо — явный следующий шаг).

---

## 9. Порядок реализации

1. `packages/db`: модели `Page`, `PageComment`, `KBArticle` (§1), back-relations, `prisma migrate`
   (проверить GIN-индекс сгенерировался как ожидается).
2. `core/authz/app-ability.ts` + `capabilities.ts` + `packages/api-schemas/src/capabilities.ts`:
   субъекты `Page`, `KBArticle` (§4).
3. `packages/api-schemas/src/pages.ts`, `packages/api-schemas/src/kb-articles.ts`: контракты,
   `MAX_CONTENT_JSON_BYTES` (§5).
4. `apps/api/src/modules/pages/`: репозиторий/сервис/контроллер для Page + PageComment (§7).
5. `apps/api/src/modules/kb/`: репозиторий/сервис/контроллер для KBArticle + поиск (§7).
6. `apps/api/src/modules/notifications/`: `mention-job.ts`, `templates/mention-email.ts`,
   `enqueueMention` в `NotificationsService`, диспетч в `EmailWorker` (§2) — закрывает
   `project-m2-notifications-gaps.md` @mention.
7. Расширить `WorkspacesService.createFromBlueprint`: инстанцировать `kbSeed` (§3).
8. Расширить `ProjectsService.create`: инстанцировать `pageTemplates` при наличии
   `workspace.blueprintId` (§3).
9. `AppModule`: зарегистрировать `PagesModule`, `KbModule`.
10. Frontend (после бэкенда, отдельные PR): TipTap-редактор на Page, KB-браузер+поиск, новые пункты
    сайдбара («Страницы» — внутри Project, «База знаний» — постоянный пункт рядом с
    Контакты/Компании).

---

## 10. Тестирование — что покрыть обязательно

- **Page CRUD + tenant-scope:** создание/чтение/обновление/удаление, чужая орга → 404/403.
- **RBAC:** Viewer read-only на Page/KBArticle; Member может создать/читать (△, scope=ORG), не
  может удалить KBArticle; Manager+ может всё.
- **Комментарии + mention:** создание комментария с `mentionedUserIds` → `PageComment` создан,
  `page.mention`-job поставлен на каждого упомянутого ПОСЛЕ коммита; self-mention не создаёт job;
  удаление комментария — автор может, посторонний Member не может, Manager может любой.
- **KB scope (§1, §7):** статья с `workspaceId=null` видна при запросе с любым `workspaceId` в
  query и без него; статья с `workspaceId=X` не видна при запросе `workspaceId=Y`.
- **KB search:** `q=` матчит по подстроке title (регистронезависимо); `tag=` матчит только точное
  вхождение тега.
- **Blueprint instantiation (§3):** создание воркспейса из блюпринта с непустым `kbSeed` → ровно
  N `KBArticle` с `workspaceId` = новый воркспейс; создание Project в воркспейсе с непустым
  `pageTemplates` у блюпринта-источника → ровно N `Page`, привязанных к новому Project; блюпринт
  без `pageTemplates`/`kbSeed` (пустой массив/отсутствует) → ничего не создаётся, без ошибок.
- **Content size limit (§5), включая UTF-8:** `content` с кириллическим текстом, чей реальный
  UTF-8-размер (`Buffer.byteLength`) превышает лимит, ДАЖЕ ЕСЛИ `.length` (UTF-16 code units) — нет
  → 400 на create/update. Этот тест обязателен именно на кириллице — на чистом ASCII-контенте
  разница между `.length` и `Buffer.byteLength` не проявится, и баг (§5 врезка) прошёл бы
  незамеченным.
- **Embed-ссылка на удалённый Attachment (§6):** удаление `Attachment`, на который ссылается
  `content` какой-то `Page`, не блокируется и не каскадится — `Page.content` остаётся как есть
  (тест проверяет отсутствие побочных эффектов, не "правильный" рендеринг битой ссылки — это
  фронт).
- **GIN-индекс на `tags` реально используется:** `EXPLAIN` на запрос с `tags @> ARRAY[...]` при
  наличии >0 строк показывает `Bitmap Index Scan`/`Index Scan`, не `Seq Scan` — проверка того, что
  синтаксис индекса (§1 врезка) действительно сработал так, как задумано, не просто "миграция
  применилась без ошибки".
