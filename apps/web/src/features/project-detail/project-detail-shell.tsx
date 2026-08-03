import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Building2 } from "lucide-react";
import type { CompanyResponse } from "@helix/api-schemas";
import { Avatar, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useLocaleStore, useT } from "../../shared/i18n";
import { orgMembersQueryOptions } from "../../shared/org/queries";
import { AssigneesPanel } from "./assignees-panel";
import { CustomFieldsPanel } from "./custom-fields-panel";
import { useReassignProject } from "./mutations";
import { projectQueryOptions } from "./queries";
import { ProjectTabs } from "./project-tabs";

const NO_OWNER = "__none__";

// Владелец — единственный ответственный за лид (schema.prisma: "инвариант ровно один"), не то же
// самое, что co-workers (AssigneesPanel). Переназначение — отдельная Manager+ операция (decisions.md
// ADR "reassign — первоклассная операция"), поэтому Select виден/активен только под can('reassign'),
// иначе — просто текст (та же логика, что остальной сайдбар: UI-скрытие косметическое, сервер —
// единственный энфорсер).
function OwnerField({ orgId, workspaceId, projectId, ownerId }: { orgId: string; workspaceId: string; projectId: string; ownerId: string | null }) {
  const t = useT();
  const canReassign = useCan("Project.reassign");
  const members = useSuspenseQuery(orgMembersQueryOptions(orgId)).data;
  const reassign = useReassignProject(orgId, workspaceId, projectId);
  const owner = ownerId ? members.find((m) => m.userId === ownerId) : undefined;

  if (!canReassign) {
    return (
      <div className="flex items-center justify-between gap-2">
        <dt className="text-muted-foreground">{t("projectDetail.overview.owner")}</dt>
        <dd className="flex items-center gap-1.5 font-medium">
          {owner ? (
            <>
              <Avatar name={owner.name} size="sm" />
              {owner.name}
            </>
          ) : (
            t("projectDetail.overview.unassigned")
          )}
        </dd>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="shrink-0 text-muted-foreground">{t("projectDetail.overview.owner")}</dt>
      <Select
        value={ownerId ?? NO_OWNER}
        onValueChange={(v) => reassign.mutate({ ownerId: v === NO_OWNER ? null : v })}
        disabled={reassign.isPending}
      >
        <SelectTrigger className="h-8 w-40">
          <SelectValue />
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

  const value =
    project.value === null || project.currency === null
      ? t("projectDetail.overview.empty")
      : new Intl.NumberFormat(locale, { style: "currency", currency: project.currency }).format(project.value);
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">{project.title}</h1>
            <Badge
              variant={project.status === "WON" ? "success" : project.status === "LOST" ? "destructive" : "default"}
            >
              {t(`projectDetail.status.${project.status}`)}
            </Badge>
          </div>
          <ProjectTabs projectId={projectId} />
          {children}
        </div>

        <aside className="flex flex-col gap-6 lg:border-l lg:border-border lg:pl-6">
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">{t("projectDetail.sidebar.details")}</h2>
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase text-muted-foreground">{t("projectDetail.overview.value")}</span>
              <span className="text-2xl font-semibold tracking-tight">{value}</span>
            </div>
            <dl className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
              <OwnerField orgId={orgId} workspaceId={project.workspaceId} projectId={projectId} ownerId={project.ownerId} />
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">{t("projectDetail.overview.company")}</dt>
                <dd className="font-medium">
                  {company ? (
                    <Link to="/companies/$companyId" params={{ companyId: company.id }} className="inline-flex items-center gap-1 hover:text-accent">
                      <Building2 className="h-3.5 w-3.5" />
                      {company.name}
                    </Link>
                  ) : (
                    t("projectDetail.overview.empty")
                  )}
                </dd>
              </div>
              <SidebarField
                label={t("projectDetail.overview.source")}
                value={project.source ?? t("projectDetail.overview.empty")}
              />
              <SidebarField
                label={t("projectDetail.overview.created")}
                value={dateFormatter.format(new Date(project.createdAt))}
              />
              <SidebarField
                label={t("projectDetail.overview.updated")}
                value={dateFormatter.format(new Date(project.updatedAt))}
              />
            </dl>
          </div>

          <CustomFieldsPanel orgId={orgId} workspaceId={project.workspaceId} projectId={projectId} fields={project.fields} />

          <AssigneesPanel orgId={orgId} projectId={projectId} />
        </aside>
      </div>
    </div>
  );
}

function SidebarField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
