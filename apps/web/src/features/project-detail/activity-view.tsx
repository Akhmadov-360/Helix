import { useSuspenseQuery } from "@tanstack/react-query";
import type { ProjectEvent } from "@helix/api-schemas";
import { Card, CardContent } from "@helix/ui";
import { useLocaleStore, useT, type TFunction } from "../../shared/i18n";
import { useLocalize } from "../../shared/lib/localize";
import { projectActivityQueryOptions } from "./queries";
import { toActivityItems, type ActivityItem } from "./select";

export function ActivityView({ orgId, projectId }: { orgId: string; projectId: string }) {
  const events = useSuspenseQuery(projectActivityQueryOptions(orgId, projectId)).data;
  const items = toActivityItems(events);
  const t = useT();
  const localize = useLocalize();
  const locale = useLocaleStore((state) => state.locale);
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  if (items.length === 0) {
    return <p className="text-muted-foreground">{t("projectDetail.activity.empty")}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <Card>
            <CardContent className="flex items-baseline justify-between gap-4 p-4">
              <span className="text-sm">{describe(item, t, localize)}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {dateFormatter.format(new Date(item.createdAt))}
              </span>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function describe(item: ActivityItem, t: TFunction, localize: ReturnType<typeof useLocalize>): string {
  if (!item.known) return t("projectDetail.activity.unknown", { type: item.type });
  return describeEvent(item.event, t, localize);
}

function describeEvent(event: ProjectEvent, t: TFunction, localize: ReturnType<typeof useLocalize>): string {
  const actor = event.payload.actorName ?? t("projectDetail.activity.unknownActor");
  switch (event.type) {
    case "project.created":
      return t("projectDetail.activity.created", { actor });
    case "project.updated":
      return t("projectDetail.activity.updatedValue", { actor });
    case "project.archived":
      return t("projectDetail.activity.archived", { actor });
    case "project.restored":
      return t("projectDetail.activity.restored", { actor });
    case "project.reassigned":
      return t("projectDetail.activity.reassigned", {
        actor,
        from: event.payload.fromOwnerName ?? t("projectDetail.activity.pool"),
        to: event.payload.toOwnerName ?? t("projectDetail.activity.pool"),
      });
    case "project.moved":
      return t("projectDetail.activity.moved", {
        actor,
        from: localize(event.payload.fromPhaseName),
        to: localize(event.payload.toPhaseName),
      });
    case "task.created":
      return t("projectDetail.activity.taskCreated", { actor, title: event.payload.taskTitle });
    case "task.completed":
      return t("projectDetail.activity.taskCompleted", { actor, title: event.payload.taskTitle });
  }
}
