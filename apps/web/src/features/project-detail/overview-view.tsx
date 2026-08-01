import { useSuspenseQuery } from "@tanstack/react-query";
import { Badge, Card, CardContent, CardHeader } from "@helix/ui";
import { useLocaleStore, useT } from "../../shared/i18n";
import { projectQueryOptions } from "./queries";

// Owner/company сейчас содержат только id (§4, ProjectResponse) — имена требуют отдельных
// members/companies-запросов, которых ещё нет во фронте (см. §13 остаток). Не рендерим id
// напрямую (плохой UX) — поля появятся вместе с reassign/company-link UI.
export function OverviewView({ orgId, projectId }: { orgId: string; projectId: string }) {
  const project = useSuspenseQuery(projectQueryOptions(orgId, projectId)).data;
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);

  const value =
    project.value === null || project.currency === null
      ? t("projectDetail.overview.empty")
      : new Intl.NumberFormat(locale, { style: "currency", currency: project.currency }).format(project.value);

  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase text-muted-foreground">{t("projectDetail.overview.value")}</span>
          <span className="text-2xl font-semibold tracking-tight">{value}</span>
        </div>
        <Badge variant={project.status === "WON" ? "success" : project.status === "LOST" ? "destructive" : "default"}>
          {t(`projectDetail.status.${project.status}`)}
        </Badge>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3">
        <Field
          label={t("projectDetail.overview.source")}
          value={project.source ?? t("projectDetail.overview.empty")}
        />
        <Field
          label={t("projectDetail.overview.created")}
          value={dateFormatter.format(new Date(project.createdAt))}
        />
        <Field
          label={t("projectDetail.overview.updated")}
          value={dateFormatter.format(new Date(project.updatedAt))}
        />
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
