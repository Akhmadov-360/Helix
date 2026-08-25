import { useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Archive,
  ArrowRightLeft,
  CheckCircle2,
  FilePlus2,
  FileX2,
  History,
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
import { Badge, Button, TableToolbar, cn } from "@helix/ui";
import { EmptyState } from "../../shared/components/empty-state";
import { useLocaleStore, useT, type TFunction } from "../../shared/i18n";
import { formatActivityTimestamp } from "../../shared/lib/format-relative";
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

// Категория по префиксу типа события — цветовая дифференциация узлов ленты (Figma-inspired),
// тот же приём, что AttachmentIcon для файлов. "unknown" — событие, которое клиент не распознал
// (projectEventSchema.safeParse не прошёл, см. select.ts) — не должно попадать под "прочее" молча.
type EventCategory = "project" | "task" | "attachment" | "page" | "unknown";

function eventCategory(type: string): EventCategory {
  if (type.startsWith("project.")) return "project";
  if (type.startsWith("task.")) return "task";
  if (type.startsWith("attachment.")) return "attachment";
  if (type.startsWith("page.")) return "page";
  return "unknown";
}

// Непрозрачная заливка + белая иконка (не /10-тинт) — узел ленты должен визуально перекрывать
// guide-линию, а не просвечивать её (design review со скриншотом Figma).
const CATEGORY_TONE: Record<EventCategory, string> = {
  project: "bg-blue-500 text-white",
  task: "bg-amber-500 text-white",
  attachment: "bg-rose-500 text-white",
  page: "bg-sky-500 text-white",
  unknown: "bg-muted-foreground text-background",
};

const CATEGORIES: Exclude<EventCategory, "unknown">[] = ["project", "task", "attachment", "page"];

// Вертикальная лента (redesign): guide-линия + узел-иконка по типу события + относительное время.
// Read-only авто-лог ActivityEvent (P4, decisions.md) — ручных заметок/звонков в домене нет,
// поэтому в отличие от Figma-populated нет composer'а и кнопок "Add Note"/"Log Email".
export function ActivityView({ orgId, projectId }: { orgId: string; projectId: string }) {
  const events = useSuspenseQuery(projectActivityQueryOptions(orgId, projectId)).data;
  const t = useT();
  const localize = useLocalize();
  const locale = useLocaleStore((state) => state.locale);
  const relativeFormatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  const [category, setCategory] = useState<"all" | EventCategory>("all");
  const [search, setSearch] = useState("");

  // Описание считаем один раз за рендер (не в filter/map по отдельности) — текст нужен и для
  // поиска, и для отображения строки.
  const allItems = useMemo(
    () =>
      toActivityItems(events).map((item) => ({
        item,
        category: item.known ? eventCategory(item.event.type) : ("unknown" as const),
        text: describe(item, t, localize),
      })),
    [events, t, localize],
  );

  const categoryCounts: Record<EventCategory, number> = { project: 0, task: 0, attachment: 0, page: 0, unknown: 0 };
  for (const { category: c } of allItems) categoryCounts[c] += 1;

  const searchQuery = search.trim().toLowerCase();
  const filtered = allItems.filter(
    (entry) =>
      (category === "all" || entry.category === category) &&
      (!searchQuery || entry.text.toLowerCase().includes(searchQuery)),
  );

  if (allItems.length === 0) {
    return (
      <EmptyState
        icon={History}
        title={t("projectDetail.activity.empty")}
        description={t("projectDetail.activity.emptyDescription")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <TableToolbar
        search={{ value: search, onChange: setSearch, placeholder: t("projectDetail.activity.searchPlaceholder") }}
      />
      <div className="flex flex-wrap gap-1">
        <Button type="button" size="sm" variant={category === "all" ? "secondary" : "ghost"} onClick={() => setCategory("all")}>
          {t("projectDetail.activity.filter.all")}
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            {allItems.length}
          </Badge>
        </Button>
        {CATEGORIES.filter((c) => categoryCounts[c] > 0).map((c) => (
          <Button
            key={c}
            type="button"
            size="sm"
            variant={category === c ? "secondary" : "ghost"}
            className="gap-1.5"
            onClick={() => setCategory(c)}
          >
            {t(`projectDetail.activity.filter.${c}`)}
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {categoryCounts[c]}
            </Badge>
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
          <History className="h-8 w-8" />
          <p>{t("projectDetail.activity.noResults")}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setCategory("all");
              setSearch("");
            }}
          >
            {t("projectDetail.activity.resetFilter")}
          </Button>
        </div>
      ) : (
        <ol className="relative ml-4 flex flex-col gap-6 border-l-2 border-border pl-6">
          {filtered.map(({ item, category, text }) => {
            const Icon = item.known ? (EVENT_ICONS[item.event.type] ?? PlusCircle) : PlusCircle;
            return (
              <li key={item.id} className="relative">
                {/* -left-[2.375rem] = -(pl-6 = 1.5rem) - половина ширины квадрата (h-7 w-7 = 1.75rem
                    → 0.875rem) — центрирует узел ровно на guide-линии (border-l-2 у <ol>), не "на
                    глаз" (design review: раньше линия проходила сбоку, не по центру). */}
                <span
                  className={cn(
                    "absolute -left-[2.375rem] flex h-7 w-7 items-center justify-center rounded-lg",
                    CATEGORY_TONE[category],
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm">{text}</p>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatActivityTimestamp(item.createdAt, relativeFormatter, dateFormatter)}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
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
