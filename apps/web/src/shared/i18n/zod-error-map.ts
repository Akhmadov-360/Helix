import { z } from "zod";
import { t } from "./use-t";

type ZodConfig = NonNullable<Parameters<typeof z.config>[0]>;
type ZodErrorMap = NonNullable<ZodConfig["customError"]>;

// Локализуем частые исходы валидации; незамапленное → undefined (дефолт zod). Читает t() на момент
// проверки → сообщения следуют текущей локали. Ставится глобально (installI18n) один раз на старте.
const zodErrorMap: ZodErrorMap = (issue) => {
  switch (issue.code) {
    case "invalid_format":
      if ("format" in issue && issue.format === "email") return t("validation.email");
      return undefined;
    case "too_small":
      if ("origin" in issue && issue.origin === "string") {
        const min = "minimum" in issue ? Number(issue.minimum) : 0;
        return min <= 1 ? t("validation.required") : t("validation.tooShort", { min });
      }
      return undefined;
    case "too_big":
      if ("origin" in issue && issue.origin === "string" && "maximum" in issue) {
        return t("validation.tooLong", { max: Number(issue.maximum) });
      }
      return undefined;
    default:
      return undefined;
  }
};

export function installI18n(): void {
  z.config({ customError: zodErrorMap });
}
