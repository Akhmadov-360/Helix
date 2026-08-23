// Централизованная фабрика (§6.3): закрытое множество ключей под контролем одного места — ручные
// массивы по проекту = рассинхрон = тихие промахи кэша (тот же принцип, что ActivityRecorder на бэке).
//
// KEY-1: для ОРГ-СКОУПНЫХ ресурсов activeOrgId — корень ключа (['org', orgId, ...]); такие ключи
// (workspaces/board/column) добавляются в своих вехах (D/E), не спекулятивно. `me` — сам источник
// orgId (identity), поэтому в его ключе orgId нет.
export const queryKeys = {
  me: () => ["me"] as const,
  // Публичный, не org-scoped (принимающий ещё не обязательно аутентифицирован) — как me()/myOrgs().
  invitePreview: (token: string) => ["invitePreview", token] as const,
  // Как me() — источник личности (список орг ЮЗЕРА, не одной орги), orgId в ключе нет.
  myOrgs: () => ["myOrgs"] as const,
  workspaces: (orgId: string) => ["org", orgId, "workspaces"] as const,
  board: (orgId: string, workspaceId: string, limitPerPhase: number) =>
    ["org", orgId, "workspace", workspaceId, "board", { limitPerPhase }] as const,
  workspace: (orgId: string, workspaceId: string) => ["org", orgId, "workspace", workspaceId] as const,
  fields: (orgId: string, workspaceId: string) => ["org", orgId, "workspace", workspaceId, "fields"] as const,
  project: (orgId: string, projectId: string) => ["org", orgId, "project", projectId] as const,
  projectActivity: (orgId: string, projectId: string) =>
    ["org", orgId, "project", projectId, "activity"] as const,
  projectContacts: (orgId: string, projectId: string) =>
    ["org", orgId, "project", projectId, "contacts"] as const,
  projectAssignees: (orgId: string, projectId: string) =>
    ["org", orgId, "project", projectId, "assignees"] as const,
  orgMembers: (orgId: string) => ["org", orgId, "members"] as const,
  // Расширенный ростер под Settings > Members. Отдельный подключ, но общий префикс с
  // orgMembers — invalidate по префиксу ["org", orgId, "members"] чистит оба варианта.
  orgMembersDetailed: (orgId: string) => ["org", orgId, "members", "detailed"] as const,
  orgInvites: (orgId: string) => ["org", orgId, "invites"] as const,
  orgSettings: (orgId: string) => ["org", orgId, "settings"] as const,
  // Typeahead-поиск (§13.1) — НЕ в loader (§4.2), короткоживущий, свой ключ под debounce-запрос.
  contactSearch: (orgId: string, q: string) => ["org", orgId, "contacts", "search", { q }] as const,
  projectTasks: (orgId: string, projectId: string) =>
    ["org", orgId, "project", projectId, "tasks"] as const,
  projectAttachments: (orgId: string, projectId: string) =>
    ["org", orgId, "project", projectId, "attachments"] as const,
  projectStorageUsage: (orgId: string, projectId: string) =>
    ["org", orgId, "project", projectId, "attachments", "storage-usage"] as const,
  projectPages: (orgId: string, projectId: string, q?: string) =>
    ["org", orgId, "project", projectId, "pages", { q }] as const,
  page: (orgId: string, pageId: string) => ["org", orgId, "page", pageId] as const,
  pageComments: (orgId: string, pageId: string) => ["org", orgId, "page", pageId, "comments"] as const,
  pageVersions: (orgId: string, pageId: string) => ["org", orgId, "page", pageId, "versions"] as const,
  kbArticles: (orgId: string, query: { workspaceId?: string; tag?: string; q?: string }) =>
    ["org", orgId, "kbArticles", query] as const,
  kbArticle: (orgId: string, articleId: string) => ["org", orgId, "kbArticle", articleId] as const,
  // Глобальная адресная книга (org-scoped, не workspace-scoped) — отдельная "list"-ветка от
  // contactSearch ("search"), чтобы инвалидация одного не путалась с другим, но оба под общим
  // ["org", orgId, "contacts"] — мутация контакта инвалидирует и то, и другое разом.
  contactsList: (orgId: string, query: { q?: string; companyId?: string; cursorId?: string; limit?: number }) =>
    ["org", orgId, "contacts", "list", query] as const,
  contact: (orgId: string, contactId: string) => ["org", orgId, "contact", contactId] as const,
  companiesList: (orgId: string, query: { q?: string; cursorId?: string; limit?: number }) =>
    ["org", orgId, "companies", "list", query] as const,
  company: (orgId: string, companyId: string) => ["org", orgId, "company", companyId] as const,
  blueprints: (orgId: string, query: { audience?: string }) => ["org", orgId, "blueprints", query] as const,
  auditLog: (orgId: string, query: { cursor?: string; limit?: number; action?: string }) =>
    ["org", orgId, "auditLog", query] as const,
  archivedProjects: (orgId: string, workspaceId: string) =>
    ["org", orgId, "workspace", workspaceId, "archivedProjects"] as const,
  aiThreads: (orgId: string, projectId: string) => ["org", orgId, "project", projectId, "aiThreads"] as const,
  aiThreadMessages: (orgId: string, threadId: string) => ["org", orgId, "aiThread", threadId, "messages"] as const,
};
