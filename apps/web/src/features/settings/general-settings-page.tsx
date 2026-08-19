import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AI_CHAT_PROVIDERS,
  AI_EMBEDDING_PROVIDERS,
  type AiChatProviderName,
  type AiEmbeddingProviderName,
  type OrganizationSettings,
  type UpdateOrganizationSettingsInput,
} from "@helix/api-schemas";
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { useUpdateOrgSettings } from "./mutations";
import { orgSettingsQueryOptions } from "./queries";

// Валюта/часовой пояс/брендинг/AI-регион — заведены в FR-ORG-3 как склад настроек (settings JSON),
// но пока ни один фичи-потребитель их не читает: create-deal-dialog хардкодит USD, форматирование
// дат везде идёт по таймзоне браузера (Intl.DateTimeFormat(locale)), логотип/цвет нигде не
// рендерятся, а Bedrock-регион в проде берёт системный AWS_BEDROCK_REGION, не это поле формы.
// Убраны из UI по design review (manual QA, #settings) — заполнять форму, которая ничего не меняет,
// хуже, чем не показывать её вовсе; вернутся, когда появится реальный потребитель каждого поля.
export function GeneralSettingsPage({ orgId }: { orgId: string }) {
  const t = useT();
  const settings = useSuspenseQuery(orgSettingsQueryOptions(orgId)).data;
  const canUpdate = useCan("Organization.update");
  const update = useUpdateOrgSettings(orgId);

  const [form, setForm] = useState<OrganizationSettings>(settings.settings);
  const [name, setName] = useState(settings.name);

  function set<K extends keyof OrganizationSettings>(key: K, value: OrganizationSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error(t("settings.general.name.required"));
      return;
    }
    const payload: UpdateOrganizationSettingsInput = {
      name: trimmedName,
      aiProvider: {
        provider: form.aiProvider?.provider || undefined,
        embeddingProvider: form.aiProvider?.embeddingProvider || undefined,
      },
    };
    update.mutate(payload);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t("settings.general.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("settings.general.subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-6">
        <fieldset disabled={!canUpdate || update.isPending} className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-foreground">{t("settings.general.section.identity")}</h2>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-name">{t("settings.general.name")}</Label>
              <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-foreground">{t("settings.general.section.aiProvider")}</h2>
            <p className="text-xs text-muted-foreground">{t("settings.general.aiProvider.hint")}</p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-ai-provider">{t("settings.general.aiProvider.provider")}</Label>
              <Select
                value={form.aiProvider?.provider ?? ""}
                onValueChange={(v) => set("aiProvider", { ...form.aiProvider, provider: v as AiChatProviderName })}
              >
                <SelectTrigger id="org-ai-provider">
                  <SelectValue placeholder={t("settings.general.aiProvider.provider.placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  {AI_CHAT_PROVIDERS.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {provider}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-ai-embedding-provider">{t("settings.general.aiProvider.embeddingProvider")}</Label>
              {/* Anthropic намеренно отсутствует в списке — у Anthropic нет embeddings endpoint
                  (ADR, decisions.md), embedding-провайдер выбирается независимо от chat-провайдера. */}
              <Select
                value={form.aiProvider?.embeddingProvider ?? ""}
                onValueChange={(v) =>
                  set("aiProvider", { ...form.aiProvider, embeddingProvider: v as AiEmbeddingProviderName })
                }
              >
                <SelectTrigger id="org-ai-embedding-provider">
                  <SelectValue placeholder={t("settings.general.aiProvider.embeddingProvider.placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  {AI_EMBEDDING_PROVIDERS.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {provider}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>
        </fieldset>

        {canUpdate && (
          <div>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? t("settings.general.saving") : t("settings.general.save")}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
