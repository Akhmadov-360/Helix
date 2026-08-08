import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, LayoutGrid, Sparkles } from "lucide-react";
import type { Audience, BlueprintResponse } from "@helix/api-schemas";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
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
import { blueprintsQueryOptions } from "../blueprints/queries";
import { BlueprintCard } from "../blueprints/blueprint-card";
import { useT } from "../../shared/i18n";
import { setLastWorkspaceId } from "../../shared/lib/last-workspace";
import { useCreateWorkspace } from "./mutations";

// blueprints.md §2 (PRD-flow): "Start with a blueprint?" → B2B/B2C → grid → general form.
// Мастер, не единый экран (design review) — ближе к описанию PRD и к самой спеке, где выбор
// audience и выбор блюпринта — два разных шага, не один совмещённый.
type Step = "choice" | "audience" | "grid" | "details";

function initialState() {
  return {
    step: "choice" as Step,
    mode: "blank" as "blank" | "blueprint",
    gridAudience: "B2B" as Audience,
    blankAudience: "B2B" as Audience,
    selected: null as BlueprintResponse | null,
    name: "",
  };
}

export function CreateWorkspaceDialog({
  orgId,
  open,
  onOpenChange,
}: {
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const create = useCreateWorkspace(orgId);
  const [state, setState] = useState(initialState);

  function reset() {
    setState(initialState());
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!state.name.trim()) return;
    const input =
      state.mode === "blueprint" && state.selected
        ? { name: state.name.trim(), blueprintId: state.selected.id }
        : { name: state.name.trim(), audience: state.blankAudience };

    create.mutate(input, {
      onSuccess: (workspace) => {
        handleOpenChange(false);
        setLastWorkspaceId(workspace.id);
        void navigate({ to: "/workspaces/$workspaceId/board", params: { workspaceId: workspace.id } });
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          {state.step !== "choice" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 w-fit gap-1 text-muted-foreground"
              onClick={() => setState((s) => ({ ...s, step: previousStep(s) }))}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {t("workspaces.create.back")}
            </Button>
          )}
          <DialogTitle>{stepTitle(t, state.step)}</DialogTitle>
          <DialogDescription>{stepDescription(t, state)}</DialogDescription>
        </DialogHeader>

        {state.step === "choice" && (
          <ChoiceStep
            onBlank={() => setState((s) => ({ ...s, mode: "blank", step: "details" }))}
            onBlueprint={() => setState((s) => ({ ...s, mode: "blueprint", step: "audience" }))}
          />
        )}

        {state.step === "audience" && (
          <AudienceStep
            onPick={(gridAudience) => setState((s) => ({ ...s, gridAudience, step: "grid" }))}
          />
        )}

        {state.step === "grid" && (
          <GridStep
            orgId={orgId}
            audience={state.gridAudience}
            onPick={(selected) =>
              setState((s) => ({ ...s, selected, name: selected.name, step: "details" }))
            }
          />
        )}

        {state.step === "details" && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {state.mode === "blueprint" && state.selected && (
              <SelectedBlueprintSummary
                blueprint={state.selected}
                onChange={() => setState((s) => ({ ...s, step: "grid" }))}
              />
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="workspace-name" required>{t("workspaces.create.name")}</Label>
              <Input
                id="workspace-name"
                value={state.name}
                onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
                disabled={create.isPending}
                autoFocus
                required
              />
            </div>
            {state.mode === "blank" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="workspace-audience">{t("workspaces.create.audience")}</Label>
                <BlankAudiencePicker
                  value={state.blankAudience}
                  onChange={(blankAudience) => setState((s) => ({ ...s, blankAudience }))}
                  disabled={create.isPending}
                />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} disabled={create.isPending}>
                {t("workspaces.create.cancel")}
              </Button>
              <Button type="submit" disabled={create.isPending || !state.name.trim()}>
                {create.isPending ? t("workspaces.create.submitting") : t("workspaces.create.submit")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function previousStep(s: ReturnType<typeof initialState>): Step {
  if (s.step === "audience") return "choice";
  if (s.step === "grid") return "audience";
  // details: blank-путь пришёл из choice, blueprint-путь — из grid.
  return s.mode === "blueprint" ? "grid" : "choice";
}

function stepTitle(t: ReturnType<typeof useT>, step: Step): string {
  switch (step) {
    case "choice":
      return t("workspaces.create.title");
    case "audience":
      return t("workspaces.create.step.audience.title");
    case "grid":
      return t("workspaces.create.step.grid.title");
    case "details":
      return t("workspaces.create.title");
  }
}

function stepDescription(t: ReturnType<typeof useT>, state: ReturnType<typeof initialState>): string {
  switch (state.step) {
    case "choice":
      return t("workspaces.create.step.choice.description");
    case "audience":
      return t("workspaces.create.step.audience.description");
    case "grid":
      return t("workspaces.create.step.grid.description");
    case "details":
      // Дефолтные фазы — только на blank-пути; из блюпринта фазы уже скопированы (см. GridStep).
      return state.mode === "blueprint" ? t("workspaces.create.step.grid.description") : t("workspaces.create.description");
  }
}

function ChoiceStep({ onBlank, onBlueprint }: { onBlank: () => void; onBlueprint: () => void }) {
  const t = useT();
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <button
        type="button"
        onClick={onBlueprint}
        className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-accent/60"
      >
        <Sparkles className="h-5 w-5 text-accent" />
        <span className="font-medium text-foreground">{t("workspaces.create.step.choice.blueprint")}</span>
        <span className="text-xs text-muted-foreground">{t("workspaces.create.step.choice.blueprintHint")}</span>
      </button>
      <button
        type="button"
        onClick={onBlank}
        className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-foreground/30"
      >
        <LayoutGrid className="h-5 w-5 text-muted-foreground" />
        <span className="font-medium text-foreground">{t("workspaces.create.step.choice.blank")}</span>
        <span className="text-xs text-muted-foreground">{t("workspaces.create.step.choice.blankHint")}</span>
      </button>
    </div>
  );
}

function AudienceStep({ onPick }: { onPick: (audience: Audience) => void }) {
  const t = useT();
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {(["B2B", "B2C"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onPick(option)}
          className="flex flex-col items-start gap-1 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-accent/60"
        >
          <span className="font-medium text-foreground">{t(`workspaces.create.audience.${option}`)}</span>
          <span className="text-xs text-muted-foreground">{t(`workspaces.create.step.audience.${option}Hint`)}</span>
        </button>
      ))}
    </div>
  );
}

function GridStep({
  orgId,
  audience,
  onPick,
}: {
  orgId: string;
  audience: Audience;
  onPick: (blueprint: BlueprintResponse) => void;
}) {
  const t = useT();
  const { data, isPending } = useQuery(blueprintsQueryOptions(orgId, audience));

  if (isPending) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t("workspaces.create.step.grid.loading")}</p>;
  }
  if (!data || data.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t("workspaces.create.step.grid.empty")}</p>;
  }

  return (
    <div className="grid max-h-[420px] grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
      {data.map((blueprint) => (
        <BlueprintCard key={blueprint.id} blueprint={blueprint} onSelect={() => onPick(blueprint)} />
      ))}
    </div>
  );
}

function SelectedBlueprintSummary({ blueprint, onChange }: { blueprint: BlueprintResponse; onChange: () => void }) {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2 text-sm">
      <span className="text-secondary-foreground">{blueprint.name}</span>
      <Button type="button" variant="ghost" size="sm" onClick={onChange}>
        {t("workspaces.create.step.details.changeTemplate")}
      </Button>
    </div>
  );
}

const AUDIENCES: Audience[] = ["B2B", "B2C", "MIXED"];

function BlankAudiencePicker({
  value,
  onChange,
  disabled,
}: {
  value: Audience;
  onChange: (audience: Audience) => void;
  disabled: boolean;
}) {
  const t = useT();
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Audience)} disabled={disabled}>
      <SelectTrigger id="workspace-audience">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {AUDIENCES.map((option) => (
          <SelectItem key={option} value={option}>
            {t(`workspaces.create.audience.${option}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
