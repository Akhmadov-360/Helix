import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { CreateFieldDefinitionInput, FieldDefinitionResponse, UpdateFieldDefinitionInput } from "@helix/api-schemas";
import { fieldDefinitionResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";
import { useT, type MessageKey } from "../../shared/i18n";
import { useToast } from "../../shared/toast/use-toast";
import { fieldsQueryOptions } from "./queries";
import { toFieldError } from "./field-error";

function fieldErrorKey(kind: ReturnType<typeof toFieldError>): MessageKey {
  switch (kind) {
    case "incompatibleType":
      return "fields.error.incompatibleType";
    case "permissionDenied":
      return "fields.error.permissionDenied";
    case "notFound":
      return "fields.error.notFound";
    default:
      return "fields.error.unexpected";
  }
}

export function useCreateField(orgId: string, workspaceId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = fieldsQueryOptions(orgId, workspaceId);
  const t = useT();
  const toast = useToast();

  return useMutation({
    mutationFn: (input: CreateFieldDefinitionInput) =>
      request({
        method: "POST",
        path: `/v1/workspaces/${workspaceId}/fields`,
        body: input,
        schema: fieldDefinitionResponseSchema,
      }),
    onError: (error) => {
      const kind = toFieldError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(fieldErrorKey(kind)));
    },
    onSuccess: (field) => {
      queryClient.setQueryData<FieldDefinitionResponse[]>(queryKey, (current) => [...(current ?? []), field]);
      toast.show(t("fields.create.success"));
    },
  });
}

export function useUpdateField(orgId: string, workspaceId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = fieldsQueryOptions(orgId, workspaceId);
  const t = useT();
  const toast = useToast();

  return useMutation({
    mutationFn: (vars: { fieldId: string; input: UpdateFieldDefinitionInput }) =>
      request({
        method: "PATCH",
        path: `/v1/fields/${vars.fieldId}`,
        body: vars.input,
        schema: fieldDefinitionResponseSchema,
      }),
    // incompatibleType — развилка, которую показывает сама форма (§5), не тост-ошибка.
    onError: (error) => {
      const kind = toFieldError(error);
      if (kind === "incompatibleType") return;
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(fieldErrorKey(kind)));
    },
    onSuccess: (field) => {
      queryClient.setQueryData<FieldDefinitionResponse[]>(
        queryKey,
        (current) => current?.map((f) => (f.id === field.id ? field : f)),
      );
      toast.show(t("fields.edit.success"));
    },
  });
}

export function useDeleteField(orgId: string, workspaceId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = fieldsQueryOptions(orgId, workspaceId);
  const t = useT();
  const toast = useToast();

  return useMutation({
    mutationFn: (vars: { fieldId: string }) =>
      request({ method: "DELETE", path: `/v1/fields/${vars.fieldId}`, schema: z.null() }),
    onError: (error) => {
      const kind = toFieldError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(fieldErrorKey(kind)));
    },
    onSuccess: (_data, vars) => {
      queryClient.setQueryData<FieldDefinitionResponse[]>(
        queryKey,
        (current) => current?.filter((f) => f.id !== vars.fieldId),
      );
      toast.show(t("fields.delete.success"));
    },
  });
}
