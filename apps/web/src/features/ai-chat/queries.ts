import { queryOptions } from "@tanstack/react-query";
import { aiMessageListResponseSchema, aiThreadListResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";

export function projectAiThreadsQueryOptions(orgId: string, projectId: string) {
  return queryOptions({
    queryKey: queryKeys.aiThreads(orgId, projectId),
    queryFn: () => request({ path: `/v1/projects/${projectId}/ai-threads`, schema: aiThreadListResponseSchema }),
  });
}

export function aiThreadMessagesQueryOptions(orgId: string, threadId: string) {
  return queryOptions({
    queryKey: queryKeys.aiThreadMessages(orgId, threadId),
    queryFn: () => request({ path: `/v1/ai-threads/${threadId}/messages`, schema: aiMessageListResponseSchema }),
  });
}
