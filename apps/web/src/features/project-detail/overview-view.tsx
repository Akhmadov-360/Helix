import { useSuspenseQuery } from "@tanstack/react-query";
import { Badge, Card, CardContent } from "@helix/ui";
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
      <CardContent className="flex flex-col gap-6 p-6">
        <Badge variant={project.status === "WON" ? "success" : project.status === "LOST" ? "destructive" : "default"}>
          {t(`projectDetail.status.${project.status}`)}
        </Badge>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label={t("projectDetail.overview.value")} value={value} />
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
        </div>
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
