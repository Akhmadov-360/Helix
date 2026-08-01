import { useEffect } from "react";
import { Toast } from "@helix/ui";
import { useT } from "../i18n";
import { useToastStore, type ToastItem } from "./store";

const AUTO_DISMISS_MS = 5000;

// Единая точка рендера (персистентный слой — AppShell): фичи только push()-ят через useToast(),
// не рендерят собственную разметку тоста (§композиция, не дублирование).
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((toast) => (
        <ToastEntry key={toast.id} toast={toast} onDismiss={dismiss} />
      ))}
    </div>
  );
}

function ToastEntry({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const t = useT();

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <Toast variant={toast.variant}>
      <span>{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label={t("toast.dismiss")}
        className="shrink-0 opacity-70 hover:opacity-100"
      >
        ×
      </button>
    </Toast>
  );
}
