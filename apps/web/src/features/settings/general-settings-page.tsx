import { useRef, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CURRENCY_CODES, MAX_LOGO_FILE_BYTES, TIME_ZONES, type OrganizationSettings } from "@helix/api-schemas";
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { useUpdateOrgSettings } from "./mutations";
import { orgSettingsQueryOptions } from "./queries";

const LOGO_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";

// FR-ORG-3: одна форма на все 4 группы полей (currency/timezone/branding/aiProvider) — settings
// читается/пишется целиком с бэка (партиальный merge там же), отдельных под-форм с независимым
// сохранением не заводим ради 6 полей.
export function GeneralSettingsPage({ orgId }: { orgId: string }) {
  const t = useT();
  const settings = useSuspenseQuery(orgSettingsQueryOptions(orgId)).data;
  const canUpdate = useCan("Organization.update");
  const update = useUpdateOrgSettings(orgId);

  const [form, setForm] = useState<OrganizationSettings>(settings.settings);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof OrganizationSettings>(key: K, value: OrganizationSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Заглушка до Files/M3 (packages/config/src/env.schema.ts помечает S3 как M3) — конвертируем
  // в data-URI на клиенте вместо реальной загрузки в S3/MinIO. Лимит размера — MAX_LOGO_FILE_BYTES,
  // единственный источник (api-schemas), чтобы клиентская проверка не разъехалась с серверной.
  function handleLogoFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_LOGO_FILE_BYTES) {
      toast.error(t("settings.general.logo.tooLarge", { maxKb: Math.floor(MAX_LOGO_FILE_BYTES / 1024) }));
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set("branding", { ...form.branding, logoUrl: reader.result as string });
    reader.readAsDataURL(file);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: OrganizationSettings = {
      currency: form.currency || undefined,
      timezone: form.timezone || undefined,
      branding: {
        logoUrl: form.branding?.logoUrl || undefined,
        primaryColor: form.branding?.primaryColor || undefined,
      },
      aiProvider: {
        provider: form.aiProvider?.provider?.trim() || undefined,
        region: form.aiProvider?.region?.trim() || undefined,
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
            <h2 className="text-sm font-medium text-foreground">{t("settings.general.section.regional")}</h2>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-currency">{t("settings.general.currency")}</Label>
              <Select value={form.currency ?? ""} onValueChange={(v) => set("currency", v)}>
                <SelectTrigger id="org-currency">
                  <SelectValue placeholder={t("settings.general.currency.placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_CODES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-timezone">{t("settings.general.timezone")}</Label>
              <Select value={form.timezone ?? ""} onValueChange={(v) => set("timezone", v)}>
                <SelectTrigger id="org-timezone">
                  <SelectValue placeholder={t("settings.general.timezone.placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  {TIME_ZONES.map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      {zone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-foreground">{t("settings.general.section.branding")}</h2>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-logo-file">{t("settings.general.logoUrl")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("settings.general.logo.hint", { maxKb: Math.floor(MAX_LOGO_FILE_BYTES / 1024) })}
              </p>
              <div className="flex items-center gap-3">
                {form.branding?.logoUrl && (
                  <img
                    src={form.branding.logoUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-md border border-border object-contain"
                  />
                )}
                <Input
                  id="org-logo-file"
                  ref={fileInputRef}
                  type="file"
                  accept={LOGO_ACCEPT}
                  onChange={(e) => handleLogoFile(e.target.files?.[0])}
                />
                {form.branding?.logoUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      set("branding", { ...form.branding, logoUrl: undefined });
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    {t("settings.general.logo.remove")}
                  </Button>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-primary-color">{t("settings.general.primaryColor")}</Label>
              <div className="flex items-center gap-2">
                <input
                  id="org-primary-color"
                  type="color"
                  className="h-10 w-14 cursor-pointer rounded-md border border-input bg-background p-1 disabled:cursor-not-allowed disabled:opacity-50"
                  value={form.branding?.primaryColor ?? "#000000"}
                  onChange={(e) => set("branding", { ...form.branding, primaryColor: e.target.value })}
                />
                <span className="text-sm text-muted-foreground">{form.branding?.primaryColor ?? "#000000"}</span>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-foreground">{t("settings.general.section.aiProvider")}</h2>
            <p className="text-xs text-muted-foreground">{t("settings.general.aiProvider.hint")}</p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-ai-provider">{t("settings.general.aiProvider.provider")}</Label>
              <Input
                id="org-ai-provider"
                value={form.aiProvider?.provider ?? ""}
                onChange={(e) => set("aiProvider", { ...form.aiProvider, provider: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-ai-region">{t("settings.general.aiProvider.region")}</Label>
              <Input
                id="org-ai-region"
                value={form.aiProvider?.region ?? ""}
                onChange={(e) => set("aiProvider", { ...form.aiProvider, region: e.target.value })}
              />
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
