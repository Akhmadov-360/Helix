import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { Avatar, Button, Popover, PopoverContent, PopoverTrigger } from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { orgMembersQueryOptions } from "../../shared/org/queries";
import { useAssignMember, useUnassignMember } from "./assignees-mutations";
import { projectAssigneesQueryOptions } from "./queries";

// Co-workers сделки (redesign: сайдбар project-detail, было на вкладке Контакты). Manager+
// управляет (project-links.md §2).
//
// Design review: full-width Select + отдельная кнопка "Добавить" — два клика на одно действие
// (выбрать в списке, потом ещё раз кликнуть "Добавить"), тот же паттерн, что уже есть в
// tasks/assignee-field.tsx — один клик по кандидату в попапе сразу назначает и закрывает попап.
export function AssigneesPanel({
  orgId,
  projectId,
  ownerId,
}: {
  orgId: string;
  projectId: string;
  /** Владелец уже единолично ответственный за лид (Project.ownerId) — не предлагаем добавить его
   *  же со-исполнителем, это ничего не значит поверх того, что он уже owner. */
  ownerId: string | null;
}) {
  const t = useT();
  const assignees = useSuspenseQuery(projectAssigneesQueryOptions(orgId, projectId)).data;
  const members = useSuspenseQuery(orgMembersQueryOptions(orgId)).data;
  const assign = useAssignMember(orgId, projectId);
  const unassign = useUnassignMember(orgId, projectId);
  const canAssign = useCan("ProjectAssignee.create");
  const canUnassign = useCan("ProjectAssignee.delete");
  const [open, setOpen] = useState(false);

  const assignedIds = new Set(assignees.map((a) => a.userId));
  const candidates = members.filter((m) => !assignedIds.has(m.userId) && m.userId !== ownerId);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("contacts.assignees.title")}</h2>
        {canAssign && candidates.length > 0 && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-6 w-6 rounded-full"
                aria-label={t("contacts.assignees.add")}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-1" align="end">
              <div className="flex max-h-56 flex-col overflow-y-auto">
                {candidates.map((member) => (
                  <button
                    key={member.userId}
                    type="button"
                    onClick={() => {
                      assign.mutate({
                        userId: member.userId,
                        optimistic: { userId: member.userId, name: member.name, email: member.email },
                      });
                      setOpen(false);
                    }}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                  >
                    <Avatar name={member.name} size="sm" />
                    <span className="flex-1 truncate">{member.name}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {assignees.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("contacts.assignees.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {assignees.map((assignee) => (
            <li
              key={assignee.userId}
              className="group flex items-center justify-between gap-2 rounded-md px-1 py-1 transition-colors hover:bg-muted/40"
            >
              <span className="flex items-center gap-2 text-sm">
                <Avatar name={assignee.name} size="sm" />
                {assignee.name}
              </span>
              {canUnassign && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  aria-label={t("contacts.assignees.remove")}
                  onClick={() => unassign.mutate({ userId: assignee.userId })}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
