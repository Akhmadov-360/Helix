import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { orgMembersQueryOptions } from "../../shared/org/queries";
import { useCompleteTask, useCreateTask, useDeleteTask, useReopenTask } from "./mutations";
import { projectTasksQueryOptions } from "./queries";
import { sortTasks } from "./select";
import { TaskRow } from "./task-row";

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
  const [expanded, setExpanded] = useState(false);
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
          setExpanded(false);
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {canCreate && (
        <form onSubmit={handleCreate} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("tasks.quickAdd.placeholder")}
            />
            <Button type="submit" size="sm" disabled={!title.trim() || create.isPending}>
              {t("tasks.quickAdd.submit")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
              {t(expanded ? "tasks.quickAdd.less" : "tasks.quickAdd.more")}
            </Button>
          </div>
          {expanded && (
            <div className="flex gap-2">
              <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="w-auto" />
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger className="w-auto">
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
            </div>
          )}
        </form>
      )}

      {tasks.length === 0 ? (
        <p className="text-muted-foreground">{t("tasks.list.empty")}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-1">
            {open.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                assigneeName={task.assigneeId ? membersById.get(task.assigneeId) : undefined}
                canUpdate={canUpdate}
                canDelete={canDelete}
                onToggle={() => complete.mutate({ taskId: task.id })}
                onDelete={() => del.mutate({ taskId: task.id })}
              />
            ))}
          </ul>
          {done.length > 0 && (
            <details className="flex flex-col gap-1">
              <summary className="cursor-pointer text-sm text-muted-foreground">
                {t("tasks.list.doneSection", { count: done.length })}
              </summary>
              <ul className="mt-2 flex flex-col gap-1">
                {done.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    assigneeName={task.assigneeId ? membersById.get(task.assigneeId) : undefined}
                    canUpdate={canUpdate}
                    canDelete={canDelete}
                    onToggle={() => reopen.mutate({ taskId: task.id })}
                    onDelete={() => del.mutate({ taskId: task.id })}
                  />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
