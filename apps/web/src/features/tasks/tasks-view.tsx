import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import { Button, Input } from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { orgMembersQueryOptions } from "../../shared/org/queries";
import { AssigneeField } from "./assignee-field";
import { DueDateField } from "./due-date-field";
import { useCompleteTask, useCreateTask, useDeleteTask, useReopenTask, useUpdateTask } from "./mutations";
import { projectTasksQueryOptions } from "./queries";
import { sortTasks } from "./select";
import { TaskRow } from "./task-row";

// Плоский список, open+done вперемешку по серверному порядку (§ redesign): раньше done уезжал в
// свёрнутый <details> — чек делал задачу «выполненной», но она молча исчезала из видимой зоны,
// что читалось как «не сохранилось» (не помогало, что персист на бэке был верным всегда).
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

  const { open, done } = sortTasks(tasks);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      { title: title.trim(), dueAt: dueAt ?? undefined, assigneeId: assigneeId ?? undefined },
      {
        onSuccess: () => {
          setTitle("");
          setDueAt(null);
          setAssigneeId(null);
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
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("tasks.quickAdd.placeholder")}
              className="pr-16"
            />
            <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
              <DueDateField value={dueAt} onChange={setDueAt} compact />
              <span className="h-4 w-px bg-border" />
              <AssigneeField value={assigneeId} onChange={setAssigneeId} members={members} compact />
            </div>
          </div>
          <Button type="submit" disabled={!title.trim() || create.isPending} className="shrink-0">
            {t("tasks.quickAdd.submit")}
          </Button>
        </form>
      )}

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
          <ListChecks className="h-8 w-8" />
          <p>{t("tasks.list.empty")}</p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {[...open, ...done].map((task) => (
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
            />
          ))}
        </ul>
      )}
    </div>
  );
}
