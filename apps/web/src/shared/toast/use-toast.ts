import { useToastStore } from "./store";

export interface ToastApi {
  error: (message: string) => void;
  show: (message: string) => void;
}

// Императивный API поверх стора (симметрично useT: фичи резолвят текст сами, стор его не знает).
export function useToast(): ToastApi {
  const push = useToastStore((state) => state.push);
  return {
    error: (message: string) => push(message, "destructive"),
    show: (message: string) => push(message, "default"),
  };
}
