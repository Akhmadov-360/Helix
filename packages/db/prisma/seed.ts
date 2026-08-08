import { PrismaClient, Role, Audience, PhaseType, ProjectStatus } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { generateNKeysBetween } from "fractional-indexing";

const prisma = new PrismaClient();

// Идентична apps/api/src/modules/auth/password.service.ts (ARGON2_POLICY) — не импортируем
// оттуда: packages/db не зависит от apps/api (направление зависимостей монорепо). Расхождение
// параметров не сломает логин (verify читает параметры из самой PHC-строки), но пусть новый
// хеш сразу не просит progressive rehash.
const ARGON2_POLICY = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
const DEMO_PASSWORD = "helix-demo-2026";

const DEMO_USERS: ReadonlyArray<{ email: string; name: string; role: Role }> = [
  { email: "owner@helix.dev", name: "Olga Owner", role: Role.OWNER },
  { email: "admin@helix.dev", name: "Arman Admin", role: Role.ADMIN },
  { email: "manager@helix.dev", name: "Malika Manager", role: Role.MANAGER },
  { email: "member@helix.dev", name: "Bek Member", role: Role.MEMBER },
  { email: "viewer@helix.dev", name: "Vera Viewer", role: Role.VIEWER },
];

// Тот же набор, что workspaces.service.ts создаёт для реальной регистрации (§10 варианта B) —
// держим демо-доску неотличимой от того, что получает настоящий пользователь.
const DEFAULT_PHASES: ReadonlyArray<{ key: string; name: { en: string; ru: string; uz: string }; type: PhaseType }> = [
  { key: "lead", name: { en: "Lead", ru: "Лид", uz: "Lid" }, type: PhaseType.OPEN },
  { key: "in-progress", name: { en: "In Progress", ru: "В работе", uz: "Jarayonda" }, type: PhaseType.OPEN },
  { key: "won", name: { en: "Won", ru: "Выиграно", uz: "Yutildi" }, type: PhaseType.WON },
  { key: "lost", name: { en: "Lost", ru: "Проиграно", uz: "Yutqazildi" }, type: PhaseType.LOST },
];

async function upsertOrgAndUsers(): Promise<{ orgId: string; userIdByRole: Record<Role, string> }> {
  const passwordHash = await hash(DEMO_PASSWORD, ARGON2_POLICY);

  // Идемпотентность: если owner@helix.dev уже существует и состоит в орге — переиспользуем её,
  // а не заводим вторую демо-организацию на повторном запуске.
  const existingOwner = await prisma.user.findUnique({
    where: { email: DEMO_USERS[0]!.email },
    include: { memberships: true },
  });
  const orgId =
    existingOwner?.memberships[0]?.orgId ??
    (await prisma.organization.create({ data: { name: "Helix Demo" } })).id;

  const userIdByRole = {} as Record<Role, string>;
  for (const demo of DEMO_USERS) {
    const user = await prisma.user.upsert({
      where: { email: demo.email },
      update: { name: demo.name },
      create: { email: demo.email, name: demo.name, passwordHash },
    });
    await prisma.membership.upsert({
      where: { orgId_userId: { orgId, userId: user.id } },
      update: { role: demo.role },
      create: { orgId, userId: user.id, role: demo.role },
    });
    userIdByRole[demo.role] = user.id;
  }

  return { orgId, userIdByRole };
}

async function upsertWorkspace(orgId: string): Promise<{ id: string; phaseIdByKey: Record<string, string> }> {
  const existing = await prisma.workspace.findFirst({
    where: { orgId, name: "Demo Board" },
    include: { phases: true },
  });
  const workspace =
    existing ??
    (await prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.create({ data: { orgId, name: "Demo Board", audience: Audience.MIXED } });
      await tx.phase.createMany({
        data: DEFAULT_PHASES.map((p, i) => ({
          workspaceId: ws.id,
          key: p.key,
          name: p.name,
          type: p.type,
          order: i + 1,
        })),
      });
      return tx.workspace.findUniqueOrThrow({ where: { id: ws.id }, include: { phases: true } });
    }));

  const phaseIdByKey = Object.fromEntries(workspace.phases.map((p) => [p.key, p.id]));
  return { id: workspace.id, phaseIdByKey };
}

async function seedProjects(
  orgId: string,
  workspaceId: string,
  phaseIdByKey: Record<string, string>,
  userIdByRole: Record<Role, string>,
): Promise<void> {
  const alreadySeeded = (await prisma.project.count({ where: { workspaceId } })) > 0;
  if (alreadySeeded) return;

  // По колонке: rank — плотная сетка внутри фазы (§KAN-1), не через все фазы разом.
  const byPhase: ReadonlyArray<{
    phaseKey: string;
    status: ProjectStatus;
    projects: ReadonlyArray<{ title: string; value?: string; currency?: string; ownerId?: string }>;
  }> = [
    {
      phaseKey: "lead",
      status: ProjectStatus.OPEN,
      projects: [
        { title: "Acme Corp — сайт-визитка", value: "1500000", currency: "UZS", ownerId: userIdByRole.MANAGER },
        { title: "Beta LLC — внедрение CRM", value: "8000", currency: "USD", ownerId: userIdByRole.MEMBER },
        { title: "Zafar Foods — доставка" },
      ],
    },
    {
      phaseKey: "in-progress",
      status: ProjectStatus.OPEN,
      projects: [
        { title: "Delta Studio — мобильное приложение", value: "12000", currency: "USD", ownerId: userIdByRole.OWNER },
        { title: "Epsilon Servis — контракт поддержки", ownerId: userIdByRole.MANAGER },
      ],
    },
    {
      phaseKey: "won",
      status: ProjectStatus.WON,
      projects: [
        { title: "Gamma Trade — интеграция оплаты", value: "5000", currency: "USD", ownerId: userIdByRole.ADMIN },
      ],
    },
    {
      phaseKey: "lost",
      status: ProjectStatus.LOST,
      projects: [{ title: "Omega Group — пилот", ownerId: userIdByRole.MEMBER }],
    },
  ];

  for (const column of byPhase) {
    const ranks = generateNKeysBetween(null, null, column.projects.length);
    await prisma.project.createMany({
      data: column.projects.map((p, i) => ({
        orgId,
        workspaceId,
        phaseId: phaseIdByKey[column.phaseKey]!,
        title: p.title,
        status: column.status,
        value: p.value,
        currency: p.currency,
        ownerId: p.ownerId,
        rank: ranks[i]!,
      })),
    });
  }
}

// Демо смены орги (M1 защита): владелец Helix Demo одновременно состоит во ВТОРОЙ орге с ДРУГОЙ
// ролью — тот же живой юзер/токен, разные capabilities в зависимости от activeOrgId. Показывает
// switch-org (§decisions.md "activeOrgId в токене") и что роль пересчитывается per-org, не глобальна.
const SECOND_ORG_NAME = "Nomad Ventures";
const SECOND_ORG_OWNER = { email: "rustam@helix.dev", name: "Rustam Founder" };
const CROSS_MEMBER_EMAIL = DEMO_USERS[0]!.email; // owner@helix.dev — OWNER в Helix Demo, MEMBER здесь

async function upsertSecondOrg(): Promise<{ orgId: string; crossMemberId: string }> {
  const passwordHash = await hash(DEMO_PASSWORD, ARGON2_POLICY);

  const existingSecondOwner = await prisma.user.findUnique({
    where: { email: SECOND_ORG_OWNER.email },
    include: { memberships: true },
  });
  const orgId =
    existingSecondOwner?.memberships[0]?.orgId ??
    (await prisma.organization.create({ data: { name: SECOND_ORG_NAME } })).id;

  const secondOwner = await prisma.user.upsert({
    where: { email: SECOND_ORG_OWNER.email },
    update: { name: SECOND_ORG_OWNER.name },
    create: { email: SECOND_ORG_OWNER.email, name: SECOND_ORG_OWNER.name, passwordHash },
  });
  await prisma.membership.upsert({
    where: { orgId_userId: { orgId, userId: secondOwner.id } },
    update: { role: Role.OWNER },
    create: { orgId, userId: secondOwner.id, role: Role.OWNER },
  });

  const crossMember = await prisma.user.findUniqueOrThrow({ where: { email: CROSS_MEMBER_EMAIL } });
  await prisma.membership.upsert({
    where: { orgId_userId: { orgId, userId: crossMember.id } },
    update: { role: Role.MEMBER },
    create: { orgId, userId: crossMember.id, role: Role.MEMBER },
  });

  return { orgId, crossMemberId: crossMember.id };
}

async function seedSecondOrgProjects(
  orgId: string,
  workspaceId: string,
  phaseIdByKey: Record<string, string>,
  crossMemberId: string,
): Promise<void> {
  const alreadySeeded = (await prisma.project.count({ where: { workspaceId } })) > 0;
  if (alreadySeeded) return;

  // Один лид принадлежит cross-member (Olga) — в этой орге она MEMBER, владеет своим лидом,
  // но не может управлять воркспейсом/фазами (capability-проверка видна прямо на UI).
  const ranks = generateNKeysBetween(null, null, 2);
  await prisma.project.createMany({
    data: [
      {
        orgId,
        workspaceId,
        phaseId: phaseIdByKey.lead!,
        title: "Silk Road Traders — поставки",
        status: ProjectStatus.OPEN,
        value: "24000",
        currency: "USD",
        ownerId: crossMemberId,
        rank: ranks[0]!,
      },
      {
        orgId,
        workspaceId,
        phaseId: phaseIdByKey["in-progress"]!,
        title: "Tashkent Retail — POS-интеграция",
        status: ProjectStatus.OPEN,
        rank: ranks[1]!,
      },
    ],
  });
}

// blueprints.md §5: сидинг, не миграция (данные, не схема) — минимум по одному системному
// блюпринту на B2B/B2C, из PRD §7.5 «Sample system blueprints» как отправная точка, не выдумка.
// Детерминированный id (не cuid()) — идемпотентность сида без дублей между запусками.
const SYSTEM_BLUEPRINTS: ReadonlyArray<{
  id: string;
  audience: Audience;
  name: string;
  definition: Record<string, unknown>;
}> = [
  {
    id: "bp-b2b-software-agency",
    audience: Audience.B2B,
    name: "Software Agency Client Pipeline",
    definition: {
      phases: [
        { key: "call_request", name: { en: "Call Request", ru: "Запрос звонка", uz: "Qo'ng'iroq so'rovi" }, type: "OPEN", order: 1 },
        { key: "discovery", name: { en: "Discovery", ru: "Знакомство", uz: "Tanishuv" }, type: "OPEN", order: 2 },
        { key: "planning", name: { en: "Planning", ru: "Планирование", uz: "Rejalashtirish" }, type: "OPEN", order: 3 },
        { key: "contract", name: { en: "Contract", ru: "Договор", uz: "Shartnoma" }, type: "OPEN", order: 4 },
        { key: "won", name: { en: "Won", ru: "Выиграно", uz: "Yutildi" }, type: "WON", order: 5 },
        { key: "lost", name: { en: "Lost", ru: "Проиграно", uz: "Yutqazildi" }, type: "LOST", order: 6 },
      ],
      projectFields: [
        { key: "budget", label: { en: "Budget", ru: "Бюджет", uz: "Byudjet" }, type: "currency" },
        {
          key: "tech_stack",
          label: { en: "Preferred Stack", ru: "Предпочитаемый стек", uz: "Afzal ko'rilgan texnologiyalar" },
          type: "multiselect",
          options: ["TS", "Python", "Go"],
        },
        { key: "target_start", label: { en: "Target Start", ru: "Плановая дата начала", uz: "Boshlanish sanasi" }, type: "date" },
      ],
      notificationDefaults: { newLead: { email: true, recipients: ["owner", "assignees"] } },
    },
  },
  {
    id: "bp-b2c-real-estate",
    audience: Audience.B2C,
    name: "Real Estate Buyer",
    definition: {
      phases: [
        { key: "inquiry", name: { en: "Inquiry", ru: "Заявка", uz: "So'rov" }, type: "OPEN", order: 1 },
        { key: "pre_qualified", name: { en: "Pre-qualified", ru: "Предквалификация", uz: "Dastlabki tekshiruv" }, type: "OPEN", order: 2 },
        { key: "viewing", name: { en: "Viewing", ru: "Просмотр", uz: "Ko'rish" }, type: "OPEN", order: 3 },
        { key: "offer", name: { en: "Offer", ru: "Предложение", uz: "Taklif" }, type: "OPEN", order: 4 },
        { key: "closing", name: { en: "Closing", ru: "Закрытие сделки", uz: "Bitim yopilishi" }, type: "WON", order: 5 },
        { key: "lost", name: { en: "Lost", ru: "Проиграно", uz: "Yutqazildi" }, type: "LOST", order: 6 },
      ],
      projectFields: [
        {
          key: "property_type",
          label: { en: "Property Type", ru: "Тип недвижимости", uz: "Ko'chmas mulk turi" },
          type: "select",
          options: ["Apartment", "House", "Commercial"],
        },
        { key: "budget_max", label: { en: "Max Budget", ru: "Макс. бюджет", uz: "Maks. byudjet" }, type: "currency" },
        { key: "preferred_district", label: { en: "Preferred District", ru: "Желаемый район", uz: "Afzal ko'rilgan tuman" }, type: "text" },
      ],
      notificationDefaults: { newLead: { email: true, recipients: ["owner"] } },
    },
  },
];

async function upsertSystemBlueprints(): Promise<void> {
  for (const bp of SYSTEM_BLUEPRINTS) {
    await prisma.blueprint.upsert({
      where: { id: bp.id },
      update: { audience: bp.audience, name: bp.name, definition: bp.definition },
      create: { id: bp.id, orgId: null, audience: bp.audience, name: bp.name, definition: bp.definition },
    });
  }
}

async function main(): Promise<void> {
  const { orgId, userIdByRole } = await upsertOrgAndUsers();
  const { id: workspaceId, phaseIdByKey } = await upsertWorkspace(orgId);
  await seedProjects(orgId, workspaceId, phaseIdByKey, userIdByRole);

  const { orgId: secondOrgId, crossMemberId } = await upsertSecondOrg();
  const { id: secondWorkspaceId, phaseIdByKey: secondPhaseIdByKey } = await upsertWorkspace(secondOrgId);
  await seedSecondOrgProjects(secondOrgId, secondWorkspaceId, secondPhaseIdByKey, crossMemberId);

  await upsertSystemBlueprints();
  console.log(`Системные блюпринты: ${SYSTEM_BLUEPRINTS.map((b) => b.id).join(", ")}`);

  console.log(`Seed OK — org ${orgId}, workspace ${workspaceId}. Пароль для всех демо-юзеров: ${DEMO_PASSWORD}`);
  for (const u of DEMO_USERS) console.log(`  ${u.role.padEnd(7)} ${u.email}`);
  console.log(`Второй орг «${SECOND_ORG_NAME}» — org ${secondOrgId}, workspace ${secondWorkspaceId}`);
  console.log(`  OWNER   ${SECOND_ORG_OWNER.email}`);
  console.log(`  MEMBER  ${CROSS_MEMBER_EMAIL}  (в Helix Demo — OWNER; смени оргу на "${SECOND_ORG_NAME}" тем же логином)`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
