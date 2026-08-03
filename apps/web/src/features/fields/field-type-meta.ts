import {
  AlignLeft,
  Building2,
  Calendar,
  Clock,
  DollarSign,
  Hash,
  Link as LinkIcon,
  List,
  ListChecks,
  Mail,
  Phone,
  ToggleLeft,
  Type,
  User,
  UserCircle,
  type LucideIcon,
} from "lucide-react";
import type { FieldType } from "@helix/api-schemas";
import type { MessageKey } from "../../shared/i18n";

// 15 типов сканируются легче сгруппированными по семье значения (§UX design), чем плоским
// алфавитным списком — та же идея, что группировка полей в CRM-конкурентах (HubSpot/Attio).
export const FIELD_TYPE_GROUPS: ReadonlyArray<{ labelKey: MessageKey; types: readonly FieldType[] }> = [
  { labelKey: "fields.group.text", types: ["text", "longtext", "url", "email", "phone"] },
  { labelKey: "fields.group.number", types: ["number", "currency"] },
  { labelKey: "fields.group.date", types: ["date", "datetime"] },
  { labelKey: "fields.group.choice", types: ["boolean", "select", "multiselect"] },
  { labelKey: "fields.group.reference", types: ["contactRef", "companyRef", "userRef"] },
];

export const FIELD_TYPE_ICON: Record<FieldType, LucideIcon> = {
  text: Type,
  longtext: AlignLeft,
  number: Hash,
  currency: DollarSign,
  date: Calendar,
  datetime: Clock,
  select: List,
  multiselect: ListChecks,
  boolean: ToggleLeft,
  url: LinkIcon,
  email: Mail,
  phone: Phone,
  contactRef: UserCircle,
  companyRef: Building2,
  userRef: User,
};

export function fieldTypeLabelKey(type: FieldType): MessageKey {
  return `fields.type.${type}` as MessageKey;
}
