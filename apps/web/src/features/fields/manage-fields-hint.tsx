import { Link } from "@tanstack/react-router";
import { SlidersHorizontal } from "lucide-react";
import { useT } from "../../shared/i18n";

// Ненавязчивая ссылка на страницу управления полями (не встроенный inline-конструктор — тот
// экран уже покрывает CRUD, дублировать форму создания поля прямо в диалоге лида не стоит).
export function ManageFieldsHint({ workspaceId }: { workspaceId: string }) {
  const t = useT();
  return (
    <Link
      to="/workspaces/$workspaceId/fields"
      params={{ workspaceId }}
      className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <SlidersHorizontal className="h-3 w-3" />
      {t("fields.hint.manage")}
    </Link>
  );
}
