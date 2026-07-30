import type { Capability } from "@helix/api-schemas";
import { useMe } from "./session";

// §8.2 frontend-architecture.md: capability = «показывать ли кнопку», сервер — единственный
// энфорсер. Массив ~10-30 записей — .includes() без Set/memo (§9.7: оптимизация только после
// измеренного bottleneck, тут его нет).
export function useCan(capability: Capability): boolean {
  return useMe().capabilities.includes(capability);
}
