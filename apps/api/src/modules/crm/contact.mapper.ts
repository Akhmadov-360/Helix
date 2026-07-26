import type { ContactResponse } from "@helix/api-schemas";

// Prisma select под ContactRow — единая точка для всех репозиториев, читающих контакт.
// emailNormalized/mergedIntoId сюда НЕ включены: в ответ не уходят (§4.4, §7.5).
export const CONTACT_SELECT = {
  id: true,
  orgId: true,
  name: true,
  email: true,
  phone: true,
  companyId: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Поля ответа + internal-поля дедупа/merge, которые в контракт НЕ уходят (§4.4, §7.5).
export interface ContactRow {
  id: string;
  orgId: string;
  name: string;
  email: string | null;
  phone: string | null;
  companyId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Для мутирующих путей: те же поля + mergedIntoId (410-гейт §7.5). mergedIntoId в ответ не
// уходит — toContactResponse его игнорирует (лишнее поле в объекте TS допускает).
export const CONTACT_INTERNAL_SELECT = { ...CONTACT_SELECT, mergedIntoId: true } as const;

export interface ContactInternalRow extends ContactRow {
  mergedIntoId: string | null;
}

export function toContactResponse(c: ContactRow): ContactResponse {
  return {
    id: c.id,
    orgId: c.orgId,
    name: c.name,
    email: c.email,
    phone: c.phone,
    companyId: c.companyId,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
