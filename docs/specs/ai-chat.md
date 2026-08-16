# docs/specs/ai-chat.md — Talk-to-Project AI (M4)

> **Назначение.** Реализационная спека для M4 — §7.8 PRD (FR-AI-1..7), встык с уже отложенными
> в M4 `FR-PG-3`/`FR-FILE-3` (индексация Page/KB/Attachment под RAG — ADR «embedding ingest → M4»,
> `decisions.md`). Читать после `files.md` и `pages-kb.md` — источники контента, которые здесь
> индексируются, уже существуют.
>
> **Явный охват SHOULD.** Продукт больше не строго MVP — по запросу заказчика SHOULD-пункты
> (`FR-AI-4`, `FR-AI-5`) закладываются в архитектуру **сейчас** (схема/scope-модель проектируются
> так, чтобы их достроить без миграции-переделки), даже если сама реализация идёт отдельным
> фазовым проходом после MUST-ядра (§13).

---

## 0. Скоуп

**MUST (ядро, Фаза 1):**
`FR-AI-1` per-project чат с RAG над scoped-эмбеддингами · `FR-AI-2` streaming (SSE) + цитаты ·
`FR-AI-3` tool use/actions с permission-check и confirm-flow · `FR-AI-6` provider abstraction
(Anthropic/OpenAI/Bedrock) · `FR-AI-7` hard tenant-filter на retrieval · `FR-PG-3`/`FR-FILE-3`
(text-extraction + embedding ingest для Page/KBArticle/Attachment — сам пайплайн, который питает
FR-AI-1).

**SHOULD (архитектурно заложено сейчас, реализация — Фаза 2/3, §13):**
`FR-AI-4` Talk-to-Workspace/Talk-to-Org · `FR-AI-5` one-tap хелперы (summarize project, draft
follow-up, next best action, extract fields из документа).

**НЕ в скоупе этого захода (явно, не молча):**
- `FR-AI-4`/`FR-AI-5` UI и продуктовая полировка — схема и эндпоинты рассчитаны на них (§2, §8), но
  сборка откладывается до Фазы 2/3.
- Cost telemetry / token budgets per org (§9 PRD-таблицы) — нет данных по реальному usage, чтобы
  осмысленно калибровать бюджеты; заводить лимиты «на глаз» хуже, чем не заводить вовсе. Метрика
  (токены/запрос в лог) — да, бюджеты/алерты — нет.
- `FR-SEARCH-2` (MAY, семантический поиск поверх того же индекса) — тривиальный довесок после
  того, как `EmbeddingChunk` существует, но отдельная фича, не строим попутно.
- Кэширование эмбеддингов (PRD §9) — преждевременная оптимизация без данных о повторных запросах.
- Row-Level Security (PRD §11.1, "optionally") — уже решено в `decisions.md` ("тенант-изоляция
  через явный orgId, не ALS") для всего проекта; RAG не исключение, просто ещё один `orgId`-фильтр.

---

## 1. Данные — три новые модели

### 1.1 `EmbeddingChunk` — единица retrieval

```prisma
enum EmbeddingSourceType {
  PAGE
  KB_ARTICLE
  ATTACHMENT
}

model EmbeddingChunk {
  id          String   @id @default(cuid())
  orgId       String
  // Ортогональные scope-фильтры retrieval (§2) — ровно один заполнен по смыслу источника:
  // Page/project-scoped Attachment → projectId; KBArticle → workspaceId (null = org-wide KB,
  // тот же смысл, что KBArticle.workspaceId сейчас).
  projectId   String?
  workspaceId String?
  sourceType  EmbeddingSourceType
  sourceId    String              // Page.id | KBArticle.id | Attachment.id
  chunkIndex  Int                 // порядок внутри источника, 0-based
  content     String              // текст чанка — нужен для сборки контекста без похода к источнику
  embedding   Unsupported("vector(1536)")
  createdAt   DateTime @default(now())

  org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@index([orgId, projectId])
  @@index([orgId, workspaceId])
  @@index([sourceType, sourceId]) // delete-before-reinsert на каждый re-ingest (§3.3)
}
```

**P3 (минимальный payload) — почему `content` дублируется, а не только `sourceId`.** Сборка
контекста для LLM должна происходить без похода в Page/KBArticle/Attachment за оригиналом — retrieval
уже вернул top-K строк `EmbeddingChunk`, этого достаточно. Держать только `sourceId` означало бы
второй round-trip на каждый чанк на каждый запрос — цена хуже, чем дублирование текста чанка (он
и так уже маленький, ~500 токенов).

**P2 (переживает источник) — сознательно НЕ применяется.** В отличие от `PageVersion`/`ActivityEvent`
снапшотов, `EmbeddingChunk` — производное, не исторический факт. Если источник изменился/удалён,
старые чанки **должны** исчезнуть (§3.3), а не остаться как история. `onDelete: Cascade` только на
`orgId` (тенант целиком) — удаление конкретного Page/KBArticle/Attachment чистит свои чанки
приложением (ingest-джоба), не FK-каскадом: FK на `Page`/`KBArticle`/`Attachment` по отдельности
усложнил бы модель (три nullable FK вместо одного `sourceId`) ради инварианта, который и так
держит приложение (то же решение, что `PageComment`/`ActivityEvent` уже приняли для похожих случаев).

**Векторный индекс — manual-migration point (см. CLAUDE.md #6/#7 прецедент).** `ivfflat`/`hnsw`
индекс на `embedding` Prisma не выражает — raw SQL в миграции, `prisma migrate dev` не должен его
перегенерить. Тип индекса и параметры (`lists`/`m`/`ef_construction`) выбираются на этапе
реализации по объёму данных, не здесь — фиксируется как **manual-migration point #8** в CLAUDE.md
при реализации.

### 1.2 `AiThread` — тред разговора, scope заложен на 3 уровня сразу

```prisma
enum AiThreadScope {
  PROJECT
  WORKSPACE
  ORG
}

model AiThread {
  id          String        @id @default(cuid())
  orgId       String
  scope       AiThreadScope
  projectId   String?  // задан при scope=PROJECT
  workspaceId String?  // задан при scope=WORKSPACE
  createdById String?
  title       String?  // авто из первого вопроса (усечённый), null = "New chat" на фронте
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  project   Project?     @relation(fields: [projectId, orgId], references: [id, orgId], onDelete: Cascade)
  workspace Workspace?   @relation(fields: [workspaceId, orgId], references: [id, orgId], onDelete: Cascade)
  createdBy User?        @relation(fields: [createdById], references: [id], onDelete: SetNull)
  messages  Message[]

  @@index([orgId, projectId])
  @@index([orgId, workspaceId])
}
```

**Почему `scope` — enum на всю модель сразу, а не только `projectId` (FR-AI-1 MUST) с добавлением
`workspaceId`/org-scope в M6/потом.** Явное отступление от "строй только MUST" по запросу: продукт
не MVP, откладывать до отдельной вехи означало бы миграцию (`ALTER TABLE` + backfill `scope`) и
переписывание retrieval-фильтра (§2) второй раз. Три nullable-колонки сейчас дешевле, чем два
захода в одну и ту же модель. `scope=ORG` не имеет ни `projectId`, ни `workspaceId` — оба `null`,
различается по `scope` (не по "оба null = org" неявно — enum делает это явным полем, не побочным
эффектом отсутствия FK).

### 1.3 `Message`

```prisma
enum MessageRole {
  USER
  ASSISTANT
}

model Message {
  id        String      @id @default(cuid())
  threadId  String
  role      MessageRole
  content   String
  // Снапшот (P2) — источник цитаты может быть удалён/изменён ПОСЛЕ ответа; храним то, что видел
  // юзер в момент ответа, не живую ссылку. Форма: [{sourceType, sourceId, label}].
  citations Json?
  // Форма: [{id, tool, args, status: PROPOSED|CONFIRMED|EXECUTED|REJECTED, result?}] — §6.
  toolCalls Json?
  createdAt DateTime @default(now())

  thread AiThread @relation(fields: [threadId], references: [id], onDelete: Cascade)

  @@index([threadId, createdAt])
}
```

`citations`/`toolCalls` — `Json`, не отдельные таблицы: тот же принцип, что `ActivityEvent.payload`
(P3 — минимум для отображения, не нормализованная связь ради связи). Число citations/tool-calls на
сообщение маленькое (единицы), запросов "найди все сообщения с цитатой на конкретный Page" в
скоупе нет — если появится, тогда и нормализовывать.

---

## 2. Retrieval-scope — hard filter, две разных стратегии контекста

`FR-AI-7`: "retrieval is filtered by orgId + scope, **enforced server-side**" — не промпт-инструкция.
Дальше — что именно фильтруется и как собирается контекст, потому что FR-AI-1 требует не только
"pages, KB, files", но и "contacts, fields, and activity" — а это структурированные данные, не
текстовые документы, и вектор-поиск по ним не имеет смысла.

**Две независимые стратегии контекста, не одна:**

1. **Vector retrieval** (`EmbeddingChunk`, top-K по cosine similarity) — для Page/KBArticle/Attachment.
   SQL-фильтр `WHERE orgId = X AND (projectId = Y OR workspaceId IN (…))` — построен так же, как
   существующий `pages.repository.ts` full-text поиск (raw SQL, чтобы реально попасть в индекс), не
   Prisma-фильтр после выборки.
2. **Structured injection** — Project fields, последние N `ActivityEvent`, привязанные Contact/Company
   читаются **напрямую** (обычный Prisma-запрос, тот же `orgId`-guard на data-access слое, что и
   везде в проекте) и вставляются в системный промпт как компактный JSON-блок, БЕЗ эмбеддинга.
   Дешевле, точнее (актуальные данные, не векторное приближение) и не требует ре-индексации на
   каждое изменение поля лида.

**Scope → что доступно для retrieval (для `scope=PROJECT`, ядро Фазы 1):**

| Источник | Фильтр |
|---|---|
| `Page` чанки | `EmbeddingChunk.projectId = thread.projectId` |
| `Attachment` чанки | `EmbeddingChunk.projectId = thread.projectId` |
| `KBArticle` чанки | `EmbeddingChunk.workspaceId = project.workspaceId OR workspaceId IS NULL` (org-wide KB видна из любого проекта той орги — тот же принцип видимости, что уже есть у KB вне AI) |
| Project fields/contacts/activity | прямое чтение по `projectId`, structured injection |

Для `scope=WORKSPACE`/`scope=ORG` (Фаза 2, §13) фильтр расширяется на все `Page`/`Attachment` чанки
проектов этого workspace/орги — сама SQL-конструкция не меняется, меняется только значение фильтра
(`projectId IN (SELECT id FROM Project WHERE workspaceId = …)`), поэтому Фаза-1 схема не требует
переделки под Фазу 2.

**orgId — на каждом уровне, не только на верхнем.** `EmbeddingChunk.orgId` фильтруется ВСЕГДА, даже
когда `projectId`/`workspaceId` уже сужают до одного тенанта технически (composite-FK backbone не
распространяется на `EmbeddingChunk`, у него нет составного FK на `Project`) — редундантный, но
обязательный явный фильтр в каждом retrieval-запросе, тот же P1-принцип ("никогда по имени/неявному
выводу"), применённый к безопасности: один пропущенный `AND orgId = …` в векторном запросе — утечка
между тенантами, а не просто баг с сортировкой.

---

## 3. Ingest-пайплайн — извлечение текста, чанкинг, эмбеддинг

### 3.1 Триггеры

- `PagesService.create`/`update` (title/content изменились) — уже вычисляет `searchText` для
  full-text поиска; ingest-джоба переиспользует тот же `extractPlainText`, не пишет свой парсер.
- `KbService.create`/`update` — аналогично.
- `AttachmentsService.confirm` (файл подтверждён после аплоада, files.md §3) — только для
  извлекаемых форматов (`FR-FILE-3`: PDF/docx/txt/md); остальные MIME-типы (изображения, архивы)
  не индексируются, `EmbeddingChunk` для них не создаётся вовсе, не "создаётся пустым".

Каждый триггер — `queue.add(INGEST_EMBEDDINGS_JOB, {sourceType, sourceId, orgId, scope})` **после
коммита** транзакции (P4 — сайд-эффект после мутации, тот же паттерн, что email/webhook по всему
проекту), не внутри неё.

### 3.2 Job: extract → chunk → embed → upsert

```
1. Fetch текущее содержимое источника (Page.content / KBArticle.content / S3 object для Attachment)
2. Extract plain text:
   - Page/KBArticle: extractPlainText() — уже есть, core/lib/full-text-search.ts
   - Attachment: формат-специфичный парсер (pdf-parse / mammoth для .docx / текст как есть для .txt/.md)
3. Chunk: ~500 токенов на чанк, overlap ~50 токенов (границы по параграфам, не по символам вслепую)
4. Embed: AiEmbeddingProvider.embed(chunks) — batched, не по одному чанку за вызов
5. Transaction: DELETE FROM EmbeddingChunk WHERE sourceType=X AND sourceId=Y; INSERT новые чанки
```

Шаг 5 — **delete-before-reinsert в одной транзакции**, не upsert по `chunkIndex`: количество чанков
меняется между версиями контента (документ стал короче/длиннее), upsert по индексу оставил бы
"хвост" старых чанков за пределами нового диапазона. Delete-then-insert проще и корректнее для
маленького числа строк на источник (единицы-десятки чанков), не то место, где нужен upsert ради
производительности.

### 3.3 Очередь — новая `ingest-embeddings`, не `MAINTENANCE_QUEUE`

**Решение:** отдельная BullMQ-очередь (PRD §12.5 явно называет её отдельно от `email`), не третий
job-name на существующей `maintenance`. Обоснование, не дефолт:

| | `MAINTENANCE_QUEUE` (переиспользовать) | Новая `INGEST_EMBEDDINGS_QUEUE` |
|---|---|---|
| Природа джоб | Периодические (`repeat`), редкие, не пользователь-triggered | Событийные, каждый save Page/KB/Attachment — потенциально частые |
| Стоимость джобы | Дешёвая (DB-delete) | Дорогая (внешний API-вызов на эмбеддинг-провайдера, retry/backoff нужен отдельно) |
| Блокировка воркера | Не критично — раз в сутки | Критично — не должна конкурировать за воркер с cleanup-джобами и тормозить их |

Разная природа нагрузки (cron vs event-driven, дешёвая DB-операция vs внешний API-вызов) — повод
завести отдельную очередь, тот же принцип, что уже решил вопрос "одна очередь, много job-имён"
для `maintenance` (там все job'ы были ОДНОЙ природы — периодическая уборка, здесь нет).

---

## 4. Query-пайплайн — вопрос → ответ

```
POST /v1/ai-threads/:id/messages { content: string }
  1. CASL: actor имеет read на thread.scope-ресурс (Project/Workspace/Org)
  2. Save Message{role: USER, content}
  3. embed(question) → similarity search EmbeddingChunk (§2, top-K=8, cosine <=>)
  4. buildStructuredContext(scope) — fields/contacts/activity, прямое чтение (§2)
  5. assemble system prompt: retrieved chunks + structured context + tool schema (§6)
  6. AiChatProvider.streamChat(messages, tools) → SSE: token-события + tool-call-предложения
  7. on stream end: Save Message{role: ASSISTANT, content, citations, toolCalls}
```

SSE, не WebSocket — один направленный поток (сервер → клиент), запрос-ответ уже есть через сам
POST; WebSocket добавил бы двустороннюю инфраструктуру ради возможности, которая не нужна (клиент
не шлёт ничего среди потока токенов). NestJS отдаёт `text/event-stream` вручную на этом эндпоинте
(не через `@Sse()` decorator — тот привязан к Observable, а стриминг из провайдер-адаптера
асинхронный generator; ручная запись в `Response` проще, чем адаптировать AsyncIterable → Observable).

---

## 5. Provider abstraction (`packages/ai`) — ADR: chat-провайдер ≠ embedding-провайдер

```ts
interface AiChatProvider {
  streamChat(params: { messages: ChatMessage[]; tools: ToolSchema[] }): AsyncIterable<ChatStreamEvent>;
}
interface AiEmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}
```

Реализации: `AnthropicChatProvider` (`@anthropic-ai/sdk`), `OpenAiChatProvider`,
`BedrockChatProvider` (`@aws-sdk/client-bedrock-runtime`) — все под `AiChatProvider`.

**Критичный gotcha, который PRD не проговаривает явно:** Anthropic API **не предоставляет
embeddings endpoint** — `FR-AI-6` формулирует provider abstraction так, будто один и тот же
провайдер обслуживает и чат, и эмбеддинги ("pluggable LLM/embedding backends"), но для Anthropic
это физически невозможно для половины пары. Решение: `Organization.settings.aiProvider` (уже
существует как JSON-заглушка, `packages/api-schemas/src/organizations.ts`) расширяется отдельным
полем `embeddingProvider`, независимым от `provider` (chat). Дефолт — `openai` или
`bedrock-titan`, если `provider=anthropic`; если `provider=openai`/`bedrock`, тот же провайдер
обслуживает оба (может, но не обязан). Выбор конкретной embedding-модели фиксирует размерность
вектора (`vector(1536)` в схеме — размерность OpenAI `text-embedding-3-small`/Titan V2; смена
модели с другой размерностью **потребует новую колонку/миграцию**, не runtime-переключения —
фиксируется здесь, чтобы не удивлять на защите).

Выбор провайдера — per-org, читается из `Organization.settings.aiProvider` при каждом запросе
(не кэшируется агрессивно — смена провайдера должна применяться сразу после сохранения настройки).

---

## 6. Tool use / actions (`FR-AI-3`) — propose → confirm → execute, не auto-execute

**Ассистент никогда не выполняет side-effecting действие напрямую.** LLM возвращает
`tool_use`-блок → бэкенд сохраняет его в `Message.toolCalls` со `status: PROPOSED` и отдаёт клиенту
через тот же SSE-поток отдельным событием (`type: "tool_call_proposed"`) → фронт рендерит
confirmation-карточку (PRD §12.3: "action-confirmation UI") → юзер жмёт "Подтвердить" →

```
POST /v1/ai-threads/:id/tool-calls/:callId/confirm
  1. Найти toolCall в Message.toolCalls по callId, status must be PROPOSED
  2. CASL-проверка ПРАВ АКТОРА (не ассистента) на конкретное действие —
     move_phase → Project.update, create_task → Task.create, update_field → Project.update, и т.д.
     (переиспользуют СУЩЕСТВУЮЩИЕ CASL-грант'ы каждого домена, не новый субъект "AiTool")
  3. Выполнить ЧЕРЕЗ существующий сервис (ProjectsService.move/TasksService.create/…), не напрямую
     в БД — тот же слой, что REST API, значит те же инварианты/ActivityEvent-запись автоматически
  4. ActivityRecorder.record(tx, {..., actorId: реальный юзер, event: <тип события домена>}) —
     атомарно с выполнением (P4); НЕ отдельное "ai.tool_executed"-событие поверх — это была бы
     дублирующая, менее полезная запись, чем "project.phase_changed" с actorId юзера, который нажал confirm
  5. Обновить status → EXECUTED (или REJECTED, если действие невалидно к моменту confirm — гонка
     "предложено 5 минут назад, состояние успело измениться" — 409, не 500)
```

**Инструменты Фазы 1** (`FR-AI-3` явно перечисляет пять): `move_phase`, `create_task`,
`update_field`, `draft_email` (генерирует черновик, НЕ отправляет — отправка email это отдельное
side-effecting действие вне скоупа AI-actions), `summarize_files` (read-only, не требует confirm —
не side-effecting, выполняется сразу, как ответ, а не как proposed-action).

Zod-схемы аргументов каждого инструмента — в `api-schemas/src/ai-tools.ts`, максимально
переиспользуют уже существующие input-схемы доменов (`updateProjectSchema`, `createTaskSchema`),
не изобретаются заново.

### 6.1 Может ли Member попросить ИИ сделать то, чего не может сам — и что он видит при отказе

**Да, может попросить — и это не проблема, потому что ИИ не является источником прав.** LLM не
обязан достоверно знать RBAC пользователя и не обязан отказываться сам — он просто ещё один способ
дойти до той же самой защищённой ручки, что REST API (§6, шаг 2: confirm проверяет **актора**, не
ассистента). Ассистент физически не может обойти CASL — максимум, что он может, это **предложить**
действие, которое потом не пройдёт confirm. Тот же принцип, что CLAUDE.md уже фиксирует для
обычного UI: "UI-скрытие косметическое, enforcement на сервере" — здесь то же самое, роль ИИ вместо
роли фронтенда.

**Два независимых слоя, не один:**

1. **Enforcement (обязательный, единственный источник истины)** — confirm-эндпоинт (§6, шаг 2)
   всегда перепроверяет CASL актора перед выполнением, вне зависимости от того, что предложил
   ассистент. Это уже описано в основном флоу выше и не меняется.
2. **Advisory (UX-слой поверх, не замена п.1)** — роль/capability актора передаётся в system prompt
   вместе с tool schema (`{tool: "update_field", allowed: false, reason: "requires Manager+"}` —
   вычисляется тем же `AppAbility`, что и обычные CASL-проверки, просто заранее, до вызова LLM).
   Цель — чтобы ассистент **не тратил ход пользователя впустую**, предлагая заведомо недостижимое
   действие, а сразу отвечал текстом, без tool-предложения:

   > "Изменить сумму сделки может Менеджер или выше — у вас роль Member. Хотите, я подготовлю
   > текст изменения, чтобы вы переслали его тому, у кого есть права?"

   Это чисто информационный слой (LLM может проигнорировать инструкцию или ошибиться) — поэтому
   он не отменяет п.1, а сокращает долю случаев, когда пользователь вообще доходит до кнопки
   "Подтвердить" и получает отказ. Дешёво добавить сейчас (это просто более богатый system prompt,
   не новая инфраструктура), поэтому закладывается в Фазу 1, а не как отдельный follow-up.

**Если предложение всё же дошло до confirm и не прошло CASL (advisory-слой промолчал/ошибся,
или пользователь дословно скопировал JSON запроса) — что видит пользователь: `403`, но не сырой.**
Тот же паттерн, что уже применяется к каждому 403 в приложении (`toPageError`/`toKbError`/
`toAttachmentError` → `kind: "permissionDenied"` → `toast.error(t(...))`, см. `apps/web/src/
features/*/​*-error.ts`) — здесь заводится симметричный `toAiToolCallError`, никакой новой UX-формы.
Карточка предложенного действия в треде переходит в состояние `REJECTED` с подписью "недостаточно
прав", остаётся видимой в истории (не исчезает молча) — пользователь видит ЧТО было предложено и
ПОЧЕМУ не выполнено, может переслать это коллеге с нужной ролью, не переспрашивая ИИ заново.

---

## 7. RBAC

Отдельного CASL-субъекта `AiThread` с полным набором capability — **нет**. Чтение/создание треда
проверяется по capability на **scope-ресурс**: `scope=PROJECT` → `can('read', 'Project')` на
конкретный `projectId`, `scope=WORKSPACE` → `can('read', 'Workspace')`, `scope=ORG` → всегда
доступно членам орги (нет отдельного "читать всю оргу" грант — так же, как активность/аудит-лог
уже скоупятся). Выполнение tool-call проверяется по capability **того домена, который выполняется**
(§6) — не по единому "может ли юзер пользоваться AI вообще" флагу (такого разграничения PRD не
просит, Appendix B permission matrix не содержит отдельной строки "AI actions").

---

## 8. Эндпоинты

| Метод | Путь | Guard | Назначение |
|---|---|---|---|
| `POST` | `/v1/projects/:projectId/ai-threads` | `read Project` | Новый тред, `scope=PROJECT` |
| `GET` | `/v1/projects/:projectId/ai-threads` | `read Project` | Список тредов проекта |
| `GET` | `/v1/ai-threads/:id/messages` | `read` на scope-ресурс треда | История сообщений |
| `POST` | `/v1/ai-threads/:id/messages` | `read` на scope-ресурс треда | Задать вопрос → SSE-стрим ответа |
| `POST` | `/v1/ai-threads/:id/tool-calls/:callId/confirm` | capability конкретного действия (§6) | Выполнить предложенное действие |
| `POST` | `/v1/ai-threads/:id/tool-calls/:callId/reject` | `read` на scope-ресурс треда | Отклонить предложенное действие |
| `DELETE` | `/v1/ai-threads/:id` | `read` на scope-ресурс треда (свой тред) | Удалить тред |

Фаза 2 добавляет `POST /v1/workspaces/:workspaceId/ai-threads` и
`POST /v1/organizations/ai-threads` — та же форма, `scope` меняется, обработчик — тот же.

---

## 9. Конфиг

`packages/config/src/env.schema.ts` — новые переменные, **required только когда есть потребитель**
(тот же принцип, что `S3_BUCKET` стал required в M3, не раньше):

```
ANTHROPIC_API_KEY / OPENAI_API_KEY / AWS_BEDROCK_REGION — optional() до M4, required в M4 (хотя бы один)
AI_EMBEDDING_PROVIDER — какой провайдер обслуживает эмбеддинги по умолчанию (org может переопределить)
```

`docker-compose.dev.yml` уже на образе `pgvector/pgvector:pg17` (задел с M0) — в M4 добавляется
`CREATE EXTENSION IF NOT EXISTS vector;` в новую manual-migration (raw SQL, тот же класс, что §1.1).

---

## 10. Тестирование

Тестовая пирамида для этого домена смещена к integration — большая часть логики (retrieval-фильтр,
tenant-isolation, tool-confirm RBAC) это поведение на границе HTTP+DB, не чистые функции.

**Unit:**
- Chunking: длинный текст → чанки ожидаемого размера с overlap, границы по параграфам
- Provider-адаптер: mock-провайдер удовлетворяет интерфейсу `AiChatProvider`/`AiEmbeddingProvider`
- Zod-схемы tool-аргументов: невалидные аргументы (например, `move_phase` на несуществующую фазу) отклоняются до вызова сервиса

**Integration (Supertest + тестовая БД, тот же паттерн, что весь `apps/api/test/`):**
- Ingest: `Page.update()` → `EmbeddingChunk` строки созданы с правильным `orgId`/`projectId`
- Re-ingest: повторный `update()` заменяет чанки, не дублирует (проверка через `DELETE...INSERT`, §3.2)
- **Tenant isolation (критично, приоритет #1):** orgId A задаёт вопрос → retrieval никогда не
  возвращает чанки orgId B, даже если построить контент специально похожим (та же дисциплина, что
  "чужая орга → 404" тест в каждом уже существующем test-файле проекта)
- SSE-эндпоинт с mock-провайдером: токены приходят по порядку, `citations` присутствуют в финальном `Message`
- Tool-call: `PROPOSED` → `confirm` → `EXECUTED` + соответствующий `ActivityEvent` в той же транзакции
- Tool-call RBAC: Member пытается confirm действие, требующее Manager+ (например, `update_field` на
  ownerId-подобное защищённое поле) → 403, `toolCall.status` остаётся `PROPOSED`
- Tool-call гонка: состояние изменилось между `PROPOSED` и `confirm` (лид удалён/фаза не существует) → 409, не 500

**Явно не тестируем:** реальные ответы реальных LLM-провайдеров (недетерминированные, дорогие,
не CI-friendly) — только контракт адаптера через mock; smoke-тест на реальном ключе — ручной, не
в автоматическом прогоне.

---

## 11. Порядок реализации

**Фаза 1 (MUST-ядро):** `EmbeddingChunk`/`AiThread`(scope=PROJECT only used)/`Message` модели +
migration → `packages/ai` (интерфейсы + Anthropic/OpenAI providers, Bedrock можно вторым) →
ingest-пайплайн (extract/chunk/embed, очередь, триггеры Page/KB/Attachment) → query-пайплайн (SSE,
retrieval, structured context) → tool-use propose/confirm для 5 инструментов → CASL + эндпоинты →
frontend chat UI.

**Фаза 2:** `scope=WORKSPACE`/`scope=ORG` — эндпоинты + фронт-переключатель скоупа (схема уже готова).

**Фаза 3:** `FR-AI-5` one-tap хелперы — канонические промпты поверх уже существующего query-пайплайна,
не новая инфраструктура.

---

## 12. Ошибки

| Сценарий | Код | Обработка |
|---|---|---|
| Провайдер недоступен/timeout | 502 | Понятная ошибка клиенту, `Message` не сохраняется как ASSISTANT (не показывать пустой ответ) |
| `orgId` без сконфигурированного `aiProvider` | 422 | "AI не настроен для этой организации" — не тихий fallback на дефолтный провайдер без ключа |
| Tool-call confirm на устаревшее состояние | 409 | См. §10 |
| Tool-call confirm без прав | 403 | `ForbiddenActionError` → `toAiToolCallError` → `toast.error` (тот же паттерн, что `toPageError`/`toKbError`, см. §6.1) — не сырой Forbidden; карточка действия в треде переходит в `REJECTED` с причиной, остаётся в истории |

---

## 13. Frontend — чат-дровер (Фаза 1, §11)

Прогнано через `ui-ux-pro-max` → `design-handoff` → `design-critique`; мокап в
`chat-drawer-mockup.html` (артефакт сессии, не в репозитории — визуальная сверка, источник истины
здесь и в коде). Все токены/примитивы — из `packages/ui`, ничего нового кроме Sheet (ниже).

### 13.1 Новый примитив — `packages/ui` Sheet

В `packages/ui` пока нет бокового панельного примитива (только центрированный `Dialog`). Правая
панель — не локальная разметка приложения (CLAUDE.md: "нужен новый примитив — добавь в
`packages/ui`"), заводится один раз, переиспользуется, если позже понадобится где-то ещё.

- Radix `Dialog` как основа (Portal + Overlay + Content), не с нуля — та же примитив-база, что
  `dialog.tsx`.
- `DialogContent`-эквивалент со стороны right: `fixed inset-y-0 right-0 h-full w-full sm:w-[400px]`,
  без `-translate-x/y-1/2` центрирования.
- Новая keyframe-пара в `globals.css` (не переиспользовать `ui-pop-anim`/`ui-pop-anim-side` — те
  8px-микросдвиги для попапов, дровер требует полноценный slide from `translateX(100%)`):
  `ui-sheet-in`/`ui-sheet-out`, `translateX(100%) → translateX(0)`, 200ms ease-out / 150ms ease-in
  (дровер крупнее попапа — чуть дольше, тот же принцип "exit быстрее enter", §7 ui-ux-pro-max).
  `prefers-reduced-motion` guard — тот же паттерн, что существующие keyframes.
- Overlay — тот же `bg-foreground/50`, что `Dialog`.

### 13.2 `ChatDrawer` — layout

Правая панель, `w-[400px]` (полная ширина на `<640px`), открывается из Files/Pages-тулбара
проекта (кнопка "Ask AI" рядом с существующими табами) — не отдельный таб (решение сессии:
дровер, не таб — не конкурирует с шириной основного контента, к тому же ближе к существующему
паттерну side-panel'ов в проекте, чем к табам верхнего уровня).

```
┌─────────────────────────────────┐
│ [Thread ▾]          [+]   [×]   │  header, 1px border-b
├─────────────────────────────────┤
│  (сообщения, scroll-slim)       │
│  User bubble (right, primary)   │
│  Assistant bubble (left, muted) │
│    CitationsList (chips row)    │
│    ActionCard[] (proposed/…)    │
│  ⋯ typing indicator             │
├─────────────────────────────────┤
│ [textarea............] [Send]   │  input dock, 1px border-t
│ Enter to send · Shift+Enter…    │
└─────────────────────────────────┘
```

- **Header**: thread-selector (`DropdownMenu`, заголовок треда truncate + chevron, `flex-1
  min-w-0`) + "New chat" (`icon-btn`, plus) + Close (`icon-btn`, x) — оба фиксированной ширины,
  никогда не сжимаются selector'ом (`flex-shrink: 0`).
- **Message list**: `scroll-slim` (существующий утилитарный класс, не переизобретать), `Message`/
  `MessageAvatar`/`MessageContent` из `packages/ui` — тот же примитив, что уже несёт Pages-комменты
  (§ pages-kb.md), не бespoke чат-эстетика.
- **Input dock**: тот же интеракшн-контракт, что `MentionTextarea` (Enter=отправить,
  Shift+Enter=перенос, disabled во время стрима) — БЕЗ mention-расширения (чат не про @-упоминания
  участников орги, только текст) — новый компонент `ChatTextarea`, не форк `MentionTextarea`, но
  тот же keydown-паттерн (переиспользовать логику, не только визуал).

### 13.3 `CitationsList.tsx`

- Ряд чипов под ассистентским сообщением, **только если `citations.length > 0`** — пустой массив
  не рендерит пустой контейнер.
- На чип: `sourceType` → иконка (`lucide-react`, тот же набор, что весь проект): `PAGE` → `FileText`,
  `KB_ARTICLE` → `BookOpen`, `ATTACHMENT` → `Paperclip`.
- **Труд-ревью (design-critique):** `label` — сырой текст чанка до 80 символов (§1.3 бэкенда), в
  чип НЕ помещается целиком. Чип — `max-w-[140px] truncate`, полный текст — `Tooltip` по
  hover/focus (существующий `packages/ui` примитив). Ряд чипов — `overflow-x-auto` (горизонтальный
  скролл), НЕ `flex-wrap` — перенос на 2-3 строки отодвигал бы сам ответ вниз, цитаты вторичны.
- Дедуп по `sourceId` уже сделан бэкендом (§1.3), максимум 5 — фронт не режет повторно.

### 13.4 `ActionCard.tsx`

Props: `toolName: ToolName`, `params: Record<string, unknown>`, `status: ToolCallStatus`,
`result?: unknown`, `errorMessage?: string`, `onConfirm`, `onReject`, `isPending: boolean`.

**Труд-ревью (design-critique) — два разных "готово", не одно.** Read-only инструменты
(`draft_email`/`summarize_files`) приходят от бэкенда УЖЕ `EXECUTED` без предложения (§6 бэкенда) —
если рисовать это тем же зелёным "✓ Executed", что реальная мутация CRM (`move_phase` и т.п.),
пользователь перестаёт читать карточки внимательно ещё до первого реального confirm. Различаем по
`TOOL_POLICY[toolName]` (уже есть на бэкенде, `tool-schema.ts` — фронту нужен тот же список
side-effecting-имён как константа в `api-schemas`, не дублировать вручную):

| `status` | side-effecting (`move_phase`/`update_field`/`create_task`) | read-only (`draft_email`/`summarize_files`) |
|---|---|---|
| `PROPOSED` | Confirm (`variant="default"`, единственная primary-кнопка в карточке) + Reject (`variant="outline"`), `gap-2`, `isPending` дизейблит обе и подменяет текст нажатой на "Confirming…"/"Rejecting…" | *(никогда — read-only не проходит через PROPOSED)* |
| `EXECUTED` | `Badge variant="success"` "✓ Executed" + результат (`diff`-строка) | `Badge variant="outline"` "Draft ready" / "Summary ready" — БЕЗ галочки, ничего в CRM не менялось |
| `REJECTED` | `Badge variant="destructive"` "Rejected" + `errorMessage` (§12: "insufficient permissions" / "state changed") строкой под бейджем | — |

- Диф параметров — не JSON-дамп: маппинг человекочитаемых полей на инструмент (`move_phase` →
  "Phase: {old} → {new}" по `fromPhaseName`/`toPhaseName`, если бэкенд их отдаёт в `result`;
  `update_field` → построчно изменённые ключи; `create_task` → заголовок задачи + due).
- Карточка **остаётся в истории после решения** (не исчезает, не сворачивается) — итог виден при
  повторном открытии треда.
- 403 на confirm НЕ переводит карточку в терминальное состояние — `AiThreadsService.confirmToolCall`
  откатывает `CONFIRMED` обратно в `PROPOSED` перед тем, как бросить `ForbiddenActionError` (см.
  `apps/api/src/modules/ai/ai-threads.service.ts`) — тот же callId confirmable повторно, если роль
  актора изменится.

### 13.5 Стриминг + доступность

- SSE-токены накапливаются в локальный `content` стейт, ре-рендерятся как обычный текст (не
  markdown в Фазе 1 — `content` из бэкенда — plain text, парсер не нужен, не заводить его
  превентивно).
- Typing-индикатор (три точки, `ui-fade-up`-подобная пульсация) — показывается ТОЛЬКО пока не
  пришёл первый `text_delta`/`tool_call_proposed`; с первого токена индикатор заменяется реальным
  текстом без layout shift (зарезервировать `min-height` на строку).
- **Труд-ревью (a11y):** SSE-дельты НЕ оборачиваются в `aria-live="polite"` напрямую (анонс на
  каждый токен — непригодный шум для скринридера). `aria-live="polite"` регион анонсирует ОДИН раз
  на `done`/`message_saved` событие — весь готовый ответ целиком.
- Фокус: после отправки сообщения фокус остаётся в textarea (не уводится к появившемуся
  ActionCard) — пользователь может сразу писать следующее сообщение; Tab уводит к
  Confirm/Reject кнопкам по мере появления карточек, в DOM-порядке (совпадает с visual order).
