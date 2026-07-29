import { create } from "zustand";

export interface ToastItem {
  id: string;
  message: string;
  variant: "default" | "destructive";
}

interface ToastState {
  toasts: ToastItem[];
  push: (message: string, variant?: ToastItem["variant"]) => void;
  dismiss: (id: string) => void;
}

// Эфемерное UI-состояние (не персистится, не server-state) — Zustand, как локаль (i18n/store.ts).
export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (message, variant = "default") =>
    set((state) => ({ toasts: [...state.toasts, { id: crypto.randomUUID(), message, variant }] })),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));
