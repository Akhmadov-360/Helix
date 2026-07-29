// Access-токен живёт в памяти JS, не в localStorage (auth.md §4): при XSS утечёт максимум
// 15-мин токен и не персистится на диск. Владелец жизненного цикла — auth-слой (вехи B/H);
// здесь только хранилище + single-flight refresh будет читать/писать сюда же (§8.1, веха B3).
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
