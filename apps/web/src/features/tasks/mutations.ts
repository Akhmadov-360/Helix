import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { CreateTaskInput, TaskResponse, UpdateTaskInput } from "@helix/api-schemas";
import { taskResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";
import { useT, type MessageKey } from "../../shared/i18n";
import { useToast } from "../../shared/toast/use-toast";
import { projectTasksQueryOptions } from "./queries";
import { toTaskError } from "./task-error";

function taskErrorKey(kind: ReturnType<typeof toTaskError>): MessageKey {
  switch (kind) {
    case "permissionDenied":
      return "tasks.error.permissionDenied";
    case "notFound":
      return "tasks.error.notFound";
    default:
      return "tasks.error.unexpected";
  }
}

// overdue — вычисляемое, а не хранимое (tasks.md §4): done=true → всегда false; иначе dueAt < now.
// Тот же вывод, что сделает сервер — безопасно предугадывать оптимистично.
export function computeOverdue(dueAt: string | null, done: boolean): boolean {
  if (done || dueAt === null) return false;
  return new Date(dueAt).getTime() < Date.now();
}

// Создание не патчит кэш оптимистично (id только у сервера) — просто добавляется в onSuccess;
// задержка одного POST для чеклиста некритична. task.created пишет событие (tasks.md §5) →
// инвалидируем ленту, чтобы Activity-таб (veha G) подхватил его без ручного рефреша.
export function useCreateTask(orgId: string, projectId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = projectTasksQueryOptions(orgId, projectId);
  const t = useT();
  const toast = useToast();

  return useMutation({
    mutationFn: (input: CreateTaskInput) =>
      request({
        method: "POST",
        path: `/v1/projects/${projectId}/tasks`,
        body: input,
        schema: taskResponseSchema,
      }),
    onError: (error) => {
      const kind = toTaskError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(taskErrorKey(kind)));
    },
    onSuccess: (task) => {
      queryClient.setQueryData<TaskResponse[]>(queryKey, (current) => [...(current ?? []), task]);
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectActivity(orgId, projectId) });
    },
  });
}

export function useUpdateTask(orgId: string, projectId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = projectTasksQueryOptions(orgId, projectId);
  const t = useT();
  const toast = useToast();

  return useMutation({
    mutationFn: (vars: { taskId: string; input: UpdateTaskInput }) =>
      request({
        method: "PATCH",
        path: `/v1/tasks/${vars.taskId}`,
        body: vars.input,
        schema: taskResponseSchema,
      }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<TaskResponse[]>(queryKey);
      const { title, assigneeId, dueAt } = vars.input;
      queryClient.setQueryData<TaskResponse[]>(
        queryKey,
        (current) =>
          current &&
          current.map((task) => {
            if (task.id !== vars.taskId) return task;
            const nextDueAt = dueAt === undefined ? task.dueAt : dueAt === null ? null : dueAt.toISOString();
            return {
              ...task,
              ...(title !== undefined && { title }),
              ...(assigneeId !== undefined && { assigneeId }),
              dueAt: nextDueAt,
              overdue: computeOverdue(nextDueAt, task.done),
            };
          }),
      );
      return { snapshot };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(queryKey, ctx.snapshot);
      const kind = toTaskError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(taskErrorKey(kind)));
    },
    onSuccess: (task) => {
      queryClient.setQueryData<TaskResponse[]>(
        queryKey,
        (current) => current && current.map((t2) => (t2.id === task.id ? task : t2)),
      );
    },
  });
}

// complete/reopen — отдельные action, НЕ PATCH {done} (tasks.md §2): побочный эффект в ленте.
export function useCompleteTask(orgId: string, projectId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = projectTasksQueryOptions(orgId, projectId);
  const t = useT();
  const toast = useToast();

  return useMutation({
    mutationFn: (vars: { taskId: string }) =>
      request({ method: "POST", path: `/v1/tasks/${vars.taskId}/complete`, schema: taskResponseSchema }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<TaskResponse[]>(queryKey);
      queryClient.setQueryData<TaskResponse[]>(
        queryKey,
        (current) =>
          current &&
          current.map((task) => (task.id === vars.taskId ? { ...task, done: true, overdue: false } : task)),
      );
      return { snapshot };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(queryKey, ctx.snapshot);
      const kind = toTaskError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(taskErrorKey(kind)));
    },
    onSuccess: (task) => {
      queryClient.setQueryData<TaskResponse[]>(
        queryKey,
        (current) => current && current.map((t2) => (t2.id === task.id ? task : t2)),
      );
      // task.completed пишет событие (tasks.md §5) — та же логика, что useCreateTask.
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectActivity(orgId, projectId) });
    },
  });
}

export function useReopenTask(orgId: string, projectId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = projectTasksQueryOptions(orgId, projectId);
  const t = useT();
  const toast = useToast();

  return useMutation({
    mutationFn: (vars: { taskId: string }) =>
      request({ method: "POST", path: `/v1/tasks/${vars.taskId}/reopen`, schema: taskResponseSchema }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<TaskResponse[]>(queryKey);
      queryClient.setQueryData<TaskResponse[]>(
        queryKey,
        (current) =>
          current &&
          current.map((task) =>
            task.id === vars.taskId
              ? { ...task, done: false, overdue: computeOverdue(task.dueAt, false) }
              : task,
          ),
      );
      return { snapshot };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(queryKey, ctx.snapshot);
      const kind = toTaskError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(taskErrorKey(kind)));
    },
    onSuccess: (task) => {
      queryClient.setQueryData<TaskResponse[]>(
        queryKey,
        (current) => current && current.map((t2) => (t2.id === task.id ? task : t2)),
      );
    },
  });
}

export function useDeleteTask(orgId: string, projectId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = projectTasksQueryOptions(orgId, projectId);
  const t = useT();
  const toast = useToast();

  return useMutation({
    mutationFn: (vars: { taskId: string }) =>
      request({ method: "DELETE", path: `/v1/tasks/${vars.taskId}`, schema: z.null() }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<TaskResponse[]>(queryKey);
      queryClient.setQueryData<TaskResponse[]>(
        queryKey,
        (current) => current && current.filter((task) => task.id !== vars.taskId),
      );
      return { snapshot };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(queryKey, ctx.snapshot);
      const kind = toTaskError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(taskErrorKey(kind)));
    },
  });
}
