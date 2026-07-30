import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { taskResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";

const taskListSchema = z.array(taskResponseSchema);

export function projectTasksQueryOptions(orgId: string, projectId: string) {
  return queryOptions({
    queryKey: queryKeys.projectTasks(orgId, projectId),
    queryFn: () => request({ path: `/v1/projects/${projectId}/tasks`, schema: taskListSchema }),
  });
}
