const KEY = "helix.lastWorkspaceId";

// localStorage-хинт для "/" (§5 карты URL) — НЕ доверенный источник (P0-FE): только ускоряет
// редирект, решение всё равно проверяется сервером (board 404 при чужом/несуществующем id).
export function getLastWorkspaceId(): string | null {
  return localStorage.getItem(KEY);
}

export function setLastWorkspaceId(id: string): void {
  localStorage.setItem(KEY, id);
}
