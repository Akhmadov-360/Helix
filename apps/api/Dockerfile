# Собирается из КОРНЯ монорепы (Railway: Root Directory = "." или явный build context "."),
# не из apps/api — pnpm workspace резолвит зависимости (@helix/db, @helix/api-schemas,
# @helix/config, @helix/ai) относительно корня, отдельный контекст их не увидит.
#
# node:22-slim (Debian, glibc), не alpine — Prisma генерит бинарник движка под платформу
# сборки БЕЗ явного binaryTargets в schema.prisma (осознанно, см. комментарий там же); alpine
# добавил бы musl-специфичные проблемы совместимости, которых мы не хотим отлаживать под дедлайн.
FROM node:22-slim AS build
# Prisma генерит движок под openssl, установленный В ЭТОМ образе на момент `prisma generate` —
# без него подставляет дефолт вслепую ("Prisma failed to detect the libssl/openssl version",
# видели на сборке) и рискует не найти нужную либу в рантайме. Ставим явно, не полагаемся на
# то, что уже случайно есть в базовом слое node:22-slim.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

# Сначала манифесты (кэш-слой) — pnpm install перезапускается только когда меняются
# package.json/lockfile, не на каждое изменение исходников.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/api-schemas/package.json packages/api-schemas/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
RUN pnpm install --frozen-lockfile

COPY . .
# @helix/db build генерит Prisma Client (prisma generate) сам, см. package.json — не дублируем
# отдельным шагом; turbo строит apps/api и ВСЕ его workspace-зависимости в правильном порядке.
RUN pnpm turbo run build --filter=@helix/api...

FROM node:22-slim AS runtime
# Тот же openssl, что в build — рантайм-стадия НЕ наследует установленные в build пакеты ОС,
# только скопированные файлы /repo; без этого сгенерённый в build-стадии Prisma-движок мог бы
# не найти нужную либу здесь и упасть на первом запросе к БД, а не на старте контейнера.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
ENV NODE_ENV=production
WORKDIR /repo

# Прод-образ — весь /repo с полным node_modules (dev-зависимости включительно). Не самый
# компактный вариант (`pnpm deploy` дал бы куда меньший образ), но для дедлайна предсказуемость
# важнее размера — точный повтор команд из pnpm build, без риска словить edge-case изоляции
# зависимостей. Урезать образ — кандидат на M6 (там же плановая CI/CD-инфраструктура).
COPY --from=build /repo /repo

EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
