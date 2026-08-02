import { useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Building2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import type { CompanyDedupHint as CompanyDedupHintData, CompanyResponse } from "@helix/api-schemas";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SortableTableHead,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { CompanyDedupHint } from "./company-dedup-hint";
import { CompanyFormDialog } from "./company-form-dialog";
import { DeleteCompanyDialog } from "./delete-company-dialog";
import { companiesListQueryOptions } from "./queries";

type SortKey = "name" | "domain" | "industry";
type SortDirection = "asc" | "desc";
interface SortState {
  key: SortKey;
  direction: SortDirection;
}

function sortCompanies(companies: CompanyResponse[], sort: SortState): CompanyResponse[] {
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...companies].sort((a, b) => {
    const av = a[sort.key] ?? "";
    const bv = b[sort.key] ?? "";
    return av.localeCompare(bv) * dir;
  });
}

export function CompaniesView({ orgId }: { orgId: string }) {
  const t = useT();
  const canCreate = useCan("Company.create");
  const canUpdate = useCan("Company.update");
  const canDelete = useCan("Company.delete");
  const { companies } = useSuspenseQuery(companiesListQueryOptions(orgId)).data;
  const [sort, setSort] = useState<SortState>({ key: "name", direction: "asc" });
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CompanyResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyResponse | null>(null);
  const [dedup, setDedup] = useState<{ hint: CompanyDedupHintData; newCompanyId: string } | null>(null);

  const rows = useMemo(() => sortCompanies(companies, sort), [companies, sort]);
  // Связь баннера со строками ниже — тот же приём, что contacts-view.tsx: подсвечиваем и новую
  // компанию, и предложенных кандидатов, чтобы не заставлять сопоставлять текст с таблицей вручную.
  const dedupHighlight = dedup
    ? new Set([dedup.newCompanyId, ...dedup.hint.candidates.map((c) => c.id)])
    : null;

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("companies.page.title")}</h1>
        {canCreate && (
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t("companies.create.trigger")}
          </Button>
        )}
      </div>

      {dedup && (
        <CompanyDedupHint hint={dedup.hint} onDismiss={() => setDedup(null)} />
      )}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <Building2 className="h-8 w-8" />
          <p>{t("companies.page.empty")}</p>
        </div>
      ) : (
        <Table className="min-w-[560px]">
          <TableHeader>
            <TableRow header>
              <SortableTableHead active={sort.key === "name"} direction={sort.direction} onClick={() => toggleSort("name")}>
                {t("companies.list.name")}
              </SortableTableHead>
              <SortableTableHead active={sort.key === "domain"} direction={sort.direction} onClick={() => toggleSort("domain")}>
                {t("companies.list.domain")}
              </SortableTableHead>
              <SortableTableHead active={sort.key === "industry"} direction={sort.direction} onClick={() => toggleSort("industry")}>
                {t("companies.list.industry")}
              </SortableTableHead>
              <TableHead className="w-10">
                <span className="sr-only">{t("companies.list.menu")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((company) => (
              <TableRow key={company.id} className={cn(dedupHighlight?.has(company.id) && "bg-amber-500/5")}>
                <TableCell>
                  <Link to="/companies/$companyId" params={{ companyId: company.id }} className="font-medium text-foreground hover:text-accent">
                    {company.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{company.domain ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{company.industry ?? "—"}</TableCell>
                <TableCell>
                  {(canUpdate || canDelete) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" aria-label={t("companies.list.menu")}>
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canUpdate && (
                          <DropdownMenuItem onSelect={() => setEditTarget(company)}>
                            <Pencil className="h-3.5 w-3.5" />
                            {t("companies.list.edit")}
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteTarget(company)}>
                            <Trash2 className="h-3.5 w-3.5" />
                            {t("companies.list.delete")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <CompanyFormDialog
        orgId={orgId}
        company={null}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(created, hint) => {
          if (hint.candidates.length > 0) setDedup({ hint, newCompanyId: created.id });
        }}
      />
      <CompanyFormDialog orgId={orgId} company={editTarget} open={editTarget !== null} onOpenChange={(open) => !open && setEditTarget(null)} />
      <DeleteCompanyDialog
        orgId={orgId}
        company={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      />
    </div>
  );
}
