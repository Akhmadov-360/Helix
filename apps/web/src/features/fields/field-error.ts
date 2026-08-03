import { TransportError } from "../../shared/api";

// §6.4: shared/api знает только HTTP; домен интерпретирует code внутри статуса здесь, в feature.
export type FieldError = "incompatibleType" | "permissionDenied" | "notFound" | "unexpected";

export function toFieldError(error: unknown): FieldError {
  if (!(error instanceof TransportError)) return "unexpected";
  if (error.kind === "validation" && error.code === "INCOMPATIBLE_FIELD_TYPE_CHANGE") return "incompatibleType";
  if (error.kind === "forbidden") return "permissionDenied";
  if (error.kind === "notFound") return "notFound";
  return "unexpected";
}
