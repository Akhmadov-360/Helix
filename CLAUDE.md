# CLAUDE.md — Helix

Инструкции для Claude Code по этому репозиторию. Читай перед любой задачей.

## Working Rules (жёсткие)

- **НИКОГДА не делай `git commit` / `git push` без явного разрешения в этом же запросе.**
  Делай всю работу — правки, файлы, ветки — но остановись перед коммитом и спроси. Ветку создать можно;
  коммитить/пушить — нет. (Это энфорсит правило «автор читает каждый дифф до коммита».)
- **Предлагай эффективный подход с обоснованием, не тянись к дефолту фреймворка.** Дефолт берём только
  когда он **и есть** верное решение — и тогда явно скажи почему. Если есть выбор (подход A vs B) — назови
  оба, цену каждого, и рекомендуй. Молчаливый выбор дефолта = плохо; на защите каждое решение объясняется.
- **Комментарии в коде — по умолчанию нет.** Пиши один, только если без него читатель ошибётся: скрытый
  инвариант, security-граница, workaround под конкретный баг. Не пересказывай код, не ссылайся на спеку,
  задачу или code review.

## Продукт

Helix — AI-native project-based CRM: **каждый лид = проект-воркспейс** (канбан-фазы, страницы, KB, файлы,
задачи, контакты, per-project RAG-чат), заводится из блюпринтов B2B/B2C. Полное описание — PRD
(`docs/AI-Driven CRM & Project Management Platform.md`). Строим соло.

## Режим проекта

- **Это не MVP.** Цель — реализовать PRD целиком. Вехи M0–M6 задают порядок, а не барьер: если задача
  разблокирована и решение известно — делаем сейчас, а не «на потом».
- **Отклонения от PRD и ADR — осознанные.** Устаревшее решение можно пересмотреть: назови причину, получи
  согласие, зафиксируй новым ADR в `docs/decisions.md`. Молча не менять и молча не следовать.
- **Инфраструктуру не откладываем:** CI, IaC, observability, rate limiting — обычные задачи бэклога.
- **Сессии короткие (~30 мин) и обучающие.** Автор параллельно учит бэкенд: одна маленькая задача за раз.
  К каждому решению объясняй: **почему** так, **как** это делается (шаги, механика), **альтернативные
  способы** реализации с ценой каждого и **как это работает под капотом** (что реально происходит в БД,
  очереди, сети, фреймворке). Показывай на реальном коде репозитория.

## Стек

- **Monorepo:** pnpm workspaces + Turborepo
- **Backend (apps/api):** NestJS + TypeScript **strict**
- **DB/ORM:** Prisma + PostgreSQL 17 + pgvector
- **Валидация/контракты:** **Zod** (`packages/api-schemas`) — НЕ class-validator (см. Конвенции)
- **Authz:** CASL (policy guards) · **Async:** Redis + BullMQ · **Files:** S3 SDK (AWS S3 / RustFS локально)
- **Mail:** `MAIL_PROVIDER` = `smtp` (MailHog в dev) · `ses` · `resend` (HTTP API, прод-путь)
- **AI:** `packages/ai` — провайдеры Anthropic / OpenAI / Gemini, выбор per-org; Bedrock ещё не реализован
- **Frontend (apps/web):** Vite + React, **TanStack Router** (ADR-FE-1 — отклонение от PRD-пина React
  Router, см. decisions.md), TanStack Query (server state), Zustand (UI state), Tailwind + shadcn/ui,
  dnd-kit (kanban), TipTap (pages)
- **Docs:** @nestjs/swagger → OpenAPI

## Прод-инфраструктура

API — Render (`render.yaml`, Blueprint) · Web — Vercel (git-linked `main`, `VITE_API_URL`) · Postgres —
Supabase · Redis — Upstash (`rediss://`) · Mail — Resend · Files — S3-совместимое хранилище (`S3_*`).
Фронт и API на разных доменах: CORS с точным `WEB_ORIGIN` и `credentials: true`, refresh-cookie
cross-site-совместимая.

## Раскладка монорепо

`apps/api`, `apps/web` · `packages/`: `db` (Prisma — источник истины домена), `api-schemas` (Zod-контракты
FE/BE), `config` (env через Zod), `ui` (shadcn-based дизайн-система), `ai` (провайдеры/адаптеры),
`eslint-config`, `typescript-config`.

## Источники истины (НЕ выдумывай, НЕ дублируй)

- **Домен** → `packages/db/prisma/schema.prisma`. Модель спроектирована; сущности не изобретай.
- **Почему так** → `docs/decisions.md`. Принципы P1–P4 + решения по сущностям. Расхождение — флагни и
  предложи пересмотр (см. «Режим проекта»), не правь молча.
- **Контракты API** → `packages/api-schemas`. Zod — единственный источник; типы FE/BE выводятся (`z.infer`).
- **Реализация фич** → `docs/specs/*` — читать перед постройкой фичи.

## Принципы домена (из decisions.md — соблюдай во ВСЁМ коде)

- **P1 Стабильные ссылки:** связи/логика/контракт — по `id`/`key`, никогда по `name`/localized-строке.
- **P2 Пережить источник:** что переживает изменение источника — хранит снапшот/id, не живую ссылку
  (`ActivityEvent.actorId`, `Task.assigneeId` и т.п. — `SetNull`; дети `Organization` — `Cascade`).
- **P3 Минимальный payload:** снапшоты/события — минимум для истории, без тяжёлого/дублирующего контента.
- **P4 Событие атомарно с мутацией:** ActivityEvent — в той же транзакции; email/webhook/embedding — после
  коммита (очередь, outbox против dual-write).

## Тенантность (security-критично)

- Каждая запись scoped по `orgId`. **Composite-FK backbone** (`Workspace @@unique([id, orgId])` и далее по
  цепочке) гарантирует консистентность тенанта на уровне БД.
- `orgId` берётся из `AuthContext` (`@CurrentAuth()`, JWT-сессия), никогда из тела/параметров запроса, и
  явным параметром проходит controller → service → repository.
- Каждый запрос данных фильтруется по `orgId` в **repository** (глобального Prisma-middleware нет), не
  только в контроллере. Чужой ресурс → 404.
- **`EmbeddingChunk` — исключение из backbone:** `sourceId` полиморфный, не FK, поэтому `orgId` (и
  `projectId`/`workspaceId`) обязан быть явным фильтром в SQL каждого retrieval-запроса.
- RAG-retrieval фильтруется по `orgId` + scope — **жёсткий фильтр в SQL**, не промпт-инструкция; scope
  треда задаётся `AiThread.projectId`, а не моделью.
- Всё, что вернула LLM (аргументы tool call), — непроверенный ввод: повторный `.parse()` Zod-схемой на
  сервере, выполнение через тот же сервисный слой, что и REST, permission на confirm.

## Архитектурные конвенции (Nest)

- **Слои:** Controller → Service → Repository (Prisma). Контроллер тонкий, логика в сервисе.
- **Валидация:** Zod-схема из `api-schemas` через `ZodValidationPipe`. НЕ class-validator, НЕ DTO-классы.
  (Исключение: boot-time env-валидация — она не трогает тела запросов.)
- **Authz:** CASL policy guards (`@CheckPolicy`) на **каждом** эндпоинте; UI-скрытие косметическое,
  enforcement на сервере.
- **Global exception filter** превращает доменные ошибки (FK / Restrict violation, optimistic-lock
  конфликт) в осмысленный HTTP (409, не 500). Response envelope — `response-transform.interceptor.ts`.
- **ActivityEvent:** единый `ActivityRecorder.record(tx, event)`, принимает транзакцию (P4). НЕ `activity.create`
  вразброс по сервисам.
- **Async:** BullMQ — очереди `email`, `ingest-embeddings`, `maintenance` (разделены по природе нагрузки).
  Dual-write БД↔очередь → outbox.

## API-конвенции

- **Response envelope:** все ответы обёрнуты в `ApiResponse<T> = { success, data, timestamp }` (тип в
  `api-schemas/common.ts`). Фронт разворачивает `.data`; не переобъявляй тип по приложениям.
- **Schema-first:** добавляя эндпоинт — сначала опиши Zod-схему в `api-schemas` (`*Schema` вход /
  `*ResponseSchema` выход), потом импортируй в контроллер. Не наоборот.
- **Пути:** контроллеры под `/v1/...` (versioned, FR-API-1). Health: `GET /health`. Swagger: `GET /docs`.

## Frontend-конвенции

- **UI-примитивы — только из `packages/ui`** (shadcn/ui на Radix+CVA). Не переизобретай Button/Input/Dialog/
  Card. Нужен новый примитив — добавь в `packages/ui`, а не локально в приложение.
- **Композиция, не дублирование.** Приложение-специфичные компоненты собираются из примитивов `ui`
  (compose/wrap/extend), а не пишутся с нуля. Вариативность — через props + CVA-варианты, не через форк
  компонента. Один компонент — одна ответственность.
- **Не создавай структуру спекулятивно.** Слой/абстракцию заводим, когда появляется реальная сущность, а не
  «на будущее».
- **LocalizedName никогда не рендерим напрямую** — только через `localize(value, locale)` (P1). `name`/`label`
  приходят как `{uz?, ru?, en?}`. Строки UI — в `shared/i18n/locales/{ru,en,uz}.json`.
- **Состояние:** server state → TanStack Query; UI/локальное → Zustand. Не тащи серверные данные в Zustand.
- **UI-изменения проверяем в браузере**, не только типами и тестами: supertest/vitest не ловят CORS и
  визуальные регрессии.

## Тестирование

Vitest + Supertest + тестовая БД в Docker (AAA). Покрываем **инварианты**, не только happy path. Тесты на
manual-migration-инварианты (ниже) обязательны — падают при регрессии constraint.

## Manual-migration points (расхождения schema.prisma ↔ БД)

Инварианты живут в raw SQL, Prisma их не выражает. **Не давай `prisma migrate` их пересоздать/уронить:**

1. `Phase(workspaceId, order)` UNIQUE **DEFERRABLE INITIALLY DEFERRED**.
2. `Project` generated columns под range-фильтры горячих custom fields.
3. `ActivityEvent` иммутабельность (отзыв UPDATE/DELETE у роли приложения).
4. `Project.rank` **COLLATE "C"** — байтовая коллация под fractional-indexing.
5. `Contact.company` composite-FK **`ON DELETE SET NULL ("companyId")`** (partial, PG15+) — полный
   SET NULL уронил бы `orgId` NOT NULL. Подробности — `decisions.md`.
6. `Page.searchText` — функциональный GIN-индекс `to_tsvector('simple', "searchText")`. Сам столбец
   обычный (Prisma-колонка), индекс — raw SQL.
7. `KBArticle.searchText` — тот же приём, что #6.
8. `EmbeddingChunk.embedding` — `CREATE EXTENSION vector` + HNSW-индекс (`vector_cosine_ops`). Сам столбец —
   `Unsupported("vector(1536)")`, Prisma не выражает ни extension, ни vector-индексы — raw SQL. Размерность
   фиксирована: смена embedding-модели на другую размерность = миграция колонки.

**Migration guard** (`packages/db/scripts/migration-guard`, workflow `migration-guard.yml`) на каждом PR: правка/удаление
уже применённой `migration.sql` и `DROP INDEX "phase_ws_order_unique"` — жёсткая ошибка; `DROP TABLE/COLUMN/TYPE`, смена типа,
`RENAME`, `TRUNCATE`, `DELETE FROM` — красный CI, пока на PR нет метки `migration-reviewed` (план бэкфилла описан в PR).
Локально: `pnpm --filter @helix/db check-migrations --base origin/main`; правила покрыты тестами (`pnpm --filter @helix/db test`).

> Каждый `migrate dev` попутно генерит `DROP INDEX "phase_ws_order_unique"` (#1) — **вырезать вручную**
> из миграции перед применением (см. decisions.md, gotcha #4). Если `migrate dev --create-only` упирается
> в drift — писать `migration.sql` вручную, применять `prisma db execute --file`, затем
> `prisma migrate resolve --applied`.

## Известные пробелы (бэклог на 2026-09-30 — перед задачей сверяй с кодом)

Сначала то, решение чего известно:

- Resend: подтвердить свой домен и сменить `MAIL_FROM` (sandbox-адрес `onboarding@resend.dev` доставляет
  только владельцу аккаунта — инвайты и уведомления другим людям не уходят).
- RAG: строгий guardrail в system prompt (`ai-threads.service.ts`), лимит токенов на итоговый `messages[]`
  (сейчас `HISTORY_MESSAGE_LIMIT` считает сообщения), гибридный retrieval (GIN `to_tsvector` на
  `EmbeddingChunk.content` + RRF, `hnsw.ef_search`).
- 30 внешних ключей без индексов (Supabase performance advisor), в основном составные `[xId, orgId]`.
- Очереди: `drainDelay` 300, `stalledInterval`, `delayed:false`; миграция на pg-boss — только после
  пересмотра (Supabase Disk IO budget маленький).
- `DELETE /organizations/:id` и удаление аккаунта (каскады в схеме готовы).
- Сворачиваемый сайдбар; превью блюпринтов (thumbnail); Dockerfile для web + полный compose.

Требуют дизайн-прохода (ADR): FR-WS-5/6 (автоматизации фаз, WIP-лимиты), export data / GDPR, вложения в
KB и импорт файлов в Pages (общий корень — `Attachment.projectId`), FR-NOTIF-4 и due-date уведомления,
FR-AI-4/5 (workspace/org-треды, one-tap хелперы), адаптер Bedrock (FR-AI-6), токен-бюджеты и AI cost
telemetry, антивирусный скан файлов, сквозной поиск и семантический поиск, SSO/OIDC, email-верификация.

Целиком не начато: M5 (API-ключи, `POST /v1/public/leads`, вебхуки с HMAC/retries/delivery log, rate
limiting, idempotency keys) и M6 (visibility=ASSIGNED, кастомные роли, `WorkspaceMember`-оверрайды, полный
AuditLog, RLS, CI, AWS IaC, pino/Sentry/tracing/метрики, Secrets Manager).

## Скиллы и инструменты (что и когда применять)

Приоритет: `CLAUDE.md` и ADR важнее любого скилла; скилл подсказывает метод, а не решает за проект.

- **Дизайн бэкенда:** `engineering:system-design` и `backend-architect` (границы сервисов, контракты API,
  вебхуки, rate limiting, идемпотентность); решение фиксируем через `engineering:architecture` → ADR в
  `docs/decisions.md`.
- **БД:** `database-design` (схема, индексы, миграции) + `zizi-skills:database-optimization` (принципы;
  его TypeORM-примеры к нам не относятся). Стек БД не пересматриваем: Postgres + Prisma. План запроса —
  `EXPLAIN` через Supabase MCP (`execute_sql`, `get_advisors`).
- **Frontend (`apps/web`, `packages/ui`):** `vercel-react-best-practices` — только правила про ререндеры,
  бандл, списки (у нас Vite SPA: правила про Next.js/RSC не применять); `vercel-composition-patterns` —
  для компонентов `packages/ui`; визуал — `ui-ux-pro-max`, `frontend-design`, `design:accessibility-review`.
- **Тесты и отладка:** `superpowers:test-driven-development`, `engineering:testing-strategy`,
  `superpowers:systematic-debugging`.
- **Перед «готово»:** `superpowers:verification-before-completion`; ревью — `/code-review`, `/simplify`,
  `/security-review` (особенно на тенантность и authz).
- **Поведение при кодинге:** `karpathy-guidelines` — явные допущения, минимум кода, точечные правки,
  проверяемые критерии успеха.
- **Актуальная документация библиотек:** Context7 MCP (запрос + `use context7`) для NestJS, Prisma, Zod,
  TanStack, BullMQ вместо ответа по памяти; Firecrawl — для страниц вне доков библиотек, если подключён.
- **Не применять:** `zizi-skills:git-sync` (запрещает работу в `main`), `zizi-skills:frontend` и
  `tabler-ui` (Vue/Tabler).

## Как работать (правила для агента — строго)

Узкое место проекта — **не** скорость генерации, а успевает ли автор понять и защитить код.

- **Мелкие ограниченные задачи.** Одна обозримая единица за раз, не «построй модуль».
- **План до кода** там, где есть выбор: предложи подход с альтернативами, дождись подтверждения. Для
  очевидной маленькой правки — сразу делай.
- **Читаемые диффы.** Размер — такой, чтобы человек прочитал и понял каждый перед коммитом.
- **Строй ЭТУ архитектуру.** Опирайся на `schema.prisma`, `decisions.md`, эти конвенции — не на свои дефолты.

## Key Files (пути)

- `packages/db/prisma/schema.prisma` — доменная модель (источник истины)
- `packages/db/prisma/migrations/` — миграции (raw SQL для manual-points — не давать переген)
- `docs/decisions.md` — принципы P1–P4 + решения (почему)
- `docs/specs/*` — реализационные спеки фич
- `packages/api-schemas/src/` — Zod-схемы (`common.ts` → `ApiResponse<T>`, `LocalizedName`)
- `packages/config/src/` — Zod-валидированный env
- `packages/ai/src/` — провайдеры чата/эмбеддингов, `provider-registry.ts`
- `apps/api/src/core/` — `auth-context`, `authz` (CASL), `pipes/zod-validation.pipe.ts`, `filters/`,
  `interceptors/response-transform.interceptor.ts`, `queue/queue.module.ts`, `storage/s3.service.ts`
- `apps/api/src/modules/ai/` — RAG: `ingest-embeddings.worker.ts`, `embedding-chunk.repository.ts`,
  `ai-threads.service.ts`, `tool-schema.ts`, `tool-call-executor.ts`
- `render.yaml` — Render Blueprint (прод API)

## Development (как поднять)

```bash
docker compose -f docker-compose.dev.yml up -d   # postgres(+pgvector) · redis · s3 (RustFS) · mailhog
pnpm install
pnpm --filter @helix/db exec prisma migrate dev  # применить миграции
pnpm --filter @helix/db exec prisma generate      # сгенерить client
pnpm dev                                          # все dev-серверы (turbo)
pnpm build                                        # сборка
```

Порты: api `3000` · web `5173` · **postgres `5433`** (не 5432 — избегаем конфликта с системным PG) ·
redis `6379` · s3 `9000/9001` · mailhog `1025/8025` · тестовая БД `5434` · prisma studio `5555`.
Env: `apps/api/.env` (DATABASE_URL, REDIS_URL, JWT-секреты, S3, mail) — валидируется через
`packages/config` на старте; шаблон — `apps/api/.env.example`.

### Демо-логины (ручное тестирование)

`pnpm db:seed` (`packages/db/prisma/seed.ts`, идемпотентный) заводит 5 юзеров в одной орге — по одному на
каждую роль, все с паролем `helix-demo-2026`:

| Email | Пароль | Роль |
| --- | --- | --- |
| `owner@helix.dev` | `helix-demo-2026` | OWNER |
| `admin@helix.dev` | `helix-demo-2026` | ADMIN |
| `manager@helix.dev` | `helix-demo-2026` | MANAGER |
| `member@helix.dev` | `helix-demo-2026` | MEMBER |
| `viewer@helix.dev` | `helix-demo-2026` | VIEWER |

Плюс воркспейс "Demo Board" с дефолтными фазами (lead/in-progress/won/lost) и 7 демо-проектов по колонкам —
для ручной проверки RBAC-матрицы и канбана без API-клиента.

## Команды проекта (что и когда)

Единственный источник — `package.json` каждого пакета. Ниже — что реально есть сейчас и когда применять.

**Оркестрация (turbo, из корня — по всем пакетам с учётом графа):**

| Команда | Что / когда |
| --- | --- |
| `pnpm build` | Собрать монорепо (либы → apps). Перед первым `pnpm dev` и перед показом/коммитом. |
| `pnpm typecheck` | `tsc --noEmit` по всем. **Обязательно отдельно** — SWC/vitest типы НЕ проверяют. |
| `pnpm lint` | ESLint (flat) по всем. |
| `pnpm test` | turbo → vitest в `apps/api`. Требует поднятую тестовую БД (5434). |
| `pnpm dev` | Все dev-серверы параллельно (persistent). Перед первым разом — `pnpm build`. |

**Инфра (docker):**

| Команда | Что / когда |
| --- | --- |
| `pnpm infra:up` / `pnpm infra:down` | Поднять/остановить postgres(5433)+redis+s3+mailhog. `down` сохраняет тома. |
| `docker compose -f docker-compose.dev.yml up -d helix-test-db` | Только тестовая БД (5434, эфемерная, tmpfs). |
| `docker compose -f docker-compose.dev.yml ps` | Статус + health. |
| `docker compose -f docker-compose.dev.yml down -v` | Снести **с томами** (чистый старт, стирает данные). |

**БД / Prisma (после правки `schema.prisma`):**

| Команда | Что / когда |
| --- | --- |
| `pnpm db:migrate` | Создать + применить миграцию (dev). Основная при изменении схемы. |
| `pnpm db:generate` | Перегенерить Prisma Client. |
| `pnpm --filter @helix/db exec prisma migrate status` | «БД в актуальном состоянии?». |
| `pnpm --filter @helix/db migrate:deploy` | Только применить существующие (прод/CI, не создаёт новых). |
| `pnpm --filter @helix/db studio` | GUI на данные (5555). |
| `pnpm --filter @helix/db check-migrations --base origin/main` | Проверить миграции текущей ветки так же, как CI. |
| `pnpm --filter @helix/db test` | Unit-тесты правил migration guard (без БД). |
| `... prisma migrate dev --create-only --name X` | Пустая миграция под **manual-migration point** (raw SQL заполняем руками; НЕ давать prisma переген). |

**apps/api (Nest):**

| Команда | Что / когда |
| --- | --- |
| `pnpm --filter @helix/api dev` | `nest start --watch` (3000). |
| `pnpm --filter @helix/api build` / `start` | `nest build` → `dist` / `node dist/main.js` (после build). |
| `pnpm --filter @helix/api test` · `test:watch` | vitest run / watch. |
| `pnpm --filter @helix/api exec vitest run test/<файл>.spec.ts` | Прогнать один спек-файл. |

**apps/web (Vite):** `pnpm --filter @helix/web dev` (5173) · `build` · `preview` (прод-сборка локально).

**Пакеты `db` / `api-schemas` / `config`:** `build` (tsc → `dist`), `dev` (`tsc -w`), `typecheck`, `lint`.
`@helix/db build` дополнительно делает `prisma generate`.

**Типовые цепочки:**

- Первый запуск: `pnpm infra:up` → `pnpm install` → `pnpm db:migrate` → `pnpm build` → `pnpm dev`.
- После правки схемы: `pnpm db:migrate`.
- Перед коммитом: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

**Предупреждения:**

- vitest трансформит через **SWC → типы не проверяет**; латентные type-ошибки ловит только `pnpm typecheck`.
- Тесты бьют по БД на **5434** (не dev 5433); global-setup: `migrate deploy` + `beforeEach TRUNCATE`.
- Перед первым `pnpm dev` — `pnpm build` (либы должны эмитить `dist`, иначе гонка на старте).
- `prisma generate` падает с EPERM, если запущены дублирующие `nest start --watch` / `dist/main` (держат
  engine-DLL) — убить процессы, потом генерировать.

## Gotchas (пополняем по ходу)

1. **Response envelope:** все ответы в `{ success, data, timestamp }`. Фронт разворачивает `.data`; тип —
   из `api-schemas`, не переобъявлять.
2. **LocalizedName:** `name`/`label` — jsonb `{uz?, ru?, en?}`, рендерить только через `localize()`.
3. **DB-порт:** docker-compose мапит на `5433`, не 5432.
4. **Manual-migration constraints:** DEFERRABLE unique / generated columns / immutability — raw SQL; `prisma
   migrate` не должен их трогать (см. выше). При правке миграций — проверь, что они на месте (есть тест).
5. **Zod ≠ class-validator:** никаких `dto/`-папок и class-validator-декораторов на телах запросов.
6. **BullMQ на проде:** на каждом `@Processor` — `drainDelay: 60` (дефолт 5с = опрос Redis каждые 5с и
   сгоревший лимит Upstash); cron-джобы регистрировать fire-and-forget в `OnModuleInit`, не `await`
   (иначе при медленном Redis Nest не доходит до `listen()` и всё отдаёт 502); `maxRetriesPerRequest: null`
   обязателен для blocking-команд.
7. **Redis URL:** Upstash требует `rediss://` (TLS); `redis://` = 0 команд и зависание.
8. **Исходящий SMTP на PaaS блокируется** (обнаружено на Railway) — прод-почта только через HTTP API (Resend).
   `MAIL_FROM` обязан быть на подтверждённом домене, sandbox-адрес шлёт только владельцу аккаунта.
9. **CORS:** `credentials: include` требует точного origin (не wildcard) — `WEB_ORIGIN` на API должен
   совпадать с доменом Vercel.
10. **Docker-образы фиксируем по версии, не `latest`.** MinIO убрал публичные образы (Docker Hub, Quay) —
    локально S3 обслуживает RustFS (`s3`/`s3-init` в compose). Кэш Docker скрывает такие потери: проверять
    `docker compose up` на чистой машине, т.е. в CI.
11. **Turbo-задача, которой нужен сгенерированный артефакт, обязана явно зависеть от задачи, которая его
    создаёт** (`packages/db/turbo.json`: `typecheck` ждёт `build`, где `prisma generate`). Локально клиент
    уже лежит в `node_modules`, и гонка не видна; воспроизводится только в чистом клоне.
12. **Supabase:** маленький Disk IO budget на низких тарифах — письмо-предупреждение может приходить от
    штатных бэкапов и интроспекции, не от кода приложения (проверять `pg_stat_statements`).

## TS / код-конвенции

strict mode; `any` — только с явной причиной; ошибки типизированы; именование по паттернам пакета; никакого
мёртвого кода «на будущее».
