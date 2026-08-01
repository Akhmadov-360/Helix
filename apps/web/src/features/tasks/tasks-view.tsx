import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { orgMembersQueryOptions } from "../../shared/org/queries";
import { useCompleteTask, useCreateTask, useDeleteTask, useReopenTask } from "./mutations";
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
  const complete = useCompleteTask(orgId, projectId);
  const reopen = useReopenTask(orgId, projectId);
  const del = useDeleteTask(orgId, projectId);
  const canCreate = useCan("Task.create");
  const canUpdate = useCan("Task.update");
  const canDelete = useCan("Task.delete");

  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [assigneeId, setAssigneeId] = useState("");

  const { open, done } = sortTasks(tasks);
  const membersById = new Map(members.map((m) => [m.userId, m.name]));

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      {
        title: title.trim(),
        dueAt: dueAt ? new Date(dueAt) : undefined,
        assigneeId: assigneeId || undefined,
      },
      {
        onSuccess: () => {
          setTitle("");
          setDueAt("");
          setAssigneeId("");
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {canCreate && (
        <form onSubmit={handleCreate} className="flex max-w-2xl flex-col gap-2 sm:flex-row">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("tasks.quickAdd.placeholder")}
            className="flex-1"
          />
          <Input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="sm:w-40"
          />
          <Select value={assigneeId} onValueChange={setAssigneeId}>
            <SelectTrigger className="sm:w-44">
              <SelectValue placeholder={t("tasks.list.assignee.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {members.map((member) => (
                <SelectItem key={member.userId} value={member.userId}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        <ul className="flex flex-col gap-1">
          {[...open, ...done].map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              assigneeName={task.assigneeId ? membersById.get(task.assigneeId) : undefined}
              canUpdate={canUpdate}
              canDelete={canDelete}
              onToggle={() => (task.done ? reopen.mutate({ taskId: task.id }) : complete.mutate({ taskId: task.id }))}
              onDelete={() => del.mutate({ taskId: task.id })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
