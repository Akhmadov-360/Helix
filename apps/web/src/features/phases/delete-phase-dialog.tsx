import { useState } from "react";
import type { PhaseResponse } from "@helix/api-schemas";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@helix/ui";
import { useLocalize } from "../../shared/lib/localize";
import { useT } from "../../shared/i18n";
import { useDeletePhase } from "./mutations";
import { phaseCandidatesFrom, toPhaseError } from "./phase-error";

export function DeletePhaseDialog({
  orgId,
  workspaceId,
  phase,
  open,
  onOpenChange,
}: {
  orgId: string;
  workspaceId: string;
  phase: PhaseResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const localize = useLocalize();
  const del = useDeletePhase(orgId, workspaceId);
  const [candidates, setCandidates] = useState<PhaseResponse[] | null>(null);
  const [reassignTo, setReassignTo] = useState("");

  function reset() {
    setCandidates(null);
    setReassignTo("");
  }

  function handleClose(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function handleConfirm() {
    if (!phase) return;
    del.mutate(
      { phaseId: phase.id, reassignTo: reassignTo || undefined },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
        onError: (error) => {
          if (toPhaseError(error) === "notEmpty") setCandidates(phaseCandidatesFrom(error));
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("phases.delete.title")}</DialogTitle>
          <DialogDescription>
            {phase ? t("phases.delete.description", { name: localize(phase.name) }) : null}
          </DialogDescription>
        </DialogHeader>

        {candidates && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-destructive">{t("phases.delete.notEmpty")}</p>
            {candidates.length > 0 ? (
              <Select value={reassignTo} onValueChange={setReassignTo}>
                <SelectTrigger>
                  <SelectValue placeholder={t("phases.delete.reassignPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {localize(candidate.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">{t("phases.delete.noCandidates")}</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => handleClose(false)} disabled={del.isPending}>
            {t("phases.form.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={del.isPending || (candidates !== null && !reassignTo)}
          >
            {del.isPending ? t("phases.delete.submitting") : t("phases.delete.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
