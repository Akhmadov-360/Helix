import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Button, Card } from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { orgMembersQueryOptions } from "../../shared/org/queries";
import { useAssignMember, useUnassignMember } from "./mutations";
import { projectAssigneesQueryOptions } from "./queries";

// Co-workers сделки. Manager+ управляет (project-links.md §2); нет отдельного `<Select>` в
// packages/ui ещё — нативный select, первый реальный потребитель, промотать в примитив, когда
// появится второй (тот же принцип, что ProjectTabs про третий таб).
export function AssigneesSection({ orgId, projectId }: { orgId: string; projectId: string }) {
  const t = useT();
  const assignees = useSuspenseQuery(projectAssigneesQueryOptions(orgId, projectId)).data;
  const members = useSuspenseQuery(orgMembersQueryOptions(orgId)).data;
  const assign = useAssignMember(orgId, projectId);
  const unassign = useUnassignMember(orgId, projectId);
  const canAssign = useCan("ProjectAssignee.create");
  const canUnassign = useCan("ProjectAssignee.delete");
  const [selected, setSelected] = useState("");

  const assignedIds = new Set(assignees.map((a) => a.userId));
  const candidates = members.filter((m) => !assignedIds.has(m.userId));

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{t("contacts.assignees.title")}</h2>
      {assignees.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("contacts.assignees.empty")}</p>
      )}
      <ul className="flex flex-col gap-1">
        {assignees.map((assignee) => (
          <li key={assignee.userId}>
            <Card className="flex items-center justify-between p-2">
              <span className="text-sm">{assignee.name}</span>
              {canUnassign && (
                <Button variant="ghost" size="sm" onClick={() => unassign.mutate({ userId: assignee.userId })}>
                  {t("contacts.assignees.remove")}
                </Button>
              )}
            </Card>
          </li>
        ))}
      </ul>
      {canAssign && candidates.length > 0 && (
        <div className="flex gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{t("contacts.assignees.picker.placeholder")}</option>
            {candidates.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!selected}
            onClick={() => {
              const member = candidates.find((m) => m.userId === selected);
              if (!member) return;
              assign.mutate({
                userId: member.userId,
                optimistic: { userId: member.userId, name: member.name, email: member.email },
              });
              setSelected("");
            }}
          >
            {t("contacts.assignees.add")}
          </Button>
        </div>
      )}
    </div>
  );
}
