# docs/specs/auth.md — Аутентификация (M0)

> **Назначение.** Реализационная стратегия auth-модуля. Claude Code читает это перед тем, как писать код.
> Решения зафиксированы с обоснованием — **не разворачивать обратно** без флага. Обоснования «почему» —
> кратко здесь, полнее — в `docs/decisions.md` (раздел Auth) и `docs/defense-notes.md` (раздел 6).
> Соблюдать конвенции `CLAUDE.md`: Controller→Service→Repository, Zod-схемы в `api-schemas` (per-route
> `ZodValidationPipe`, НЕ class-validator/DTO), response-envelope, ошибки через `AllExceptionsFilter`.

---

## 0. Скоуп M0

**В скоупе:** регистрация · логин · выдача токенов · защищённые эндпоинты (guard → ALS-контекст) ·
refresh с ротацией и reuse-detection · logout · logout-all · switch-org.

Auth M0 отвечает на **«кто ты»** (identity), а НЕ на **«что тебе можно»** (authorization). Guard кладёт
`userId`+`activeOrgId`+`role` в контекст; проверка прав (CASL) — отдельная веха.

**Отложено (НЕ реализовывать в M0), помечено осознанно:**

- **SSO/OIDC** — `User.ssoSub`/`passwordHash?` уже задел под это, но реализации нет.
- **Сброс пароля по email** — M2 (нужны очередь + почта).
- **RBAC-энфорсмент (CASL)** — guard кладёт identity+role, но политики прав — своя веха.
- **Окно толерантности к сетевому ретраю на refresh** — в M0 строгая политика «старый токен = reuse»
  (см. §5). Окно добавляем позже, если появятся ложные разлогины.
- **CSRF-токен** — в M0 достаточно `SameSite=Lax` (см. §8). Токен — при появлении сложных форм.
- **UI управления сессиями** — метаданные в таблице копим (§3), сам экран «Настройки → Сессии» позже.

---

## 1. Модель токенов (два токена, две роли)

|                     | Access                      | Refresh                             |
| ------------------- | --------------------------- | ----------------------------------- |
| Тип                 | **JWT, stateless**          | **непрозрачный, stateful**          |
| Живёт               | ~15 мин                     | ~7–30 дней                          |
| Проверка            | подпись, без БД             | лукап в БД по хешу                  |
| Отзыв               | нельзя (короткий)           | можно (revoke в БД)                 |
| Путь                | горячий (каждый запрос)     | холодный (раз в 15 мин)             |
| Хранение на клиенте | память JS (не localStorage) | httpOnly+SameSite=Lax+Secure cookie |

**Почему два, а не один долгий JWT:** access stateless ради скорости горячего пути (1000 запросов = 1000
проверок подписи, БЕЗ 1000 SELECT — JWT это оптимизация самого частого пути). Раз stateless — досрочно не
отзывается, поэтому короткий (украли → протухнет за 15 мин). Refresh должен отзываться (logout, кража) →
stateful в БД. Refresh холодный → поход в БД на нём допустим.

### JWT payload — минимальный

```
{ sub: userId, activeOrgId, iat, exp, jti }
```

- **НЕ кладём `role`** — устаревает (см. §6) + читается из Membership свежей.
- **НЕ кладём `email`/`name`/`avatar`** — (а) P3 (минимум в токене); (б) всё в токене устаревает на 15 мин;
  профиль берётся отдельным `GET /v1/auth/me`.
- **`jti`** (uuid на каждый access) — сейчас почти не нужен, но копейки; задел под audit/tracing/blacklist.

---

## 2. Пароли — argon2id

- Хеш: **argon2id**, параметры из рекомендаций OWASP. `passwordHash` **самодостаточен** — соль и параметры
  (`m`,`t`,`p`) внутри строки `$argon2id$v=19$m=...$...`. Параметры отдельно НЕ хранить.
- `passwordHash` nullable (SSO-only юзеры без пароля).
- **Progressive rehash:** на логине после успешного `verify()` вызвать `needsRehash(hash)`; если параметры
  устарели (OWSAP поднял пороги) — пересчитать хеш прозрачно, юзера не трогать. На руках открытый пароль
  есть только в этот момент.

**Почему argon2 (медленный), а не sha256:** пароль **низкоэнтропийный** (человек придумал, брутфорсится) →
нужен memory-hard медленный хеш, чтобы перебор был дорогим.

---

## 3. RefreshSession (новая таблица в schema.prisma)

```prisma
model RefreshSession {
  id              String    @id @default(cuid())
  userId          String
  tokenHash       String    // SHA-256 сырого refresh-токена (НЕ argon2 — см. ниже)
  familyId        String    // uuid цепочки ротаций (константа на всю цепочку)
  lastActiveOrgId String?   // для какой орги переиздавать access на refresh

  // session metadata (продуктовая фича «Настройки → Сессии»; ipAddress — PII, под retention)
  ipAddress  String?
  userAgent  String?
  deviceName String?

  createdAt DateTime  @default(now())
  lastUsedAt DateTime?
  expiresAt DateTime
  usedAt    DateTime? // проставляется при ротации (токен «потрачен» новым в цепочке)
  revokedAt DateTime? // проставляется при logout / kill-family (reuse detection)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([familyId])
  @@index([tokenHash])
}
```

Состояние строки: **active** = `usedAt IS NULL AND revokedAt IS NULL AND expiresAt > now()`.

**tokenHash — SHA-256, НЕ argon2.** Refresh-токен **высокоэнтропийный** (генерим `crypto.randomBytes(32)`)
→ брутфорс нерелевантен (пространство астрономическое), медленный хеш дал бы только латентность на каждом
refresh. Быстрый SHA-256 корректен именно из-за высокой энтропии. (Опц. defense-in-depth: HMAC-SHA-256 с
серверным pepper.) **Клиенту отдаём сырой токен; в БД только хеш** — утечка таблицы не даёт рабочих refresh,
как и `passwordHash`.

**familyId = uuid()** при первом логине; вся цепочка ротаций носит его. Не «id первой записи» (зависимость
от конкретной строки) — стабильный якорь цепочки.

**`expiresAt` — АБСОЛЮТНЫЙ TTL** (N дней от `createdAt`), не скользящий. Сессия живёт ровно N дней несмотря
на активность → перелогин раз в N. Проще рассуждается и безопаснее (нет токенов-долгожителей). Скользящий
TTL (N от последнего использования) — возможное продуктовое улучшение позже, не в v1.

**`revokedReason`** (enum: `LOGOUT | REUSE | PASSWORD_CHANGED | ADMIN`) — `revokedAt` схлопывает 4 разных
события в одну метку; причина нужна для инцидент-анализа. `REUSE` — не диагностика, а security-телеметрия
(сигнал атаки).

---

## 4. Хранение на клиенте

- **Refresh → httpOnly + SameSite=Lax + Secure cookie.** httpOnly → JS не прочитает (XSS не украдёт refresh,
  главную ценность). PRD §11.2 требует httpOnly.
- **Access → память JS** (переменная / React state), **НЕ localStorage.** Живёт коротко; при XSS утечёт
  максимум 15-минутный токен, на диск не персистится.
- **Антипаттерн:** токены в localStorage (читает любой XSS). (samly кладёт JWT в localStorage — их
  компромисс; у нас строже.)

---

## 5. Ротация + reuse detection

**Инвариант: один refresh используется РОВНО ОДИН РАЗ.** Reuse detection — не отдельная фича, а контроль
этого инварианта.

> **Схема ротации — ЯВНО: новая строка на каждый refresh, НЕ обновление in-place.**
> Вариант «обновить `tokenHash` в той же строке» **ЗАПРЕЩЁН** — он затирает старый хеш, и повторный приход
> старого токена нельзя отличить от невалидного → reuse detection мертва. Правильно: старой строке
> `usedAt = now()`, создать НОВУЮ строку с тем же `familyId`. Только так работает инвариант.

**Флоу `POST /v1/auth/refresh`:**

1. Прочитать сырой refresh из cookie → `tokenHash = sha256(raw)`.
2. Лукап `RefreshSession` по `tokenHash`.
   - **не найдено** → 401 (невалидный).
   - **найдено, `expiresAt` прошёл** → 401.
   - **найдено, `revokedAt != null`** → 401 (семья убита / logout).
   - **найдено, `usedAt != null`** (токен уже ротирован) → **REUSE DETECTED** → в транзакции проставить
     `revokedAt` **всем** строкам с этим `familyId` (kill family) → 401, форс-релогин.
   - **найдено, active** → **ротация** (в одной транзакции): `usedAt = now()` текущей строки; создать новую
     строку с тем же `familyId`, новым `tokenHash`, `lastActiveOrgId` перенести; вернуть новый refresh
     (cookie) + новый access для `lastActiveOrgId`. Обновить `lastUsedAt`.

**Почему при reuse убиваем ВСЮ семью, а не просто отказываем:** невозможно отличить «вор прислал старый»
от «настоящий юзер пришёл со старым, после того как вор уже ротировал». Раз различить нельзя — единственное
безопасное действие — убить цепочку и заставить всех перелогиниться. Простой отказ не спасает: если ротировал
вор, у него свежий валидный токен.

> **Отложено (advanced):** окно толерантности к сетевому дубль-запросу. Проблема: плохой интернет → клиент
> отправил refresh, таймаут (сервер уже ротировал), клиент повторил → выглядит как reuse → ложный разлогин.
> Решение НЕ «принимаем старый N секунд» (это ослабило бы инвариант для вора тоже), а: если старый токен
> пришёл в узком окне (~5–10с) от ротации, **с той же сессии** (familyId+device), и **следующий токен ещё
> не использован** — вернуть идемпотентно результат первой ротации. Позже окна / после движения цепочки =
> reuse. Это дубль **запроса** (сеть) vs reuse **токена** (атака) — два слоя. В M0: строгая политика.

---

## 6. Мультитенантность — activeOrgId в токене, role НЕ в токене

Пользователь может быть в нескольких оргах (`Membership` m-n). Access несёт **`activeOrgId`** (guard кладёт
его в ALS-контекст → tenant-скоуп всех запросов; composite-FK backbone физически запирает данные к этой орге).

**Роль в токене НЕ кладём.** Читается из `Membership(activeOrgId, userId)` (у нас `@@unique([orgId,userId])`)
**один раз за запрос** в guard.

- Причина 1 — свежесть: роль меняется независимо от токена; запекать в 15-мин токен → stale authorization
  (понизили Owner→Member, а он ещё 15 мин Owner). Читать свежей.
- Причина 2 — цена: одна индексная выборка на запрос (не на строку) бесплатна; оптимизировать против неё
  = оптимизация против нуля.
- Бонус: тот же per-request read ловит **исключение из орги мгновенно** — нет membership → guard отказывает
  сразу, а не через 15 мин.

**Switch-org:** access несёт `activeOrgId` → смена орги = переиздать access. `POST /v1/auth/switch-org
{orgId}` → проверить, что у юзера есть Membership в целевой орге → выдать новый access с новым `activeOrgId`
→ обновить `lastActiveOrgId` на текущей `RefreshSession`. На refresh access переиздаётся для `lastActiveOrgId`.

---

## 7. Logout

- **`POST /v1/auth/logout`** — revoke текущей `RefreshSession` (`revokedAt = now()`). Access **не** трогаем:
  он stateless, «удалить JWT на сервере» нельзя — доживёт ≤15 мин и протухнет. Это нормально и есть причина,
  по которой access короткий.
- **`POST /v1/auth/logout-all`** — revoke все `RefreshSession` пользователя (все семьи).

---

## 8. CSRF

Refresh в cookie → браузер шлёт её автоматически → открыт CSRF (cross-site POST на `/refresh`).
**httpOnly и SameSite решают РАЗНЫЕ угрозы:** httpOnly против XSS (JS не прочитает), SameSite против CSRF
(не отправится cross-site). Не путать.

- **M0: `SameSite=Lax` на refresh-cookie** — режет cross-site POST (суть CSRF-атаки). Достаточно для чистого
  SPA. (`Strict` строже, но ломает легитимный переход по внешней ссылке — Lax баланс.)
- **Позже: CSRF-токен (`X-CSRF-Token`) + проверка `Origin`/`Referer`** — второй слой при сложных формах /
  сторонних интеграциях.

---

## 9. Эндпоинты (`/v1/auth/*`)

| Метод | Путь                  | Назначение                                                                 |
| ----- | --------------------- | -------------------------------------------------------------------------- |
| POST  | `/v1/auth/register`   | RegistrationService: User + личная Org + Membership(OWNER) в tx → токены   |
| POST  | `/v1/auth/login`      | verify (+rehash) → выдать access + refresh(cookie); activeOrgId = см. §9.1 |
| POST  | `/v1/auth/refresh`    | ротация refresh → новый access + новый refresh(cookie)                     |
| POST  | `/v1/auth/logout`     | revoke текущей RefreshSession                                              |
| POST  | `/v1/auth/logout-all` | revoke всех сессий юзера                                                   |
| POST  | `/v1/auth/switch-org` | сменить activeOrgId (проверка membership) → новый access                   |
| GET   | `/v1/auth/me`         | профиль (name/email из БД, НЕ из токена)                                   |

Zod-схемы для каждого — сначала в `api-schemas` (`RegisterSchema`, `LoginSchema`, `SwitchOrgSchema`, …),
потом импорт в контроллер (schema-first). Auth-ошибки (невалидный логин/токен) → `AllExceptionsFilter` → 401
в едином error-конверте.

### 9.1 Регистрация — application-сценарий, НЕ auth-операция

Свежий User ни в одной орге не состоит → на логине `activeOrgId` брать неоткуда. Решение: **регистрация
создаёт личную оргу** (вариант A), чтобы сирот-без-орги не существовало by construction. Это убирает
`nullable activeOrgId` из токена/guard (иначе спецслучай-`null` протёк бы во всю систему — отвергнутый
вариант B).

**Расстановка слоёв (важно — auth НЕ создаёт бизнес-сущности):**

```
RegistrationService (application/use-case слой — оркестратор сценария):
  tx {
    User.create()                       ← домен
    Organization.create() (личная)      ← домен (тенантная граница, не CRM-логика)
    Membership.create(OWNER)            ← домен
  } commit
  → AuthService.issueTokens(user, activeOrgId = личная орга)   ← auth
```

- **`AuthService`** занимается ТОЛЬКО аутентификацией (пароль, токены, ротация). Получает **готового** User,
  бизнес-сущности не создаёт.
- **`RegistrationService`** (application service) владеет **сценарием** и **транзакционной границей**;
  вызывает домен + auth, но сам логику не реализует — координирует.
- Граница P4: User/Org/Membership + `RefreshSession` — в транзакции (факты-состояния); будущие эффекты
  (welcome-email, дефолтный blueprint) — после коммита, в очередь. `RegistrationService` — правильное место
  провести эту границу, когда эффекты появятся.

**Инвариант, который это даёт:** каждый User имеет ≥1 Membership всегда (от регистрации). Нет переходного
состояния «юзер есть, орги нет» → guard одномоделен.

**`activeOrgId` на логине** (юзер может быть в неск. оргах — личная + приглашённые позже):
`= RefreshSession.lastActiveOrgId` если есть (вернулся в последнюю активную), иначе личная орга.

**Отложено (UX-слой):** онбординг «создай воркспейс / прими приглашение» (вариант C) — появится с воркспейсами
(M1) и инвайтами (позже). На M0: логин в личную оргу, воркспейсы создаются внутри неё.

---

## 10. Guard (JwtAuthGuard)

1. Достать access из `Authorization: Bearer` → проверить подпись → извлечь `{userId, activeOrgId, jti}`.
2. Прочитать `Membership(activeOrgId, userId)` → `role`. Нет membership → 403/401 (исключён из орги).
3. Положить `{userId, activeOrgId, role}` в **ALS-контекст** (тот самый `TenantContextInterceptor`, что уже
   в каркасе — теперь наполняется реальными данными вместо заглушки).

Данные, которые эндпоинт потом трогает, скоупятся по `activeOrgId` из контекста; composite-FK гарантирует,
что чужая орга не подмешается.

---

## 11. Порядок реализации (инкрементально, всегда рабочая система)

1. `RefreshSession` в `schema.prisma` + миграция. (User/Membership уже есть.)
2. **Регистрация через `RegistrationService`** (§9.1): в tx создать User (argon2 hash) + личную Organization
   - Membership(OWNER). AuthService получает готового User. (Org/Membership уже в схеме — M0-ядро.)
3. Логин (verify + progressive rehash).
4. Выдача access JWT. **+ скелет JwtAuthGuard** — чтобы защитить тестовый эндпоинт и доказать, что токен
   валиден (полный ALS+membership guard — шаг 11, но минимальный нужен здесь для тестируемости шагов 5–10).
5. RefreshSession в БД (создание на логине, sha256 hash, familyId, cookie).
6. Refresh endpoint (лукап, выдача нового access).
7. Ротация + reuse detection (инвариант «ровно один раз», kill family).
8. Logout (revoke сессии).
9. Logout-all (revoke всех сессий).
10. Switch-org (переиздание access с новым activeOrgId).
11. Полный ALS Guard (userId + activeOrgId + role из Membership в контекст).

Каждый шаг строится на предыдущем и тестируется отдельно.

---

## 12. Тестирование

Auth — фича, где ошибка = дыра в безопасности, поэтому **негативные и конкурентные пути важнее happy-path**.
В обычной фиче тестируем «работает ли»; в auth — «НЕ работает ли атака». Каждый шаг реализации (§11)
сопровождается тестом сразу, не «тесты потом». Стек: Vitest + Supertest + **тестовая БД в Docker** (AAA).

**Уровни (testing pyramid) ловят разные классы багов:**

- **Unit** (чистые функции, без БД/сети):
  - argon2: `hash → verify` = true; неверный пароль = false; `needsRehash()` при старых параметрах.
  - JWT: sign → verify → правильный payload; протухший `exp` отвергнут; битая подпись отвергнута;
    payload содержит `{userId, activeOrgId, jti}` и **НЕ содержит role/email** (страж против регрессии P3).
  - refresh: `sha256(raw)` детерминирован; `randomBytes` даёт разные токены.

- **Integration** (реальная БД + транзакции — здесь ловится СУТЬ auth; мок репозитория это не покажет):
  - **reuse detection убивает семью** ← САМЫЙ ВАЖНЫЙ тест: логин → refresh(B) → прислать старый A →
    ожидаем `revokedAt` на всех строках `familyId` + 401. Без него не знаешь, работает ли главная защита.
  - happy-path ротации: старой строке `usedAt`, новая строка с тем же `familyId`, новый access+refresh.
  - logout закрывает доступ: refresh после logout → 401.
  - switch-org: без membership → 403; с membership → новый access с новым `activeOrgId`.
  - guard: валидный access → роль читается свежей; юзер исключён из орги → отказ СРАЗУ (не через 15 мин).
  - **tenant-изоляция:** access с `activeOrgId=A` не достаёт данные орги B (composite-FK + ALS запирают).
  - **конкурентность:** два одновременных refresh с одним токеном → один выигрывает, второй ловит reuse.

- **E2E** — на M0 избыточно (Supertest in-process покрывает), приберечь.

**Золотой набор (без него auth НЕ готов):**

1. verify пароля (unit) · 2. JWT sign/verify + payload без role (unit) ·
2. **reuse detection убивает семью** (integration) · 4. logout закрывает доступ (integration) ·
3. tenant-изоляция: чужая орга недоступна (integration).

**Тест как охрана инварианта от регрессии:** тест на reuse краснеет, если кто-то «оптимизирует» ротацию на
in-place (§5, запрещено). Это не «проверить сейчас», а «не дать сломать потом» — та же философия, что тесты
на manual-migration-инварианты. На защите зелёный тест на reuse-detection — сильнейший аргумент: инвариант
не нарисован, а исполняется.

## Appendix — Defense Q&A (вопросы ревьюера → короткие ответы)

- **Access stateless — как отзываешь при logout?** Никак напрямую; отзываешь refresh, access протухает ≤15 мин.
  Поэтому он короткий.
- **Refresh украли — как узнаешь?** Инвариант «ровно один раз» + reuse detection: повторный приход
  использованного токена = аномалия → kill family.
- **Почему kill family, а не просто отказ?** Нельзя отличить вора от юзера → безопасно только убить цепочку.
- **Юзер в двух оргах — как не дать чужие данные?** `activeOrgId` в токене → ALS → composite-FK backbone
  физически запирает.
- **Почему role не в JWT?** Устаревает (stale authz) + membership читается 1 раз/запрос бесплатно + ловит
  исключение из орги мгновенно.
- **Почему argon2 для пароля, но sha256 для refresh?** Пароль низкоэнтропийный (нужен медленный memory-hard);
  refresh высокоэнтропийный (брутфорс нерелевантен, быстрый хеш корректен).
- **httpOnly cookie — а CSRF?** httpOnly против XSS, SameSite=Lax против CSRF — разные угрозы. CSRF-токен —
  второй слой позже.
- **Почему access — JWT, а не таблица?** Горячий путь: 1000 запросов = 1000 проверок подписи без 1000 SELECT.
- **Что делает logout?** Revoke RefreshSession; access доживает ≤15 мин (stateless, не удаляется на сервере).
