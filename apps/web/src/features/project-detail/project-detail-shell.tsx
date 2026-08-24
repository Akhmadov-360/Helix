import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, Bot, Building2, DollarSign, Link2 } from "lucide-react";
import type { CompanyResponse } from "@helix/api-schemas";
import { Avatar, Badge, Button, Card, cn, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@helix/ui";
import { ChatDrawer } from "../ai-chat/chat-drawer";
import { useCan } from "../../shared/auth/ability";
import { useLocaleStore, useT } from "../../shared/i18n";
import { formatRelative } from "../../shared/lib/format-relative";
import { sourceUrl } from "../../shared/lib/source-link";
import { orgMembersQueryOptions } from "../../shared/org/queries";
import { AssigneesPanel } from "./assignees-panel";
import { CustomFieldsPanel } from "./custom-fields-panel";
import { useReassignProject } from "./mutations";
import { projectQueryOptions } from "./queries";
import { ProjectTabs } from "./project-tabs";

const NO_OWNER = "__none__";

// Владелец — единственный ответственный за лид (schema.prisma: "инвариант ровно один"), не то же
// самое, что co-workers (AssigneesPanel). Переназначение — Manager+ (ADR "reassign — первоклассная
// операция"), поэтому Select виден/активен только под can('reassign'), иначе — просто текст.
// Возвращает ТОЛЬКО значение (без label) — обёртка SidebarCell отвечает за label и layout ячейки.
function OwnerValue({ orgId, workspaceId, projectId, ownerId }: { orgId: string; workspaceId: string; projectId: string; ownerId: string | null }) {
  const t = useT();
  const canReassign = useCan("Project.reassign");
  const members = useSuspenseQuery(orgMembersQueryOptions(orgId)).data;
  const reassign = useReassignProject(orgId, workspaceId, projectId);
  const owner = ownerId ? members.find((m) => m.userId === ownerId) : undefined;

  if (!canReassign) {
    return (
      <span
        className="flex min-w-0 items-center gap-1.5 text-sm font-medium"
        title={owner?.name}
      >
        {owner ? (
          <>
            <Avatar name={owner.name} size="sm" className="shrink-0" />
            <span className="min-w-0 truncate">{owner.name}</span>
          </>
        ) : (
          <span className="text-muted-foreground">{t("projectDetail.overview.unassigned")}</span>
        )}
      </span>
    );
  }

  return (
    <Select
      value={ownerId ?? NO_OWNER}
      onValueChange={(v) => reassign.mutate({ ownerId: v === NO_OWNER ? null : v })}
      disabled={reassign.isPending}
    >
      {/* `[&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate` — таргетируем внутренний span
          Radix `SelectValue`, у которого нет своего className-хука. Без этого `truncate` на
          нашем `<span>` внутри SelectValue игнорируется, потому что Radix-span уже съел ширину. */}
      <SelectTrigger
        title={owner?.name}
        className="h-auto w-full min-w-0 gap-1.5 border-none bg-transparent p-0 text-sm font-medium shadow-none hover:bg-transparent focus:ring-0 disabled:opacity-70 [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate"
      >
        <SelectValue>
          {owner ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <Avatar name={owner.name} size="sm" className="shrink-0" />
              <span className="min-w-0 truncate">{owner.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{t("projectDetail.overview.unassigned")}</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_OWNER}>{t("projectDetail.overview.unassigned")}</SelectItem>
        {members.map((member) => (
          <SelectItem key={member.userId} value={member.userId}>
            {member.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Одна ячейка в 2-колоночной сетке Deal Details: uppercase-label сверху, значение снизу.
// value — уже готовый ReactNode (Avatar+имя, ссылка, дата), обёртка не решает как рендерить.
function SidebarCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="min-w-0 text-sm font-medium">{value}</div>
    </div>
  );
}

// Персистентный под-shell: заголовок+статус+табы (левая колонка, 70%) + сайдбар «Детали сделки» +
// «Участники сделки» (правая, 30%, redesign) — виден на ЛЮБОЙ вкладке, не только на бывшей
// "Обзор" (убрана: её контент теперь тут, постоянно, а не только на своей вкладке).
//
// companies — пропом (тот же приём, что project-card.tsx на доске): features/* не импортируют
// друг друга напрямую, композиция на уровне routes/ (contacts.tsx/tasks.tsx/activity.tsx грузят
// companiesListQueryOptions наравне с co-workers — design review, "компания не отображается ByID").
export function ProjectDetailShell({
  orgId,
  projectId,
  companies,
  children,
}: {
  orgId: string;
  projectId: string;
  companies: CompanyResponse[];
  children: ReactNode;
}) {
  const project = useSuspenseQuery(projectQueryOptions(orgId, projectId)).data;
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const company = project.companyId ? companies.find((c) => c.id === project.companyId) : undefined;
  const [chatOpen, setChatOpen] = useState(false);

  const value =
    project.value === null || project.currency === null
      ? t("projectDetail.overview.empty")
      : new Intl.NumberFormat(locale, { style: "currency", currency: project.currency }).format(project.value);
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const relativeFormatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  return (
    <div className="flex flex-col gap-4">
      {/* Раньше единственный путь назад к доске — browser back; project.workspaceId уже есть
          в ответе, отдельного запроса не требует. */}
      <Link
        to="/workspaces/$workspaceId/board"
        params={{ workspaceId: project.workspaceId }}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("projectDetail.backToBoard")}
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* items-baseline + flex-wrap: длинный title (например «Acme Corp Global Enterprise
              Digital Transformation Q4 2026») переносится, но badge OPEN не отрывается вниз —
              остаётся на baseline первой строки. min-w-0 на title-wrapper обязателен: без него
              flex-child игнорирует overflow parent'а и продолжает пушить контент вправо. */}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="min-w-0 flex-1 break-words text-lg font-semibold">{project.title}</h1>
            <Badge
              className="shrink-0"
              variant={project.status === "WON" ? "success" : project.status === "LOST" ? "destructive" : "default"}
            >
              {t(`projectDetail.status.${project.status}`)}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto shrink-0 gap-1.5"
              onClick={() => setChatOpen(true)}
            >
              <Bot className="h-3.5 w-3.5" />
              {t("aiChat.trigger")}
            </Button>
          </div>
          <ProjectTabs projectId={projectId} />
          {children}
        </div>

        <aside className="flex flex-col gap-6 lg:border-l lg:border-border lg:pl-6">
          {/* Deal Details — единственная секция в Card (border, без shadow): value-блок + 2-колоночная
              сетка ключевых полей. Attributes/Team — плоские section-groups под ней (иерархия без
              лишних коробок). */}
          <Card className="flex flex-col gap-4 rounded-xl p-4 shadow-none">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-sm font-semibold">{t("projectDetail.sidebar.details")}</h2>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("projectDetail.overview.value")}
              </span>
              <span
                className={cn(
                  "text-2xl font-semibold tracking-tight tabular-nums",
                  // Прямой цвет вместо семантического токена: у нас нет `success` палитры в токенах
                  // (только в Badge как класс-набор), а «зелёные деньги» — узко-специфичный акцент,
                  // не общий semantic-color. Второй потребитель — заведём токен.
                  project.value !== null && project.value > 0 && "text-emerald-600 dark:text-emerald-500",
                )}
              >
                {value}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-3">
              <SidebarCell
                label={t("projectDetail.overview.owner")}
                value={
                  <OwnerValue
                    orgId={orgId}
                    workspaceId={project.workspaceId}
                    projectId={projectId}
                    ownerId={project.ownerId}
                  />
                }
              />
              <SidebarCell
                label={t("projectDetail.overview.company")}
                value={
                  company ? (
                    <Link
                      to="/companies/$companyId"
                      params={{ companyId: company.id }}
                      title={company.name}
                      className="group flex min-w-0 items-center gap-1 hover:text-accent"
                    >
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 truncate">{company.name}</span>
                      <ArrowUpRight className="h-3 w-3 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-accent" />
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{t("projectDetail.overview.empty")}</span>
                  )
                }
              />
              <SidebarCell
                label={t("projectDetail.overview.source")}
                value={
                  project.source ? (
                    sourceUrl(project.source) ? (
                      <a
                        href={sourceUrl(project.source)!}
                        target="_blank"
                        rel="noreferrer noopener"
                        title={project.source}
                        className="flex min-w-0 items-center gap-1 hover:text-accent"
                      >
                        <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 truncate">{project.source}</span>
                        <ArrowUpRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                      </a>
                    ) : (
                      <span className="block truncate" title={project.source}>{project.source}</span>
                    )
                  ) : (
                    <span className="text-muted-foreground">{t("projectDetail.overview.empty")}</span>
                  )
                }
              />
              <SidebarCell
                label={t("projectDetail.overview.created")}
                value={
                  <span
                    className="cursor-default"
                    title={dateFormatter.format(new Date(project.createdAt))}
                  >
                    {formatRelative(project.createdAt, relativeFormatter)}
                  </span>
                }
              />
            </div>
          </Card>

          <CustomFieldsPanel orgId={orgId} workspaceId={project.workspaceId} projectId={projectId} fields={project.fields} />

          <AssigneesPanel orgId={orgId} projectId={projectId} ownerId={project.ownerId} />
        </aside>
      </div>

      <ChatDrawer orgId={orgId} projectId={projectId} open={chatOpen} onOpenChange={setChatOpen} />
    </div>
  );
}

