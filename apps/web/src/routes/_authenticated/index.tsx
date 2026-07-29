import { createFileRoute } from "@tanstack/react-router";
import { useT } from "../../shared/i18n";

export const Route = createFileRoute("/_authenticated/")({
  component: IndexPage,
});

function IndexPage() {
  const t = useT();
  // Заглушка до вехи D: здесь `/` будет редиректить на последний открытый воркспейс (§6).
  return <p className="text-muted-foreground">{t("home.welcome")}</p>;
}
