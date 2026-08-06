import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { BlueprintResponse, CreateBlueprintFromWorkspaceInput } from "@helix/api-schemas";
import { blueprintResponseSchema } from "@helix/api-schemas";
import { request } from "../../shared/api";
import { useT, type MessageKey } from "../../shared/i18n";
import { useToast } from "../../shared/toast/use-toast";
import { toBlueprintError } from "./blueprint-error";

function blueprintErrorKey(kind: ReturnType<typeof toBlueprintError>): MessageKey {
  switch (kind) {
    case "permissionDenied":
      return "blueprints.error.permissionDenied";
    case "notFound":
      return "blueprints.error.notFound";
    default:
      return "blueprints.error.unexpected";
  }
}

// FR-BP-4: снапшот текущего воркспейса в новый org-private блюпринт. Инвалидируем ВЕСЬ префикс
// blueprints (не один audience-срез) — тот же приём, что invalidateContactsList: конкретный
// audience-фильтр вызывающему компоненту неизвестен здесь.
export function useCreateBlueprintFromWorkspace(orgId: string) {
  const queryClient = useQueryClient();
  const t = useT();
  const toast = useToast();

  return useMutation({
    mutationFn: (input: CreateBlueprintFromWorkspaceInput) =>
      request({ method: "POST", path: "/v1/blueprints", body: input, schema: blueprintResponseSchema }),
    onError: (error) => {
      const kind = toBlueprintError(error);
      toast.error(t(blueprintErrorKey(kind)));
    },
    onSuccess: (blueprint) => {
      void queryClient.invalidateQueries({ queryKey: ["org", orgId, "blueprints"] });
      toast.show(t("blueprints.save.success", { name: blueprint.name }));
    },
  });
}

export function useDeleteBlueprint(orgId: string) {
  const queryClient = useQueryClient();
  const t = useT();
  const toast = useToast();

  return useMutation({
    mutationFn: (vars: { id: string }) =>
      request({ method: "DELETE", path: `/v1/blueprints/${vars.id}`, schema: z.null() }),
    onError: (error) => {
      const kind = toBlueprintError(error);
      toast.error(t(blueprintErrorKey(kind)));
    },
    onSuccess: (_data, vars) => {
      queryClient.setQueriesData<BlueprintResponse[]>(
        { queryKey: ["org", orgId, "blueprints"] },
        (current) => current?.filter((b) => b.id !== vars.id),
      );
      toast.show(t("blueprints.delete.success"));
    },
  });
}
