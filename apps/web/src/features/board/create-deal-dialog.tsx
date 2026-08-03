import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import type { CompanyResponse } from "@helix/api-schemas";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@helix/ui";
import { useT } from "../../shared/i18n";
import { useMe } from "../../shared/auth/session";
import { orgMembersQueryOptions } from "../../shared/org/queries";
import { CustomFieldsSection } from "../fields/custom-fields-section";
import { ManageFieldsHint } from "../fields/manage-fields-hint";
import { fieldsQueryOptions } from "../fields/queries";
import { missingFieldKeysFrom, toBoardError } from "./board-error";
import { CURRENCIES } from "./currencies";
import { useCreateProject } from "./mutations";

const NO_COMPANY = "__none__";

export function CreateDealDialog({
  orgId,
  workspaceId,
  companies,
  open,
  onOpenChange,
}: {
  orgId: string;
  workspaceId: string;
  companies: CompanyResponse[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const me = useMe();
  const create = useCreateProject(orgId, workspaceId);
  const { data: fieldDefinitions = [] } = useQuery(fieldsQueryOptions(orgId, workspaceId));
  const { data: members = [] } = useQuery(orgMembersQueryOptions(orgId));
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [source, setSource] = useState("");
  const [companyId, setCompanyId] = useState(NO_COMPANY);
  // Дефолт — сам создатель (decisions.md ADR "ownerId дефолтится создателем"): без владельца
  // «уведомить владельца о новом лиде» выродилось бы в «уведомить почти никого». Явный пикер,
  // а не тихий бэкенд-фолбэк — так владелец виден и его сразу можно поменять, не уходя в reassign.
  const [ownerId, setOwnerId] = useState(me.id);
  const [fields, setFields] = useState<Record<string, unknown>>({});

  function reset() {
    setTitle("");
    setValue("");
    setCurrency("USD");
    setSource("");
    setCompanyId(NO_COMPANY);
    setOwnerId(me.id);
    setFields({});
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const parsedValue = value.trim() ? Number(value) : undefined;
    create.mutate(
      {
        title: title.trim(),
        value: parsedValue,
        currency: parsedValue !== undefined ? currency.trim().toUpperCase() : undefined,
        source: source.trim() || undefined,
        companyId: companyId === NO_COMPANY ? undefined : companyId,
        ownerId,
        fields: fieldDefinitions.length > 0 ? fields : undefined,
      },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
      },
    );
  }

  const missingKeys = create.error && toBoardError(create.error) === "missingRequiredFields"
    ? new Set(missingFieldKeysFrom(create.error))
    : undefined;

  // Свёрнуто по умолчанию всегда (не раздуваем форму опциональными полями) — но обязано
  // раскрыться само при MISSING_REQUIRED_FIELDS, иначе ошибка на required-поле осталась бы
  // невидимой под свёрнутой секцией. manualOpen — юзер уже разворачивал/сворачивал сам, его
  // выбор перекрывает дефолт.
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const customFieldsOpen = manualOpen ?? missingKeys !== undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("board.create.title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deal-title" required>{t("board.create.name")}</Label>
            <Input
              id="deal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={create.isPending}
              autoFocus
              required
            />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="deal-value">{t("board.create.value")}</Label>
              <Input
                id="deal-value"
                type="number"
                min="0"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={create.isPending}
              />
            </div>
            <div className="flex w-28 flex-col gap-1.5">
              <Label htmlFor="deal-currency">{t("board.create.currency")}</Label>
              <Select value={currency} onValueChange={setCurrency} disabled={create.isPending || !value.trim()}>
                <SelectTrigger id="deal-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deal-source">{t("board.create.source")}</Label>
            <Input
              id="deal-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              disabled={create.isPending}
            />
            <p className="text-xs text-muted-foreground">{t("board.create.sourceHint")}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deal-company">{t("board.create.company")}</Label>
            <Select value={companyId} onValueChange={setCompanyId} disabled={create.isPending}>
              <SelectTrigger id="deal-company">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_COMPANY}>{t("contacts.form.companyNone")}</SelectItem>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deal-owner">{t("board.create.owner")}</Label>
            <Select value={ownerId} onValueChange={setOwnerId} disabled={create.isPending}>
              <SelectTrigger id="deal-owner">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {members.map((member) => (
                  <SelectItem key={member.userId} value={member.userId}>
                    {member.userId === me.id ? t("board.create.ownerMe", { name: member.name }) : member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {fieldDefinitions.length > 0 ? (
            <Collapsible open={customFieldsOpen} onOpenChange={setManualOpen}>
              <CollapsibleTrigger className="group flex w-full items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-data-[state=open]:rotate-90" />
                {t("fields.section.trigger", { count: fieldDefinitions.length })}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CustomFieldsSection
                  orgId={orgId}
                  definitions={fieldDefinitions}
                  values={fields}
                  onChange={(key, v) => setFields((prev) => ({ ...prev, [key]: v }))}
                  disabled={create.isPending}
                  errorKeys={missingKeys}
                  className="pt-3"
                />
                <div className="pt-2">
                  <ManageFieldsHint workspaceId={workspaceId} />
                </div>
              </CollapsibleContent>
            </Collapsible>
          ) : (
            <ManageFieldsHint workspaceId={workspaceId} />
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={create.isPending}>
              {t("board.create.cancel")}
            </Button>
            <Button type="submit" disabled={create.isPending || !title.trim()}>
              {create.isPending ? t("board.create.submitting") : t("board.create.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
