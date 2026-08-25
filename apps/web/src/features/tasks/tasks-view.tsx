import { useMemo, useRef, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import type { TaskPriority } from "@helix/api-schemas";
import { Button, CountBadge, Input, cn } from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { orgMembersQueryOptions } from "../../shared/org/queries";
import { EmptyState } from "../../shared/components/empty-state";
import { AssigneeField } from "./assignee-field";
import { DueDateField } from "./due-date-field";
import { useCompleteTask, useCreateTask, useDeleteTask, useReopenTask, useUpdateTask } from "./mutations";
import { PriorityField } from "./priority-field";
import { projectTasksQueryOptions } from "./queries";
import { bucketizeTasks, type TaskBucketKey } from "./select";
import { TaskRow } from "./task-row";
import {
  initialTasksFilter,
  isTasksFilterActive,
  taskMatchesFilter,
  type TasksFilterState,
} from "./tasks-filter-state";
import { TasksFilterChips } from "./tasks-filters";

// Header-тон бакета — визуальная семантика срочности: overdue destructive, today amber, остальные
// нейтральные (в Figma this-week был blue-ish neutral — оставляем neutral, чтобы не мешать accent
// на CTA-кнопках). Done — muted (сделано, важность спала).
const BUCKET_TONE: Record<TaskBucketKey, string> = {
  overdue: "text-destructive",
  today: "text-amber-600 dark:text-amber-400",
  thisWeek: "text-foreground",
  later: "text-foreground",
  noDueDate: "text-muted-foreground",
  done: "text-muted-foreground",
};

// Overdue-бакет получает дополнительный визуальный сигнал — красный left-border на контейнере
// (Figma-приём); остальные — просто border/rounded.
const BUCKET_CONTAINER: Record<TaskBucketKey, string> = {
  overdue: "border-l-2 border-l-destructive",
  today: "",
  thisWeek: "",
  later: "",
  noDueDate: "",
  done: "opacity-70",
};

export function TasksView({ orgId, projectId }: { orgId: string; projectId: string }) {
  const t = useT();
  const tasks = useSuspenseQuery(projectTasksQueryOptions(orgId, projectId)).data;
  const members = useSuspenseQuery(orgMembersQueryOptions(orgId)).data;
  const create = useCreateTask(orgId, projectId);
  const update = useUpdateTask(orgId, projectId);
  const complete = useCompleteTask(orgId, projectId);
  const reopen = useReopenTask(orgId, projectId);
  const del = useDeleteTask(orgId, projectId);
  const canCreate = useCan("Task.create");
  const canUpdate = useCan("Task.update");
  const canDelete = useCan("Task.delete");

  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState<Date | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriority>("NONE");
  const [filters, setFilters] = useState<TasksFilterState>(initialTasksFilter);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Фильтр ПЕРЕД bucketize: бакеты не должны считать «this week (0)» когда фильтр всё отсёк.
  // Пустые бакеты не рендерятся — если фильтр оставил только 1 задачу сегодня, увидим только
  // «Today (1)», без Overdue/Later заголовков.
  const buckets = useMemo(() => {
    const filtered = isTasksFilterActive(filters)
      ? tasks.filter((task) => taskMatchesFilter(task, filters))
      : tasks;
    return bucketizeTasks(filtered);
  }, [tasks, filters]);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      {
        title: title.trim(),
        dueAt: dueAt ?? undefined,
        assigneeId: assigneeId ?? undefined,
        // NONE не отправляем: сервер применит DB-дефолт NONE, payload меньше и семантически чище.
        priority: priority === "NONE" ? undefined : priority,
      },
      {
        onSuccess: () => {
          setTitle("");
          setDueAt(null);
          setAssigneeId(null);
          setPriority("NONE");
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {canCreate && (
        <form onSubmit={handleCreate} className="flex max-w-3xl items-center gap-2">
          <div className="relative flex-1">
            <Input
              ref={titleInputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("tasks.quickAdd.placeholder")}
              className="pr-16"
            />
            <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
              <DueDateField value={dueAt} onChange={setDueAt} compact />
              <span className="h-4 w-px bg-border" />
              <PriorityField value={priority} onChange={setPriority} compact />
              <span className="h-4 w-px bg-border" />
              <AssigneeField value={assigneeId} onChange={setAssigneeId} members={members} compact />
            </div>
          </div>
          {title.trim().length > 0 && (
            <Button type="submit" disabled={create.isPending} className="shrink-0">
              {t("tasks.quickAdd.submit")}
            </Button>
          )}
        </form>
      )}

      {tasks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <TasksFilterChips state={filters} onChange={setFilters} members={members} />
        </div>
      )}

      {tasks.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={t("tasks.list.empty")}
          description={t("tasks.list.emptyDescription")}
          action={
            canCreate && (
              <Button type="button" size="sm" onClick={() => titleInputRef.current?.focus()}>
                {t("tasks.quickAdd.submit")}
              </Button>
            )
          }
        />
      ) : buckets.length === 0 ? (
        // Фильтр отсёк всё; показываем no-results с одной кнопкой «сбросить», а не пустоту с
        // непонятной причиной. Отделяем от общего empty-state (tasks.length===0) — там другой tone.
        <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
          <ListChecks className="h-8 w-8" />
          <p>{t("tasks.filter.noResults")}</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => setFilters(initialTasksFilter)}>
            {t("tasks.filter.clearAll")}
          </Button>
        </div>
      ) : (
        // Секции по due-date (Figma-inspired): Overdue / Today / This Week / Later / No date / Done.
        // Каждая — контейнер с header и divide-y между строками. Пустые бакеты не рендерятся —
        // если задач без даты нет, «Без срока» вообще не появляется, а не пустой заголовок.
        <div className="flex flex-col gap-4">
          {buckets.map((bucket) => (
            <section
              key={bucket.key}
              className={cn(
                "flex flex-col overflow-hidden rounded-xl border border-border bg-card",
                BUCKET_CONTAINER[bucket.key],
              )}
            >
              <header className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium">
                <span className={BUCKET_TONE[bucket.key]}>{t(`tasks.bucket.${bucket.key}`)}</span>
                <CountBadge value={bucket.tasks.length} />
              </header>
              <ul className="flex flex-col divide-y divide-border border-t border-border">
                {bucket.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    members={members}
                    canUpdate={canUpdate}
                    canDelete={canDelete}
                    onToggle={() => (task.done ? reopen.mutate({ taskId: task.id }) : complete.mutate({ taskId: task.id }))}
                    onDelete={() => del.mutate({ taskId: task.id })}
                    onRename={(nextTitle) => update.mutate({ taskId: task.id, input: { title: nextTitle } })}
                    onDueAtChange={(date) => update.mutate({ taskId: task.id, input: { dueAt: date } })}
                    onAssigneeChange={(userId) => update.mutate({ taskId: task.id, input: { assigneeId: userId } })}
                    onPriorityChange={(priority) => update.mutate({ taskId: task.id, input: { priority } })}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
