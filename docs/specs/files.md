# docs/specs/files.md — File attachments on Project (M3, часть 1 из 2)

> **Назначение.** Реализационная спека. Claude Code читает перед кодом. Решения зафиксированы с
> обоснованием — **не разворачивать обратно** без флага. Соблюдать `CLAUDE.md`
> (Controller→Service→Repository, envelope, AllExceptionsFilter, Zod-контракты в `api-schemas`) и
> `docs/decisions.md` (P1 — id/key, не имя файла, как стабильная ссылка; P3 — минимальный payload
> в БД, тяжёлый контент — только в объектном хранилище; P4 — сайд-эффекты после коммита, через
> уже существующий `MAINTENANCE_QUEUE`; тенант-скоуп через `orgId` + composite-FK backbone).
>
> **Явно ВНЕ скоупа этой спеки** (ADR «embedding ingest → M4», `decisions.md`): извлечение текста
> из файлов, эмбеддинги, что-либо про RAG. `Attachment` здесь — чистая цель для будущего FR-FILE-3,
> но сам FR-FILE-3 не реализуется. Не добавлять сюда поля/джобы под экстракцию «про запас».

---

## 0. Скоуп

**FR-FILE-1 (MUST)** — загрузка файлов в Project через presigned URL в объектное хранилище
(S3/MinIO). **FR-FILE-2 (MUST)** — метаданные (filename/size/mime/uploader/scan status), скачивание
через короткоживущий presigned URL. **FR-FILE-5 (MUST)** — доступ проверяется правами, публичных
object URL нет.

**FR-FILE-4 (SHOULD, virus scan) — ОТЛОЖЕНО, не построено в этом заходе.** В отличие от
assignment/phase-change нотификаций (`feedback-should-is-not-optional` — там ничего технически не
мешало, SHOULD было просто не сделано), здесь реальный блокер: ClamAV — это **новая инфраструктура**
(отдельный контейнер/сервис, ещё один BullMQ-консьюмер, свой health-check), а не код поверх уже
существующего. `scanStatus` поле в модели заводим сразу (§1) — контракт на будущее сканирование не
меняется, когда воркер появится — но сам воркер не пишем. `scanStatus` по умолчанию `SKIPPED` (не
`PENDING`, чтобы не создавать видимость незавершённой работы там, где работы никто не планировал
начинать до появления ClamAV-воркера).

**В скоупе:** `Attachment` Prisma-модель · presigned upload/download через `@aws-sdk/client-s3` +
`@aws-sdk/s3-request-presigner` · `POST/GET/DELETE /v1/projects/:projectId/attachments*` ·
tenant-namespaced storage key (`orgId` — часть ключа, не только БД-фильтр) · async S3-object cleanup
при удалении Project (§6) · лимит размера файла · RBAC (Appendix B «Upload files»).

**НЕ в скоупе:**
- Извлечение текста / эмбеддинги (см. врезку выше).
- Virus scan (см. выше).
- Вложения на KB-статьях/Pages — `docs/specs/pages-kb.md` (часть 2) решает, нужны ли им
  attachments отдельно или через ту же таблицу; не предполагать здесь.
- Версионирование файлов (перезалить = новая запись с тем же `projectId`, не replace-in-place).
- Папки/структура — плоский список вложений на проект, как таск-чеклист сегодня.

---

## 1. Данные — новая модель `Attachment`

```prisma
model Attachment {
  id           String     @id @default(cuid())
  orgId        String
  projectId    String
  storageKey   String     @unique // "{orgId}/{projectId}/{id}/{filename}" — см. §2
  filename     String     // исходное имя, как прислал клиент — ТОЛЬКО для отображения (P1: не парсим, не полагаемся)
  mimeType     String
  sizeBytes    Int        // заявленный клиентом на шаге 1 (§3); реальный размер сверяется на confirm, не хранится отдельно
  uploadedById String?
  scanStatus   AttachmentScanStatus @default(SKIPPED) // §0 — сканера нет, не изображаем прогресс
  confirmedAt  DateTime?  // null = загрузка начата, но не подтверждена (§3) — терминальное состояние, тот же паттерн, что usedAt/acceptedAt
  createdAt    DateTime   @default(now())

  org        Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  project    Project      @relation(fields: [projectId, orgId], references: [id, orgId], onDelete: Cascade)
  uploadedBy User?        @relation(fields: [uploadedById], references: [id], onDelete: SetNull)

  @@index([projectId])
}

enum AttachmentScanStatus {
  SKIPPED  // §0: сканер не подключён — дефолт, не "ожидание"
  CLEAN
  INFECTED
}
```

**`confirmedAt` — строка создаётся на шаге 1, не на confirm.** Ревизия после критики: первая
редакция откладывала создание `Attachment` до confirm, что оставляло реально загруженные, но
никогда не подтверждённые файлы (сеть оборвалась, вкладка закрыта) полными сиротами в S3 — ни одна
строка в БД никогда о них не узнавала, чистить (§6) было нечего. `confirmedAt: DateTime?` — тот же
терминальный-статус-паттерн, что `PasswordResetToken.usedAt`/`Invite.acceptedAt`: строка существует
с самого начала операции, confirm — compare-and-set (`UPDATE ... WHERE confirmedAt IS NULL`), а
непотверждённые строки чистит maintenance-джоба (§6.1) — та же форма, что уже трижды применена в
проекте (RefreshSession/Invite), не новый механизм ради этого случая.

**Composite-FK на `Project`** (`fields: [projectId, orgId], references: [id, orgId]`), тот же
backbone, что `ProjectContact`/`ProjectAssignee` — БД гарантирует `Attachment.orgId ==
Project.orgId`, невозможно приложить файл к чужому проекту через рассинхрон orgId.

**`onDelete: Cascade` на `Project`** — при удалении проекта строки `Attachment` удаляются
автоматически (БД-инвариант), но объекты в S3 **не удаляются сами** — object storage не знает про
Postgres FK. См. §6 (async cleanup) — это НЕ забыто, а отдельно спроектированный шаг именно из-за
этого разрыва.

**`uploadedById` nullable + `SetNull`** — тот же паттерн, что `ActivityEvent.actorId`: если
загрузивший юзер уйдёт из системы, файл не должен исчезнуть или потерять целостность —
имя/идентичность загрузившего теряется (P2 здесь сознательно НЕ применяем через снапшот-имя, в
отличие от `AuditLog.payload`: `Attachment` — не журнал события, а долгоживущая сущность с живой
FK-ссылкой, которая просто корректно переживает удаление юзера через null, как и `Project.ownerId`).

**`storageKey` — не генерируется из `filename`.** Коллизии (два файла с одинаковым именем в одном
проекте), непечатные/небезопасные символы в оригинальном имени (path traversal через `../`,
Unicode-нормализация) — весь этот класс проблем снят тем, что ключ строится из стабильных id, а
`filename` живёт только как отображаемое метаданное (P1). См. §2.

**Manual-migration point не нужен** — обычный `@@index`, никаких deferrable/generated-column
инвариантов, которых Prisma не умеет.

---

## 2. Storage key — тенант-изоляция ВНУТРИ object storage, не только в БД

Ключ объекта в S3/MinIO: **`{orgId}/{projectId}/{attachmentId}/{filename}`**.

Почему `orgId` — первый сегмент, не только колонка в `Attachment`: DB-уровневая tenant-изоляция
(RLS-подобная фильтрация по `orgId` на data-access слое, `CLAUDE.md`) защищает запросы **через
API**, но presigned URL, однажды выданный, работает **напрямую против S3**, в обход Nest вообще.
Если бы ключи двух орг могли случайно совпасть (например, при коллизии `attachmentId`, которая
физически исключена cuid'ом, но защита не должна опираться на "cuid не коллизирует") — неймспейс
по `orgId` первым сегментом гарантирует, что даже гипотетическая ошибка в генерации оставшейся
части ключа не может привести к перезаписи/чтению чужого объекта: коллизия должна была бы
произойти **внутри одного и того же орг-префикса**.

`attachmentId` генерируется **до** записи в БД (`cuid()` можно посчитать в приложении, не только
через Prisma `@default`) — ключ должен существовать в момент запроса presigned PUT URL, а строка
`Attachment` создаётся только ПОСЛЕ подтверждения загрузки (§3). Использовать читаемое `filename`
как есть в ключе (URL-encoded) — не транслитерировать/не хешировать: presigned URL уже прячет ключ
от посторонних, а сохранение читаемого имени упрощает ручную отладку в консоли MinIO/S3.

---

## 3. Flow — upload (presigned PUT, confirm-after)

Клиент никогда не отправляет файл через apps/api — только через presigned URL напрямую в S3/MinIO
(FR-FILE-1 дословно). Двухшаговый протокол:

**Шаг 1 — `POST /v1/projects/:projectId/attachments/upload-url`**
```ts
// request
{ filename: string; mimeType: string; sizeBytes: number }
// response
{ attachmentId: string; uploadUrl: string; storageKey: string }
```
Сервис: генерирует `attachmentId` (cuid), считает `storageKey` (§2), проверяет заявленный
`sizeBytes` против лимита (§4) — это ПЕРВАЯ проверка, не единственная (см. ниже), — создаёт
`Attachment`-строку сразу, с `confirmedAt: null` (§1 — пересмотрено после критики), создаёт
presigned PUT (`PutObjectCommand` + `getSignedUrl`, TTL 5 минут — только на сам upload, не путать
с TTL скачивания в §5) и возвращает его.

**Шаг 2 — клиент грузит файл `PUT` напрямую на `uploadUrl`.**

**Важно про размер: presigned PUT НЕ обеспечивает диапазон размера в самой подписи.**
`Content-Length-Range` — это условие presigned **POST policy** (`createPresignedPost` с
form-полями), а не presigned PUT URL (`getSignedUrl` + `PutObjectCommand`), который здесь
используется ради простоты клиентского кода (`fetch(url, {method:"PUT", body: file})`, без
multipart-form). Значит подписанный URL сам по себе не мешает клиенту прислать файл больше
заявленного `sizeBytes` — реальная защита от размера состоит из двух проверок, а не одной:
(1) заявленный `sizeBytes` — до выдачи URL (отсекает očевидно большие файлы дёшево, без похода в
S3); (2) **реальный размер объекта — на confirm** (шаг 3), через `HeadObjectCommand.ContentLength`.
Первая редакция спеки утверждала защиту через несуществующее свойство presigned PUT — исправлено.

**Шаг 3 — `POST /v1/projects/:projectId/attachments/:attachmentId/confirm`**
```ts
// request: {} (пусто — все метаданные уже были в шаге 1, дублировать незачем)
// response: AttachmentResponse
```
Сервис делает `HeadObjectCommand` на `storageKey`:
- Объект не найден → `AttachmentUploadNotConfirmedError` (клиенту: "загрузка не завершена,
  попробуйте снова"). Строка `Attachment` остаётся в состоянии pending — если клиент повторит
  реальную загрузку и снова вызовет confirm, второй заход сработает штатно (тот же `attachmentId`,
  та же строка).
- Объект найден, но `ContentLength` больше `MAX_ATTACHMENT_SIZE_BYTES` (§4) → удаляет объект
  (`DeleteObjectCommand`) немедленно, бросает `AttachmentTooLargeError`, строка `Attachment`
  остаётся pending (будет убрана maintenance-джобой, §6.1, как и любая другая неподтверждённая).
  Это и есть настоящая граница размера — заявленный `sizeBytes` на шаге 1 лишь ранний UX-отказ, не
  единственная защита.
- Иначе — compare-and-set `UPDATE ... SET confirmedAt = now() WHERE id = :id AND confirmedAt IS
  NULL` (тот же паттерн, что `markUsed`/`markAccepted`). Возвращает `count === 0`, если строка уже
  была подтверждена раньше (повторный вызов confirm) — **не ошибка**, идемпотентный успех: сервис
  просто возвращает уже сохранённые данные строки, не бросает исключение и не трогает S3 второй раз.

**Список вложений (`GET .../attachments`, §8) фильтрует `WHERE confirmedAt IS NOT NULL`** —
неподтверждённые (ещё загружаются или уже брошены) строки не показываются пользователю как
призрачные вложения.

**Почему двухшаговый протокол, а не один запрос "вот файл, сохрани":** presigned-upload — это и
есть отказ от прогона файла через сам API-процесс (FR-FILE-1). Разрыв между "URL выдан" и "файл
реально загружен" неизбежен при любом presigned-подходе — confirm-шаг закрывает его явной
проверкой размера/существования, а не оптимистичным приёмом на веру.

---

## 4. Лимиты

**`MAX_ATTACHMENT_SIZE_BYTES = 50 * 1024 * 1024` (50 MB)**, константа в
`apps/api/src/modules/attachments/attachment-limits.ts`, не env-переменная — то же решение, что
`MAX_LOGO_FILE_BYTES` в `organizations.ts` (`project-org-settings.md`): лимит — часть контракта
приложения, не операционная настройка окружения. Единственный источник, используется в трёх
местах: Zod-схема запроса upload-url (`sizeBytes.max(...)`, ранний UX-отказ), и — единственная
место, которое реально ограничивает размер, — проверка `HeadObjectCommand.ContentLength` на
confirm (§3). Presigned PUT URL сам по себе размер не ограничивает (см. §3 — это не то же самое,
что presigned POST policy с `content-length-range`), поэтому вторая проверка обязательна, не
опциональна.

**Без allowlist по `mimeType`.** В отличие от логотипа орги (там узкий список
`image/{png,jpeg,webp,svg+xml}` осмыслен — это именно логотип), вложения на проекте — произвольные
бизнес-документы (PDF, Office, изображения, архивы), и заранее сузить список означало бы гадать,
что понадобится пользователю. Единственная защита на этом слое — `FR-FILE-4` (virus scan), которая
отложена (§0); принимаем это как явный, не спрятанный trade-off M3, а не забытую дыру.

---

## 5. Flow — download (presigned GET, permission-checked)

`GET /v1/projects/:projectId/attachments/:attachmentId/download-url` → `@CheckPolicy("read",
"Attachment")` + tenant-фильтр (`Attachment.orgId == auth.activeOrgId` на уровне репозитория, тот
же паттерн, что везде). Отвечает **не файлом**, а presigned GET URL с коротким TTL (**5 минут** —
FR-FILE-2 "short-lived"): `{ downloadUrl: string }`. Фронт делает `window.location = downloadUrl`
или открывает в новой вкладке — сам apps/api никогда не проксирует байты файла (это была бы
ненужная нагрузка на API-процесс, которую presigned-URL модель специально устраняет).

**Публичных object URL нет (FR-FILE-5) — бакет приватный.** `S3_BUCKET` создаётся/настраивается с
приватным ACL по умолчанию (MinIO — не-anonymous bucket policy; AWS S3 — Block Public Access
включён). Единственный путь прочитать объект — presigned URL, выданный ПОСЛЕ прохождения CASL
guard. Это делает permission-check единой точкой входа: нет "быстрого" пути через прямой S3 URL,
который бы обошёл права.

---

## 6. Удаление — Project cascade и async S3-cleanup

**Удаление одного `Attachment`** (`DELETE /v1/projects/:projectId/attachments/:attachmentId`,
`@CheckPolicy("delete", "Attachment")`) — синхронно: `DeleteObjectCommand` на `storageKey`, затем
удаление строки. Один объект, одна операция, транзакция не нужна (если удаление из S3 упадёт —
бросаем 500, строка не удаляется, обе стороны остаются consistent; ретрай — обычный повтор запроса
пользователем через UI).

**Удаление `Project`** — сложнее, потому что `Attachment` рядов может быть много, и они удаляются
**каскадом на уровне БД** (`onDelete: Cascade`, §1) как часть уже существующей транзакции удаления
проекта (`ProjectsService.delete`, вне этой спеки). К моменту, когда приложение узнало бы "проект
удалён", строки `Attachment` уже физически не существуют — их `storageKey` нужно **прочитать до
удаления**, не после.

**Решено:** `ProjectsService.delete` (расширяется этой спекой, не переписывается) читает список
`storageKey` дочерних `Attachment` **внутри той же транзакции**, ДО вызова `prisma.project.delete()`
(который триггерит каскад), затем после **коммита** транзакции enqueue'ит
`attachment-cleanup`-джобу с массивом ключей в `MAINTENANCE_QUEUE` — четвёртым потребителем после
`refresh-session.cleanup`/`invite.cleanup` (P4: сайд-эффект после коммита, тот же принцип, что
письма). Джоба батчем вызывает `DeleteObjectsCommand` (S3 API поддерживает до 1000 ключей за один
вызов — не нужен собственный батчинг поверх этого).

**Почему не синхронно внутри транзакции удаления проекта:** сетевой I/O к S3 внутри БД-транзакции
держит locks/connection дольше, чем нужно, и связывает успех удаления проекта (чисто БД-операция)
с доступностью внешнего сервиса — тот же довод, что уже применён к письмам/веб-хукам (`CLAUDE.md`:
"email/webhook/embedding — после коммита (очередь), outbox против dual-write").

**Почему не оставить объекты орфанами навсегда:** удаление проекта — не гипотетический edge case
(`DELETE /v1/projects/:id` уже существует, O/A), а размер файлов (до 50MB, §4) делает накопление
орфанов реальной статьёй расходов на storage, не только "мусором в БД". Цена батч-джобы предельно
мала (та же инфраструктура, что уже доказана дважды).

### 6.1. Неподтверждённые загрузки — пятый потребитель `MAINTENANCE_QUEUE`

Отдельная от §6 проблема (добавлена после критики): строка `Attachment` с `confirmedAt: null`
может остаться в этом состоянии навсегда — клиент получил upload-url, но так и не вызвал confirm
(закрыл вкладку, оборвалась сеть, либо реальная загрузка вообще не состоялась). Такая строка не
показывается в списке (§3), но занимает место в БД, а если объект в S3 всё же появился (клиент
догрузил файл, но не успел вызвать confirm) — занимает место и там.

`AttachmentUploadCleanupRepository.deleteStale(cutoff)` — `deleteMany` по `confirmedAt IS NULL AND
createdAt < cutoff` (аналог `RefreshSessionCleanupRepository`/`InviteCleanupRepository`, батчить
через `findMany+deleteMany` по образцу `refresh-session-cleanup.repository.ts`, если объём
предполагается большим — на старте M3 объём заведомо мал, батчинг можно добавить, когда понадобится
измеримо, не заранее). Cutoff — **24 часа**: presigned PUT живёт 5 минут (§3), сутки — большой
запас на "клиент начал заливать, но не закончил", без риска убить легитимную ещё не завершённую
загрузку.

Перед удалением строки — best-effort `DeleteObjectCommand` на `storageKey` (объект мог реально
существовать, если клиент догрузил файл, но не вызвал confirm) — ошибка "объект не найден" от S3
здесь ожидаема и не должна прерывать удаление строки.

`invite-cleanup-job.ts`-паттерн: `ATTACHMENT_UPLOAD_CLEANUP_JOB`, отдельное время в cron
(`"0 5 * * *"` — третий час подряд после `refresh-session.cleanup`/`invite.cleanup`, не толкаться).

---

## 7. RBAC — новый CASL-субъект `Attachment`

Appendix B, строка «Upload files» — ✔ Owner/Admin/Manager, △ Member. По уже принятому в M1
принципу (`decisions.md` «RBAC — две оси»): △ = capability allowed, scope = ORG (не ASSIGNED) до
M6 — та же трактовка, что уже применена к Task/ProjectContact/ProjectAssignee для Member.

```ts
// app-ability.ts
export const APP_SUBJECTS = [/* ...существующие, */ "Attachment"] as const;

// MANAGER (в ветке case "MANAGER"):
can("manage", "Attachment"); // upload/read/delete — управленческое действие, как ProjectAssignee/Task

// MEMBER (в ветке case "MEMBER"):
can("create", "Attachment");
can("read", "Attachment");
can("delete", "Attachment"); // △: Member может управлять вложениями СВОИХ (scope=ORG сегодня, см. выше)

// VIEWER:
can("read", "Attachment");
```

`capabilities.ts`: `Attachment: ["create", "read", "delete"]` (нет `update` — вложение не
редактируется, перезалить = удалить+создать заново, §0). Зеркало в
`packages/api-schemas/src/capabilities.ts`.

---

## 8. Эндпоинты

| Метод | Путь | Guard | Назначение |
| --- | --- | --- | --- |
| `POST` | `/v1/projects/:projectId/attachments/upload-url` | `@CheckPolicy("create", "Attachment")` | Выдать presigned PUT URL (§3, шаг 1) |
| `POST` | `/v1/projects/:projectId/attachments/:attachmentId/confirm` | `@CheckPolicy("create", "Attachment")` | Подтвердить загрузку, создать строку (§3, шаг 3) |
| `GET` | `/v1/projects/:projectId/attachments` | `@CheckPolicy("read", "Attachment")` | Список вложений проекта |
| `GET` | `/v1/projects/:projectId/attachments/:attachmentId/download-url` | `@CheckPolicy("read", "Attachment")` | Выдать presigned GET URL (§5) |
| `DELETE` | `/v1/projects/:projectId/attachments/:attachmentId` | `@CheckPolicy("delete", "Attachment")` | Удалить (§6) |

Новый модуль `apps/api/src/modules/attachments/` — не внутри `workspaces/` (где живёт
`projects.service.ts`), тот же принцип обособления, что `invites/`/`maintenance/`: своя
S3-интеграция, свой репозиторий, минимальная зависимость от остального (импортирует
`WorkspacesModule` только за проверкой существования `projectId`, если такая проверка нужна сверх
CASL — уточняется в реализации по образцу существующих project-scoped модулей).

---

## 9. `S3Service` — общий клиент, без провайдерского switch

В отличие от `MailerModule` (SES vs SMTP — два разных API), S3 и MinIO — **один и тот же**
`@aws-sdk/client-s3` API; разница только в конструкторе клиента. Не заводим два класса
(`S3MailerService`-подобный паттерн здесь избыточен — нет второго интерфейса, который бы отличался
по контракту):

```ts
// core/storage/s3.service.ts (не в attachments/ — тот же уровень переиспользования, что PrismaService)
@Injectable()
export class S3Service {
  private readonly client: S3Client;
  readonly bucket: string;

  constructor(@Inject(ENV) env: Env) {
    // S3_ENDPOINT задан → MinIO/S3-совместимое (dev, docker-compose.dev.yml) — путь-стиль и
    // явные креды. Не задан → настоящий AWS S3 (prod) — default credential provider chain (IAM
    // role), тот же принцип, что SesMailerService уже применяет к SES.
    this.client = new S3Client({
      region: env.S3_REGION,
      ...(env.S3_ENDPOINT
        ? {
            endpoint: env.S3_ENDPOINT,
            forcePathStyle: true,
            credentials: { accessKeyId: env.S3_ACCESS_KEY!, secretAccessKey: env.S3_SECRET_KEY! },
          }
        : {}),
    });
    this.bucket = env.S3_BUCKET;
  }

  // Без maxSizeBytes-параметра — presigned PUT не умеет диапазон размера в подписи (§3 врезка),
  // единственная реальная проверка размера — на confirm через headObject ниже.
  getPresignedPutUrl(key: string, contentType: string): Promise<string> { /* ... */ }
  getPresignedGetUrl(key: string): Promise<string> { /* ... */ }
  headObject(key: string): Promise<{ sizeBytes: number } | null> { /* ... */ } // null = не найден
  deleteObject(key: string): Promise<void> { /* ... */ }
  deleteObjects(keys: string[]): Promise<void> { /* ... */ } // §6, батч до 1000
}
```

Живёт в `core/`, не в `modules/attachments/` — org settings (логотип, §11 ниже) тоже станет
потребителем этого же клиента, а `core/` уже используется как дом для инфраструктуры с несколькими
потребителями (`PrismaService`, `AuditRecorder`-модуль по аналогии).

---

## 10. Контракты (`packages/api-schemas/src/attachments.ts`)

```ts
export const createUploadUrlSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(127),
  sizeBytes: z.number().int().positive().max(MAX_ATTACHMENT_SIZE_BYTES), // §4, реэкспорт константы
});
export type CreateUploadUrlInput = z.infer<typeof createUploadUrlSchema>;

export const uploadUrlResponseSchema = z.object({
  attachmentId: z.string(),
  uploadUrl: z.string(),
  storageKey: z.string(),
});

export const attachmentResponseSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  scanStatus: z.enum(["SKIPPED", "CLEAN", "INFECTED"]),
  uploadedByName: z.string().nullable(), // денормализовано для списка, как orgMemberResponseSchema
  createdAt: z.iso.datetime(),
});
export const attachmentListResponseSchema = z.array(attachmentResponseSchema);

export const downloadUrlResponseSchema = z.object({ downloadUrl: z.string() });
```

`storageKey` **не входит** в `attachmentResponseSchema` — внутренняя деталь реализации, фронту
незачем её знать (P1: фронт работает через `attachmentId`, не строит URL сам).

---

## 11. Ошибки

```ts
/** confirm вызван, но HeadObjectCommand не находит файл в S3 — загрузка не завершилась. */
export class AttachmentUploadNotConfirmedError extends BadRequestError {
  readonly code = "ATTACHMENT_UPLOAD_NOT_CONFIRMED";
}

/** confirm: реальный размер объекта (HeadObjectCommand) больше MAX_ATTACHMENT_SIZE_BYTES —
 *  единственная настоящая граница размера (§3/§4), заявленный sizeBytes лишь ранний UX-отказ. */
export class AttachmentTooLargeError extends BadRequestError {
  readonly code = "ATTACHMENT_TOO_LARGE";
}
```
Остальное — существующие классы (`ResourceNotFoundError` на несуществующий `attachmentId`/чужой
`projectId`, 403 от `PoliciesGuard` на RBAC).

---

## 12. Конфиг — `S3_BUCKET` становится обязательным

`packages/config/src/env.schema.ts` уже несёт комментарий "Ужесточаем per-веха: S3 → M3 (files)" —
выполняем это здесь:

```ts
// ── Files / S3 · MinIO (M3) ──────────────────────────────────────────────────
S3_ENDPOINT: z.url().optional(),   // задан → MinIO/S3-совместимый (dev); не задан → настоящий AWS S3 (prod)
S3_REGION: z.string().optional(),  // как SES_REGION — не обязателен, SDK резолвит по умолчанию
S3_ACCESS_KEY: z.string().optional(), // нужен только при заданном S3_ENDPOINT (MinIO)
S3_SECRET_KEY: z.string().optional(), // нужен только при заданном S3_ENDPOINT (MinIO)
S3_BUCKET: z.string(),             // ОБЯЗАТЕЛЕН: без него Attachment-модуль не может работать вообще
```

Только `S3_BUCKET` переходит в required — тот же уровень, что `JWT_SECRET` ("без секрета
приложение не должно подниматься"): без имени бакета S3Service не может быть сконструирован
осмысленно ни при каком провайдере. Остальные четыре остаются `.optional()` — они условны на
провайдере (MinIO нуждается в explicit-кредах и endpoint, реальный AWS S3 — нет), в отличие от
`MAIL_PROVIDER`, здесь не заводим отдельный enum-переключатель (§9 уже объясняет почему), поэтому
"условно обязательные" поля остаются проверкой внутри `S3Service`, не в самой Zod-схеме
(`env-схема` не может выразить "обязательно, если задан ДРУГОЙ optional-параметр" без
`superRefine`, а добавлять его ради двух полей, которые и так падают понятной ошибкой при
неправильной конфигурации MinIO в деве, — не оправдано).

---

## 13. Порядок реализации

1. Установить `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` в `apps/api`.
2. `packages/config/src/env.schema.ts`: `S3_BUCKET` → required (§12).
3. `packages/db`: модель `Attachment` + enum `AttachmentScanStatus` (§1), back-relations на
   `Organization`/`Project`/`User`, `prisma migrate`.
4. `apps/api/src/core/storage/s3.service.ts` (§9).
5. `core/errors/domain-error.ts`: `AttachmentUploadNotConfirmedError`, `AttachmentTooLargeError`
   (§11).
6. `core/authz/app-ability.ts` + `capabilities.ts` + `packages/api-schemas/src/capabilities.ts`:
   субъект `Attachment` (§7).
7. `packages/api-schemas/src/attachments.ts`: контракты + `MAX_ATTACHMENT_SIZE_BYTES` (§4, §10).
8. `apps/api/src/modules/attachments/`: `attachment-limits.ts`, `attachments.repository.ts`
   (`create` с `confirmedAt: null`/`confirm` compare-and-set/`findById`/`listByProject` фильтрует
   `confirmedAt IS NOT NULL`/`delete`/`listStorageKeysByProject` — последний нужен §6),
   `attachments.service.ts` (§3, §5, §6-half — сам вызов cleanup-enqueue), `attachments.controller.ts`
   (§8).
9. Расширить `ProjectsService.delete` (§6): читать storage keys до удаления, enqueue после коммита.
10. `apps/api/src/modules/maintenance/`: `attachment-cleanup-job.ts` (§6, удаление проекта),
    `attachment-upload-cleanup-job.ts` (§6.1, неподтверждённые загрузки) — два РАЗНЫХ триггера
    очистки, не один; дополнить `maintenance.worker.ts` — четвёртый и пятый потребители
    `MAINTENANCE_QUEUE`.
11. `AppModule`: зарегистрировать `AttachmentsModule`.
12. **Отдельным PR/шагом, не блокирует остальное:** заменить data-URI заглушку логотипа орги
    (`project-org-settings.md`) на реальный upload через тот же `S3Service` — теперь, когда он
    существует. Не делать это ПЕРЕД шагами 1-11: `S3Service` должен появиться из реальной,
    более крупной потребности (Attachment), не быть спроектирован ради одного маленького поля.

---

## 14. Тестирование — что покрыть обязательно

**Тестовая S3-инфраструктура — решено, не оставлено на потом.** `docker-compose.dev.yml` уже
поднимает `minio` (M0-инфра, ждала своего потребителя). Тесты используют тот же MinIO-контейнер,
что и dev, с отдельным тестовым бакетом (`S3_BUCKET=helix-test` в тестовом `.env`, тот же принцип,
что тестовая БД на порту 5434 — отдельный неймспейс, не отдельный контейнер). `S3Service` в тестах
— настоящий клиент против настоящего (локального) MinIO, не мок: presigned URL/`HeadObjectCommand`
— это и есть то поведение, которое стоит проверять по-настоящему, мокать AWS SDK здесь означало бы
не тестировать саму интеграцию.

- **Upload happy path:** upload-url → реальный `PUT` в MinIO-тестовый бакет → confirm →
  `Attachment.confirmedAt` установлен, попадает в список.
- **Confirm без реальной загрузки:** `HeadObjectCommand` не находит объект →
  `AttachmentUploadNotConfirmedError`, `confirmedAt` остаётся `null`.
- **Confirm повторно (идемпотентность):** второй вызов confirm на уже подтверждённый
  `attachmentId` → успешный ответ с уже сохранёнными данными, не ошибка, S3 не трогается повторно.
- **Реальный размер больше лимита:** залить в MinIO объект больше `MAX_ATTACHMENT_SIZE_BYTES`,
  вызвать confirm с "враньём" в `sizeBytes` на шаге 1 (маленькое заявленное значение) →
  `AttachmentTooLargeError`, объект удалён из S3, строка осталась pending.
- **Неподтверждённая загрузка чистится (§6.1):** строка с `confirmedAt: null` старше cutoff →
  `AttachmentUploadCleanupRepository.deleteStale` удаляет её (и объект, если он есть); моложе
  cutoff → не трогает (тот же тест-паттерн, что `refresh-session-cleanup.repository.spec.ts`).
- **RBAC:** Viewer → 403 на create/delete, 200 на read; Member → 200 на все три (△, scope=ORG);
  чужая орга → 404/403 на все эндпоинты (tenant-фильтр).
- **Download:** presigned GET URL выдаётся только через `@CheckPolicy("read", ...)`; TTL короткий
  (не проверяем ЧТО такое "короткий" интеграционным тестом — проверяем, что параметр `expiresIn`
  передан в `getSignedUrl` с ожидаемым значением, юнит-тест на `S3Service`).
- **Delete (одиночный):** удаляет и объект (мок `deleteObject` вызван с правильным `storageKey`),
  и строку; `S3`-ошибка → строка НЕ удаляется (см. §6 "транзакция не нужна" — но атомарность
  порядка операций всё равно проверяется).
- **Project delete → cleanup enqueue:** удаление проекта с N вложениями → джоба
  `attachment-cleanup` поставлена с ровно теми N ключами, ПОСЛЕ коммита транзакции (тот же
  тест-паттерн, что `notifications.service.spec.ts` — enqueue не внутри транзакции).
- **Storage-key namespacing (§2):** ключ содержит `orgId` первым сегментом; два вложения с
  одинаковым `filename` в одном проекте получают разные ключи (коллизия по `attachmentId`
  невозможна).
