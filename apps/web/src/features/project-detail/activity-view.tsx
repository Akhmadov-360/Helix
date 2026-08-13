import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Archive,
  ArrowRightLeft,
  CheckCircle2,
  FilePlus2,
  FileX2,
  ListPlus,
  Pencil,
  PlusCircle,
  RotateCcw,
  Trash2,
  Upload,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import type { ProjectEvent } from "@helix/api-schemas";
import { useLocaleStore, useT, type TFunction } from "../../shared/i18n";
import { formatRelative } from "../../shared/lib/format-relative";
import { useLocalize } from "../../shared/lib/localize";
import { projectActivityQueryOptions } from "./queries";
import { toActivityItems, type ActivityItem } from "./select";

const EVENT_ICONS: Record<ProjectEvent["type"], LucideIcon> = {
  "project.created": PlusCircle,
  "project.updated": Pencil,
  "project.reassigned": UserCog,
  "project.moved": ArrowRightLeft,
  "project.archived": Archive,
  "project.restored": RotateCcw,
  "task.created": ListPlus,
  "task.completed": CheckCircle2,
  "attachment.uploaded": Upload,
  "attachment.deleted": Trash2,
  "page.created": FilePlus2,
  "page.deleted": FileX2,
};

// Вертикальная лента (redesign): guide-линия + узел-иконка по типу события + относительное время.
export function ActivityView({ orgId, projectId }: { orgId: string; projectId: string }) {
  const events = useSuspenseQuery(projectActivityQueryOptions(orgId, projectId)).data;
  const items = toActivityItems(events);
  const t = useT();
  const localize = useLocalize();
  const locale = useLocaleStore((state) => state.locale);
  const relativeFormatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (items.length === 0) {
    return <p className="text-muted-foreground">{t("projectDetail.activity.empty")}</p>;
  }

  return (
    <ol className="relative ml-4 flex flex-col gap-6 border-l-2 border-border pl-6">
      {items.map((item) => {
        const Icon = item.known ? (EVENT_ICONS[item.event.type] ?? PlusCircle) : PlusCircle;
        return (
          <li key={item.id} className="relative">
            <span className="absolute -left-[1.9rem] flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm">{describe(item, t, localize)}</p>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatRelative(item.createdAt, relativeFormatter)}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
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
    case "attachment.uploaded":
      return t("projectDetail.activity.attachmentUploaded", { actor, filename: event.payload.filename });
    case "attachment.deleted":
      return t("projectDetail.activity.attachmentDeleted", { actor, filename: event.payload.filename });
    case "page.created":
      return t("projectDetail.activity.pageCreated", { actor, title: event.payload.pageTitle });
    case "page.deleted":
      return t("projectDetail.activity.pageDeleted", { actor, title: event.payload.pageTitle });
  }
}
