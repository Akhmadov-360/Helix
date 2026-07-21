# CLAUDE.md — Helix

Инструкции для Claude Code по этому репозиторию. Читай перед любой задачей.

## Working Rules (жёсткие)

- **НИКОГДА не делай `git commit` / `git push` без явного разрешения в этом же запросе.**
  Делай всю работу — правки, файлы, ветки — но остановись перед коммитом и спроси. Ветку создать можно;
  коммитить/пушить — нет. (Это энфорсит правило «автор читает каждый дифф до коммита».)
- **Предлагай эффективный подход с обоснованием, не тянись к дефолту фреймворка.** Дефолт берём только
  когда он **и есть** верное решение — и тогда явно скажи почему. Если есть выбор (подход A vs B) — назови
  оба, цену каждого, и рекомендуй. Молчаливый выбор дефолта = плохо; на защите каждое решение объясняется.

## Продукт

Helix — AI-native project-based CRM: **каждый лид = проект-воркспейс** (канбан-фазы, страницы, KB, файлы,
задачи, контакты, per-project RAG-чат), заводится из блюпринтов B2B/B2C. Полное описание — PRD. Строим соло,
по вехам M0–M6.

## Стек (Nest подтверждён; остальное из PRD §11)

- **Monorepo:** pnpm workspaces + Turborepo
- **Backend (apps/api):** NestJS + TypeScript **strict**
- **DB/ORM:** Prisma + PostgreSQL 17 (pgvector — с M4)
- **Валидация/контракты:** **Zod** (`packages/api-schemas`) — НЕ class-validator (см. Конвенции)
- **Authz:** CASL (policy guards) · **Async:** Redis + BullMQ · **Files:** S3 SDK (S3/MinIO)
- **Frontend (apps/web, с M1):** Vite + React, React Router, TanStack Query (server state),
  Zustand (UI state), Tailwind + shadcn/ui, dnd-kit (kanban), TipTap (pages)
- **Docs:** @nestjs/swagger → OpenAPI

## Раскладка монорепо

`apps/api`, `apps/web` · `packages/`: `db` (Prisma — источник истины домена), `api-schemas` (Zod-контракты
FE/BE), `config` (env через Zod), `ui` (shadcn-based дизайн-система), `ai` (промпты/RAG/адаптеры — M4),
`eslint-config`, `typescript-config`. В M0 реально нужны `api`, `db`, `api-schemas`, `config`.

## Источники истины (НЕ выдумывай, НЕ дублируй)

- **Домен** → `packages/db/prisma/schema.prisma`. Модель спроектирована; сущности не изобретай.
- **Почему так** → `docs/decisions.md`. Принципы P1–P4 + решения по сущностям. Расхождение — флагни, не меняй сам.
- **Контракты API** → `packages/api-schemas`. Zod — единственный источник; типы FE/BE выводятся (`z.infer`).

## Принципы домена (из decisions.md — соблюдай во ВСЁМ коде)

- **P1 Стабильные ссылки:** связи/логика/контракт — по `id`/`key`, никогда по `name`/localized-строке.
- **P2 Пережить источник:** что переживает изменение источника — хранит снапшот/id, не живую ссылку.
- **P3 Минимальный payload:** снапшоты/события — минимум для истории, без тяжёлого/дублирующего контента.
- **P4 Событие атомарно с мутацией:** ActivityEvent — в той же транзакции; email/webhook/embedding — после
  коммита (очередь, outbox против dual-write).

## Тенантность (security-критично)

- Каждая запись scoped по `orgId`. **Composite-FK backbone** (`Workspace @@unique([id, orgId])` и далее по
  цепочке) гарантирует консистентность тенанта на уровне БД.
- Каждый запрос данных фильтруется по `orgId` на **data-access слое** (Prisma middleware / repository guard),
  не только в контроллере.
- RAG-retrieval (M4) фильтруется по `orgId` + scope — **жёсткий фильтр**, не промпт-инструкция.

## Архитектурные конвенции (Nest)

- **Слои:** Controller → Service → Repository (Prisma). Контроллер тонкий, логика в сервисе.
- **Валидация:** Zod-схема из `api-schemas` через `ZodValidationPipe`. НЕ class-validator, НЕ DTO-классы.
  (Исключение: boot-time env-валидация — она не трогает тела запросов.)
- **Authz:** CASL policy guards на **каждом** эндпоинте; UI-скрытие косметическое, enforcement на сервере.
- **Interceptors:** tenant-context + audit. **Global exception filter** превращает доменные ошибки
  (FK / Restrict violation, optimistic-lock конфликт) в осмысленный HTTP (409, не 500).
- **ActivityEvent:** единый `ActivityRecorder.record(tx, event)`, принимает транзакцию (P4). НЕ `activity.create`
  вразброс по сервисам.
- **Async:** BullMQ для email / embeddings / webhooks. Dual-write БД↔очередь → outbox.

## API-конвенции

- **Response envelope:** все ответы обёрнуты в `ApiResponse<T> = { success, data, timestamp }` (тип в
  `api-schemas/common.ts`). Фронт разворачивает `.data`; не переобъявляй тип по приложениям.
- **Schema-first:** добавляя эндпоинт — сначала опиши Zod-схему в `api-schemas` (`*Schema` вход /
  `*ResponseSchema` выход), потом импортируй в контроллер. Не наоборот.
- **Пути:** контроллеры под `/v1/...` (versioned, FR-API-1). Health: `GET /health`. Swagger: `GET /docs`.

## Frontend-конвенции (действуют с M1 — форвард-разметка)

- **UI-примитивы — только из `packages/ui`** (shadcn/ui на Radix+CVA). Не переизобретай Button/Input/Dialog/
  Card. Нужен новый примитив — добавь в `packages/ui`, а не локально в приложение.
- **Композиция, не дублирование.** Приложение-специфичные компоненты собираются из примитивов `ui`
  (compose/wrap/extend), а не пишутся с нуля. Вариативность — через props + CVA-варианты, не через форк
  компонента. Один компонент — одна ответственность.
- **Не создавай структуру спекулятивно.** Слой/абстракцию заводим, когда появляется реальная сущность, а не
  «на будущее». (Пустой `entities/`-слой «про запас» — антипаттерн.)
- **LocalizedName никогда не рендерим напрямую** — только через `localize(value, locale)` (P1). `name`/`label`
  приходят как `{uz?, ru?, en?}`.
- **Состояние:** server state → TanStack Query; UI/локальное → Zustand. Не тащи серверные данные в Zustand.

## Тестирование (M3, привычка с начала)

Vitest + Supertest + тестовая БД в Docker (AAA). Покрываем **инварианты**, не только happy path. Тесты на
manual-migration-инварианты (ниже) обязательны — падают при регрессии constraint.

## Manual-migration points (расхождения schema.prisma ↔ БД)

Три инварианта живут в raw SQL, Prisma их не выражает. **Не давай `prisma migrate` их пересоздать/уронить:**

1. `Phase(workspaceId, order)` UNIQUE **DEFERRABLE INITIALLY DEFERRED**.
2. `Project` generated columns под range-фильтры горячих custom fields.
3. `ActivityEvent` иммутабельность (отзыв UPDATE/DELETE у роли приложения).

## Дисциплина скоупа

- Строим по вехам **M0–M6**. Не добавляй сущности/фичи вне текущей вехи (Page/AI/API/webhooks — свои вехи).
- Не золоти инфраструктуру раньше времени (CI, Terraform, observability — M6).

## Как работать (правила для агента — строго)

Узкое место проекта — **не** скорость генерации, а успевает ли автор понять и защитить код перед ревьюерами.

- **Мелкие ограниченные задачи.** Одна обозримая единица за раз, не «построй модуль».
- **План до кода.** Предложи подход (с альтернативами, если есть выбор), дождись подтверждения, потом пиши.
- **Читаемые диффы.** Размер — такой, чтобы человек прочитал и понял каждый перед коммитом.
- **Строй ЭТУ архитектуру.** Опирайся на `schema.prisma`, `decisions.md`, эти конвенции — не на свои дефолты.

## Key Files (пути)

- `packages/db/prisma/schema.prisma` — доменная модель (источник истины)
- `packages/db/prisma/migrations/` — миграции (raw SQL для manual-points — не давать переген)
- `docs/decisions.md` — принципы P1–P4 + решения (почему)
- `docs/specs/*` — реализационные спеки фич (напр. `auth.md`) — читать перед постройкой фичи
- `packages/api-schemas/src/` — Zod-схемы (`common.ts` → `ApiResponse<T>`, `LocalizedName`)
- `packages/config/src/` — Zod-валидированный env
- `apps/api/src/core/pipes/zod-validation.pipe.ts` — Zod-пайп
- `apps/api/src/core/filters/` — global exception filter
- `apps/api/src/core/interceptors/` — tenant-context + audit + response-envelope

## Development (как поднять)

```bash
docker compose -f docker-compose.dev.yml up -d   # postgres(+pgvector) · redis · minio
pnpm install
pnpm --filter @helix/db exec prisma migrate dev  # применить миграции
pnpm --filter @helix/db exec prisma generate      # сгенерить client
pnpm dev                                          # все dev-серверы (turbo)
pnpm build                                        # сборка
```

Порты: api `3000` · web `5173` · **postgres `5433`** (не 5432 — избегаем конфликта с системным PG) ·
redis `6379` · minio `9000/9001`. Env: `apps/api/.env` (DATABASE_URL, REDIS_URL, JWT-секреты, S3) —
валидируется через `packages/config` на старте.

## Gotchas (пополняем по ходу)

1. **Response envelope:** все ответы в `{ success, data, timestamp }`. Фронт разворачивает `.data`; тип —
   из `api-schemas`, не переобъявлять.
2. **LocalizedName:** `name`/`label` — jsonb `{uz?, ru?, en?}`, рендерить только через `localize()`.
3. **DB-порт:** docker-compose мапит на `5433`, не 5432.
4. **Manual-migration constraints:** DEFERRABLE unique / generated columns / immutability — raw SQL; `prisma
migrate` не должен их трогать (см. выше). При правке миграций — проверь, что они на месте (есть тест).
5. **Zod ≠ class-validator:** никаких `dto/`-папок и class-validator-декораторов на телах запросов.

## TS / код-конвенции

strict mode; `any` — только с явной причиной; ошибки типизированы; именование по паттернам пакета; никакого
мёртвого кода «на будущее».
