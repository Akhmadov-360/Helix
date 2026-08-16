import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { aiMessageResponseSchema, aiThreadResponseSchema, type AiMessageResponse, type AiThreadResponse } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";
import { useT, type MessageKey } from "../../shared/i18n";
import { toAiChatError } from "./ai-chat-error";
import { aiThreadMessagesQueryOptions, projectAiThreadsQueryOptions } from "./queries";

function aiChatErrorKey(kind: ReturnType<typeof toAiChatError>): MessageKey {
  switch (kind) {
    case "permissionDenied":
      return "aiChat.error.permissionDenied";
    case "notFound":
      return "aiChat.error.notFound";
    case "providerNotConfigured":
      return "aiChat.error.providerNotConfigured";
    case "providerNotImplemented":
      return "aiChat.error.providerNotImplemented";
    case "notPending":
      return "aiChat.error.notPending";
    default:
      return "aiChat.error.unexpected";
  }
}

export function useCreateAiThread(orgId: string, projectId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = projectAiThreadsQueryOptions(orgId, projectId);
  const t = useT();

  return useMutation({
    mutationFn: () =>
      request({ method: "POST", path: `/v1/projects/${projectId}/ai-threads`, schema: aiThreadResponseSchema }),
    onError: (error) => {
      const kind = toAiChatError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(aiChatErrorKey(kind)));
    },
    onSuccess: (thread) => {
      queryClient.setQueryData<AiThreadResponse[]>(queryKey, (current) => [thread, ...(current ?? [])]);
    },
  });
}

export function useDeleteAiThread(orgId: string, projectId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = projectAiThreadsQueryOptions(orgId, projectId);
  const t = useT();

  return useMutation({
    mutationFn: (vars: { threadId: string }) =>
      request({ method: "DELETE", path: `/v1/ai-threads/${vars.threadId}`, schema: z.null() }),
    onError: (error) => {
      const kind = toAiChatError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(aiChatErrorKey(kind)));
    },
    onSuccess: (_data, vars) => {
      queryClient.setQueryData<AiThreadResponse[]>(queryKey, (current) => current && current.filter((th) => th.id !== vars.threadId));
      queryClient.removeQueries({ queryKey: queryKeys.aiThreadMessages(orgId, vars.threadId) });
    },
  });
}

// §6/§13.4: confirm/reject перезаписывают ОДНО Message целиком (toolCalls-массив внутри) — кэш
// сообщений обновляется точечно по id, без полного invalidate/refetch (тред мог успеть вырасти
// новыми сообщениями за время, пока юзер думал над confirm).
function replaceMessageInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  threadId: string,
  updated: AiMessageResponse,
): void {
  queryClient.setQueryData<AiMessageResponse[]>(
    aiThreadMessagesQueryOptions(orgId, threadId).queryKey,
    (current) => current && current.map((m) => (m.id === updated.id ? updated : m)),
  );
}

export function useConfirmToolCall(orgId: string, threadId: string) {
  const queryClient = useQueryClient();
  const t = useT();

  return useMutation({
    mutationFn: (vars: { callId: string }) =>
      request({
        method: "POST",
        path: `/v1/ai-threads/${threadId}/tool-calls/${vars.callId}/confirm`,
        schema: aiMessageResponseSchema,
      }),
    onError: (error) => {
      const kind = toAiChatError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(aiChatErrorKey(kind)));
      // §13.4 — 403/409 меняют состояние самой карточки (PROPOSED остаётся или уходит в REJECTED
      // на бэке), тред мог измениться под нами — точнее перечитать сообщения, чем гадать локально.
      void queryClient.invalidateQueries({ queryKey: aiThreadMessagesQueryOptions(orgId, threadId).queryKey });
    },
    onSuccess: (message) => replaceMessageInCache(queryClient, orgId, threadId, message),
  });
}

export function useRejectToolCall(orgId: string, threadId: string) {
  const queryClient = useQueryClient();
  const t = useT();

  return useMutation({
    mutationFn: (vars: { callId: string }) =>
      request({
        method: "POST",
        path: `/v1/ai-threads/${threadId}/tool-calls/${vars.callId}/reject`,
        schema: aiMessageResponseSchema,
      }),
    onError: (error) => {
      const kind = toAiChatError(error);
      toast.error(t(aiChatErrorKey(kind)));
      void queryClient.invalidateQueries({ queryKey: aiThreadMessagesQueryOptions(orgId, threadId).queryKey });
    },
    onSuccess: (message) => replaceMessageInCache(queryClient, orgId, threadId, message),
  });
}
