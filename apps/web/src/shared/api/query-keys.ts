// Централизованная фабрика (§6.3): закрытое множество ключей под контролем одного места — ручные
// массивы по проекту = рассинхрон = тихие промахи кэша (тот же принцип, что ActivityRecorder на бэке).
//
// KEY-1: для ОРГ-СКОУПНЫХ ресурсов activeOrgId — корень ключа (['org', orgId, ...]); такие ключи
// (workspaces/board/column) добавляются в своих вехах (D/E), не спекулятивно. `me` — сам источник
// orgId (identity), поэтому в его ключе orgId нет.
export const queryKeys = {
  me: () => ["me"] as const,
  workspaces: (orgId: string) => ["org", orgId, "workspaces"] as const,
  board: (orgId: string, workspaceId: string, limitPerPhase: number) =>
    ["org", orgId, "workspace", workspaceId, "board", { limitPerPhase }] as const,
  workspace: (orgId: string, workspaceId: string) => ["org", orgId, "workspace", workspaceId] as const,
  project: (orgId: string, projectId: string) => ["org", orgId, "project", projectId] as const,
  projectActivity: (orgId: string, projectId: string) =>
    ["org", orgId, "project", projectId, "activity"] as const,
};
