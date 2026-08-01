import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Avatar, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { orgMembersQueryOptions } from "../../shared/org/queries";
import { useAssignMember, useUnassignMember } from "./assignees-mutations";
import { projectAssigneesQueryOptions } from "./queries";

// Co-workers сделки (redesign: сайдбар project-detail, было на вкладке Контакты). Manager+
// управляет (project-links.md §2).
export function AssigneesPanel({ orgId, projectId }: { orgId: string; projectId: string }) {
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
          <li key={assignee.userId} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm">
              <Avatar name={assignee.name} size="sm" />
              {assignee.name}
            </span>
            {canUnassign && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                aria-label={t("contacts.assignees.remove")}
                onClick={() => unassign.mutate({ userId: assignee.userId })}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {canAssign && candidates.length > 0 && (
        <div className="flex flex-col gap-2">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger>
              <SelectValue placeholder={t("contacts.assignees.picker.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((member) => (
                <SelectItem key={member.userId} value={member.userId}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
