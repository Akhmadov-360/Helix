import { Skeleton } from "@helix/ui";

// defaultPendingComponent (router.tsx) — рендерится ВМЕСТО контента роута, пока не готов его
// JS-чанк (код сплитится по роутам) и/или loader-данные. Без него TanStack Router на этот
// промежуток не рисует ничего — пустой экран, который на переходе login→"/" и на первом заходе
// на вкладку выглядел как "зависло". Один общий скелет на все роуты, не под каждую страницу
// отдельно — экономит на реализме ради покрытия сразу всех переходов одним компонентом.
export function RoutePending() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-6 w-48" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-4 w-full max-w-sm" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
