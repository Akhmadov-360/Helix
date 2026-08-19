import { useSuspenseQuery } from "@tanstack/react-query";
import { Filter, Search, X } from "lucide-react";
import {
  Avatar,
  Button,
  Checkbox,
  cn,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@helix/ui";
import { useMe } from "../../shared/auth/session";
import { useT } from "../../shared/i18n";
import { orgMembersQueryOptions } from "../../shared/org/queries";
import { activeFilterCount, EMPTY_FILTER, type BoardFilterState } from "./board-filter";

interface Props {
  orgId: string;
  filter: BoardFilterState;
  onChange: (filter: BoardFilterState) => void;
}

// Стиль иконки-триггера (только Filter, без чипа с активным count) вдохновлён Trello-референсом:
// счётчик активных секций рендерим как маленький бейдж в правом верхнем углу иконки, а не как
// длинный чип "Фильтры (2)" рядом — экономит место в toolbar'е и остаётся узнаваемым паттерном.
export function BoardFilterPopover({ orgId, filter, onChange }: Props) {
  const t = useT();
  const me = useMe();
  const members = useSuspenseQuery(orgMembersQueryOptions(orgId)).data;
  const count = activeFilterCount(filter);

  // "Мне" — не отдельный флаг в state (упростили бы модель, но UX хуже: два места, где живёт
  // "я в списке" — свой чекбокс И общий список ассайни). Просто выделяем свою строку сверху и
  // помечаем "(вы)" — оба чекбокса пишут в тот же `assigneeUserIds`. Один источник истины.
  const meMember = members.find((m) => m.userId === me.id);
  const otherMembers = members.filter((m) => m.userId !== me.id);

  function toggleAssignee(userId: string) {
    onChange({
      ...filter,
      assigneeUserIds: filter.assigneeUserIds.includes(userId)
        ? filter.assigneeUserIds.filter((id) => id !== userId)
        : [...filter.assigneeUserIds, userId],
    });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={t("board.filter.trigger")}
          className="relative"
        >
          <Filter className="h-3.5 w-3.5" />
          {t("board.filter.trigger")}
          {count > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">{t("board.filter.title")}</span>
          {count > 0 && (
            <button
              type="button"
              onClick={() => onChange(EMPTY_FILTER)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
              {t("board.filter.clear")}
            </button>
          )}
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-3">
          <section className="flex flex-col gap-1.5">
            <label htmlFor="board-filter-query" className="text-xs font-medium text-muted-foreground">
              {t("board.filter.query.label")}
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="board-filter-query"
                value={filter.query}
                onChange={(e) => onChange({ ...filter, query: e.target.value })}
                placeholder={t("board.filter.query.placeholder")}
                className="pl-8"
              />
            </div>
            <p className="text-xs text-muted-foreground">{t("board.filter.query.hint")}</p>
          </section>

          <section className="mt-4 flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">{t("board.filter.assignees.label")}</p>

            <AssigneeRow
              id="board-filter-unassigned"
              checked={filter.filterUnassigned}
              onCheckedChange={(checked) => onChange({ ...filter, filterUnassigned: Boolean(checked) })}
              label={t("board.filter.assignees.unassigned")}
            />

            {meMember && (
              <AssigneeRow
                id={`board-filter-assignee-${meMember.userId}`}
                checked={filter.assigneeUserIds.includes(meMember.userId)}
                onCheckedChange={() => toggleAssignee(meMember.userId)}
                label={`${meMember.name} ${t("board.filter.assignees.me")}`}
                avatarName={meMember.name}
              />
            )}

            {otherMembers.map((member) => (
              <AssigneeRow
                key={member.userId}
                id={`board-filter-assignee-${member.userId}`}
                checked={filter.assigneeUserIds.includes(member.userId)}
                onCheckedChange={() => toggleAssignee(member.userId)}
                label={member.name}
                avatarName={member.name}
              />
            ))}
          </section>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface AssigneeRowProps {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean | "indeterminate") => void;
  label: string;
  avatarName?: string;
}

function AssigneeRow({ id, checked, onCheckedChange, label, avatarName }: AssigneeRowProps) {
  return (
    <label htmlFor={id} className={cn("flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 hover:bg-accent")}>
      <Checkbox id={id} checked={checked} onCheckedChange={onCheckedChange} />
      {avatarName ? <Avatar name={avatarName} size="sm" /> : <span className="inline-block h-5 w-5 rounded-full border border-dashed border-muted-foreground/40" />}
      <span className="truncate text-sm">{label}</span>
    </label>
  );
}
