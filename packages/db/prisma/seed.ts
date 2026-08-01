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
const DEFAULT_PHASES: ReadonlyArray<{ key: string; name: { en: string }; type: PhaseType }> = [
  { key: "lead", name: { en: "Lead" }, type: PhaseType.OPEN },
  { key: "in-progress", name: { en: "In Progress" }, type: PhaseType.OPEN },
  { key: "won", name: { en: "Won" }, type: PhaseType.WON },
  { key: "lost", name: { en: "Lost" }, type: PhaseType.LOST },
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

async function main(): Promise<void> {
  const { orgId, userIdByRole } = await upsertOrgAndUsers();
  const { id: workspaceId, phaseIdByKey } = await upsertWorkspace(orgId);
  await seedProjects(orgId, workspaceId, phaseIdByKey, userIdByRole);

  console.log(`Seed OK — org ${orgId}, workspace ${workspaceId}. Пароль для всех демо-юзеров: ${DEMO_PASSWORD}`);
  for (const u of DEMO_USERS) console.log(`  ${u.role.padEnd(7)} ${u.email}`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
