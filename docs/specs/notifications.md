# docs/specs/notifications.md — Notifications / Email (M2, этап 2)

> **Назначение.** Реализационная спека второго среза M2. Claude Code читает перед кодом.
> Решения зафиксированы с обоснованием — **не разворачивать обратно** без флага.
> Соблюдать `CLAUDE.md` (Controller→Service→Repository, envelope, AllExceptionsFilter) и
> `docs/decisions.md` (P4 — «событие в транзакции, побочный эффект после коммита через очередь»).
>
> **Зачем этот срез вторым, не третьим.** Технически независим от Custom Fields (этап 1) и от
> Blueprints (этап 3) — банкуем рабочий async-пайплайн (Redis/BullMQ реально подключены, письмо
> реально уходит) **до** того, как Blueprints научится настраивать его через
> `notificationDefaults`. Так третий срез добавляет конфигурацию поверх уже работающей трубы, а не
> строит трубу и конфигурацию одновременно.
>
> **Это первое место в кодовой базе, где вторая половина P4 («после коммита — через очередь»)
> реализуется физически.** Первая половина (событие в той же транзакции) уже есть — `ActivityRecorder`.
> Паттерн, который здесь появляется, дальше переиспользуют webhooks (M5) и embeddings (M4) — важно
> сделать его один раз правильно, не специфично для email.

---

## 0. Скоуп

**В скоупе:** мейлер-абстракция (SES prod / SMTP-MailHog dev) · очередь `email` (BullMQ) · триггер
«новый лид» (FR-NOTIF-1) · резолв получателей (owner + assignees) · брендированный HTML-шаблон
(FR-NOTIF-5) · retry/backoff на транспортных ошибках · docker-compose MailHog для локальной разработки.

**НЕ в скоупе (свои вехи или сознательно урезано):**
- Per-user notification preferences и digests (FR-NOTIF-4, **SHOULD**, не MUST) — нет ни модели, ни UI.
- **Запись** `notificationDefaults` в `Workspace.settings` — это делает инстанцирование блюпринта
  (этап 3, `docs/specs/blueprints.md` §3.1), не этот срез. Здесь (§4) NotificationsService уже **умеет
  прочитать** `settings.notifications`, если он там есть (контракт согласован заранее с блюпринтами,
  чтобы не переделывать резолвер получателей повторно на этапе 3) — но без Blueprints это поле у
  воркспейса просто всегда пусто, и резолвер падает на жёсткий дефолт.
- Ручной `PATCH`-эндпоинт редактирования `settings.notifications` **вне** инстанцирования блюпринта —
  не строим (FR-NOTIF-4 SHOULD).
- Другие триггеры письма (смена фазы, WON/LOST, напоминания о задачах) — FR-NOTIF-1 говорит только
  про **новый лид**; остальные события расширяют этот же пайплайн позже, без переделки.
- Webhook-доставка (`webhook-delivery` очередь) — M5, отдельная спека; общая инфраструктура (Redis,
  паттерн «enqueue после коммита», retry/backoff) переиспользуется без изменений.
- Admin job-health view (PRD §12.5) — наблюдаемость за очередями в целом относится к M6
  (observability); здесь — только структурированные логи на failure (§7).
- Транзакционный outbox (буквальная таблица) — обсуждается и сознательно отвергается в §3.

---

## 1. Архитектура — поток данных

```
ProjectsService.create()
  │
  ├─ $transaction: Project.create + ActivityRecorder.record("project.created")   [P4, часть 1]
  │  (уже реализовано, projects.service.ts)
  │
  ├─ (транзакция закоммичена, $transaction() вернул управление)
  │
  └─ NotificationsService.enqueue("lead.created", { orgId, projectId })          [P4, часть 2 — НОВОЕ]
       │
       ▼
  BullMQ queue "email"  (Redis)
       │
       ▼
  EmailWorker.process(job)
       │
       ├─ рефетч Project + owner + assignees СВЕЖИМИ (§4) — не то, что было на момент enqueue
       ├─ резолв получателей (§5)
       ├─ рендер HTML-шаблона (§6)
       └─ MailerService.send(...)  →  SesMailer | SmtpMailer  (§8)
```

`NotificationsService` — тонкий фасад над BullMQ `Queue` (`@nestjs/bullmq` или прямой `bullmq.Queue`,
решить при реализации по знакомству со стеком, оба варианта не меняют контракт этой спеки).
`EmailWorker` — отдельный `Processor`/consumer, живёт в том же Nest-приложении (не отдельный процесс —
на масштабе Helix это не оправдано, отдельный worker-процесс добавит деплой-сложность без выгоды).

---

## 2. `enqueue` после коммита, не outbox-таблица — почему безопасно

`Prisma.$transaction(async tx => {...})` **коммитит транзакцию, когда переданный колбэк резолвится, до
того как сам `$transaction()` вернёт управление вызывающему коду.** Значит: код **после** `await
this.prisma.client.$transaction(...)` в `ProjectsService.create()` гарантированно выполняется уже после
коммита — `NotificationsService.enqueue(...)`, вызванный там, не может «убежать вперёд» незакоммиченных
данных.

**Отвергнуто: буквальный outbox (таблица `OutboundEvent` + отдельный poller).** `decisions.md` (P4)
называет outbox паттерном **против** dual-write, но не обязывает строить его буквально — здесь
dual-write и так не возникает: BullMQ enqueue происходит **после**, а не вместо/параллельно записи в
Postgres, окна рассинхрона писать/не писать нет. Buквальный outbox добавил бы таблицу + poller-процесс
ради защиты от одного конкретного отказа (см. ниже), которого мы сознательно не страхуем в v1.

**Принятый остаточный риск:** если процесс упадёт **между** `$transaction()` (уже закоммичен) и
`enqueue()` (ещё не вызван) — лид создан, письмо не уйдёт и не будет ретраиться (в очередь оно не
попало). Окно — микросекунды, эффект — пропущенное **письмо**, не потеря данных о лиде. Для v1 приемлемо
(email — уведомление, не источник истины); если станет проблемой на практике — тогда и добавить outbox,
не заранее.

---

## 3. Job payload — минимальный, не денормализованный (P3)

```ts
interface LeadCreatedJobData {
  orgId: string;
  projectId: string;
}
```

**Не** кладём в job готовый HTML/имена/email получателей на момент enqueue — тот же принцип, что
`ActivityEvent` payload (P3, минимум для восстановления контекста). Причина не только в размере: между
enqueue и обработкой job (retry может растянуть это на минуты) владелец/участники лида могли поменяться
— рефетч на **старте обработки** гарантирует письмо уйдёт с актуальными получателями и данными, а не с
снимком на момент создания. `projectId`+`orgId` — тенант-скоуп обязателен и здесь (worker резолвит
получателей внутри своей орги, чужой `projectId` по ошибке — defensive re-check `orgId` при рефетче).

---

## 4. Резолв получателей (FR-NOTIF-1)

Конфигурация письма «новый лид» на уровне воркспейса — узкий, заранее известный подключ в
`Workspace.settings` (Json, уже есть в схеме; typed-контракт не заводим, читаем один известный
путь):

```ts
const config = workspace.settings?.notifications?.newLead
  ?? { email: true, recipients: ["owner", "assignees"] };  // жёсткий дефолт

if (!config.email) return; // блюпринт явно выключил письма для этого воркспейса — не шлём, не логируем как ошибку

const recipients = [
  config.recipients.includes("owner") ? project.owner?.email : null,
  ...(config.recipients.includes("assignees") ? project.assignees.map(a => a.email) : []),
].filter(unique);
```

`settings.notifications.newLead` заполняется **только** инстанцированием блюпринта
(`blueprints.md` §3.1) — этот срез его не пишет, только читает если есть. Без Blueprints (или для
воркспейсов, созданных не из блюпринта) `settings.notifications` всегда пуст → жёсткий дефолт,
поведение не отличается от «просто email-пайплайна без блюпринтов».

**Пустой `recipients` — больше не «частый», а «редкий и осознанный» случай.** `decisions.md` (ADR
«Project.ownerId дефолтится создателем при create») — `ownerId` подставляется создателем лида на
`POST /projects`, если не передан явно. Owner отсутствует только когда его **явно** обнулили через
`POST /projects/:id/reassign { ownerId: null }` (Manager+ вернул лид «в пул») — осознанное
управленческое действие, не забытое поле формы.

**Решено:** если `recipients` пуст (owner explicitly null И assignees пусты, либо `recipients`
блюпринта сузили до пустого набора) — **не отправлять**, лог `info` с `projectId` (не `error` — не
сбой, а состояние «лид в пуле» или намеренно тихий воркспейс). Fallback на создателя не нужен:
дефолт-владелец уже закрывает подавляющее большинство случаев честно.

---

## 5. HTML-шаблон (FR-NOTIF-5) — template-функция, не новая зависимость

Одна TS-функция `renderLeadCreatedEmail(data): { subject: string; html: string; text: string }` —
строковый шаблон с инлайновым CSS (email-клиенты не грузят внешние стили), без MJML/React-Email или
другого шаблонизатора как зависимости. **Не золотить**: на один-два вида письма (сейчас — только
`lead.created`) отдельный движок — вес без выгоды; понадобится третий-четвёртый шаблон с общим
лейаутом — тогда выносить общий враппер функцией, не тянуть библиотеку заранее.

Обязательный элемент — **deep link** на лид (`{APP_URL}/projects/:id/contacts`, тот же путь, что уже
использует фронт) — FR-NOTIF-5 явно требует ссылку на Project, не просто текст письма.

`text`-версия (plain-text fallback) — обязательна рядом с `html` (стандартная гигиена email-доставки,
снижает spam-score).

---

## 6. Retry / backoff / отказ

BullMQ встроенный механизм, без кастомного DLQ:

```ts
{ attempts: 5, backoff: { type: "exponential", delay: 30_000 } }
```

5 попыток, экспоненциально от 30 секунд (~30с/1мин/2мин/4мин/8мин) — покрывает транзиентные отказы SES
(rate limit, временная недоступность) без агрессивного долбления. Исчерпал попытки → job остаётся в
BullMQ failed-set (это и есть DLQ для v1, отдельную очередь не заводим — `docs/decisions.md`-стиль:
инструмент уже даёт нужное, велосипед не нужен) + структурированный `error`-лог с `projectId`/`orgId`
для ручного разбора. Admin-UI над failed-set — не в скоупе (§0, M6).

**Идемпотентность:** не гарантируем (at-least-once). Дубль письма при редеривери — минимальная
неприятность, не баг корректности; отдельный dedup-ключ/таблица ради этого не строим (тот же принцип,
что «не проверять use-count перед удалением поля» в `custom-fields.md` §6 — цена защиты выше цены отказа).

---

## 7. Мейлер-абстракция и провайдеры

```ts
interface MailerService {
  send(msg: { to: string[]; subject: string; html: string; text: string }): Promise<void>;
}
```

Два имплементации, выбор через `MAIL_PROVIDER`:
- **`SesMailerService`** (prod) — AWS SDK SES client. Креды — **default credential provider chain**
  (IAM role в реальном деплое), не кастомные `AWS_ACCESS_KEY_ID`/`SECRET` в env — стандартная AWS-практика,
  не изобретаем свой секрет-канал.
- **`SmtpMailerService`** (dev) — `nodemailer` поверх SMTP, указывает на MailHog (`docker-compose.dev.yml`,
  §8) в локальной разработке.

`MAIL_PROVIDER=ses|smtp` — тот же приём, что остальной `packages/config`: явный выбор, не автоопределение
по `NODE_ENV` (эксплицитность дешевле неявной магии на дебаге «почему письмо ушло не туда»).

---

## 8. Конфигурация — `packages/config` + `docker-compose.dev.yml`

`packages/config/src/env.schema.ts` уже несёт комментарий "Redis → M2 (BullMQ)" на `REDIS_URL:
optional()` — этим срезом ужесточаем до **обязательного** (тот же приём, что был спроектирован
заранее для этого момента):

```ts
REDIS_URL: z.url(),                              // было optional() — M0-заглушка, теперь M2 обязателен
MAIL_PROVIDER: z.enum(["ses", "smtp"]),
MAIL_FROM: z.email(),                            // "Helix <noreply@...>" — адрес отправителя
APP_URL: z.url(),                                // база для deep link (§5); либо уже есть — сверить
// SES: без кастомных кред-переменных (§7)
SES_REGION: z.string().optional(),               // только если MAIL_PROVIDER=ses, обычная AWS-регион строка
// SMTP (dev/MailHog): без auth, MailHog не проверяет креды
SMTP_HOST: z.string().optional(),
SMTP_PORT: z.coerce.number().optional(),
```

`docker-compose.dev.yml` — добавить сервис `mailhog` (PRD §12.4 прямо требует SMTP-catcher для
локальной разработки):

```yaml
mailhog:
  image: mailhog/mailhog
  ports:
    - "1025:1025"  # SMTP
    - "8025:8025"  # Web UI — читать письма без реальной отправки
```

---

## 9. Порядок реализации

1. `packages/config`: ужесточить `REDIS_URL`, добавить `MAIL_PROVIDER`/`MAIL_FROM`/SES/SMTP-переменные (§8).
2. `docker-compose.dev.yml`: сервис `mailhog` (§8).
3. `MailerService` интерфейс + `SmtpMailerService` (dev-путь первым — не требует живого AWS-аккаунта
   для локальной разработки/тестов) + `SesMailerService`.
4. `renderLeadCreatedEmail` — шаблон-функция (§5).
5. BullMQ: очередь `email`, `NotificationsService.enqueue`, `EmailWorker` (§6 retry-конфиг).
6. Решить и зафиксировать §4 (получатели без owner/assignees) — до подключения триггера.
7. Подключить триггер в `ProjectsService.create()` — `enqueue()` **после** `$transaction()` (§2).
8. Ops-заметка: локально `docker compose up -d mailhog`, письма смотреть на `localhost:8025`.

---

## 10. Тестирование — что покрыть обязательно

- **P4-порядок:** мутация коммитится, даже если `enqueue()` бросил (не откатывать транзакцию из-за
  сбоя очереди — email вторичен относительно данных лида).
- **Резолв получателей:** owner+assignees → все адреса в `to`; только owner (типовой случай после
  дефолта на create, §4) → один; owner явно обнулён (`reassign {ownerId: null}`) и assignees пусты →
  письмо не отправляется, лог `info`, job не падает и не ретраится (это не ошибка).
- **Рефетч на старте job:** owner сменился между enqueue и обработкой (симулировать в тесте прямым
  вызовом воркера с задержкой) → письмо уходит новому owner, не старому.
- **Retry:** транспортная ошибка мейлера → job уходит на повтор с backoff, не падает молча.
- **Тенант:** `projectId` не из своей `orgId` (defensive re-check, §3) → job логируется как ошибка,
  не шлёт письмо в чужую орг.
- **Шаблон:** deep link в HTML указывает на правильный `projectId`; `text`-версия непустая.
