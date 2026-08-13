// Модульная функция, не инлайн в компоненте — react-compiler запрещает мутировать `window.location`
// внутри рендер-функции (immutability-правило), а обычная навигация — единственный способ
// заставить браузер уважать Content-Disposition: attachment без ручного fetch+blob (см. S3Service).
// Общая для Files-таба и attachment-embed в Pages (pages-kb.md §6) — оба скачивают presigned URL
// через одну и ту же навигацию.
export function navigateToDownload(url: string): void {
  window.location.href = url;
}
