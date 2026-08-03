import type { CompanyDetailResponse, CompanyResponse } from "@helix/api-schemas";
import { toContactResponse, type ContactRow } from "./contact.mapper";

// domainNormalized в ответ НЕ уходит (внутреннее поле дедупа, аналогично emailNormalized §4.4).
export interface CompanyRow {
  id: string;
  orgId: string;
  name: string;
  domain: string | null;
  industry: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toCompanyResponse(
  c: CompanyRow,
  projects?: Array<{ id: string; title: string }>,
  contacts?: Array<{ id: string; name: string }>,
): CompanyResponse {
  return {
    id: c.id,
    orgId: c.orgId,
    name: c.name,
    domain: c.domain,
    industry: c.industry,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    ...(projects ? { projects } : {}),
    ...(contacts ? { contacts } : {}),
  };
}

export function toCompanyDetailResponse(
  c: CompanyRow & { contacts: ContactRow[] },
): CompanyDetailResponse {
  return {
    ...toCompanyResponse(c),
    contacts: c.contacts.map((contact) => toContactResponse(contact)),
  };
}
