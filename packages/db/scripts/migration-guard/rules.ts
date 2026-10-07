export type ChangeStatus = "A" | "M" | "D" | "R";

export interface MigrationChange {
  status: ChangeStatus;
  path: string;
  sql?: string;
}

export interface Finding {
  severity: "error" | "destructive";
  rule: string;
  path: string;
  line?: number;
  message: string;
}

export interface Outcome {
  exitCode: 0 | 1 | 3;
  summary: string;
}

const MIGRATION_FILE = /prisma\/migrations\/[^/]+\/migration\.sql$/;
const PROTECTED_INDEXES = ["phase_ws_order_unique"];

const DESTRUCTIVE_RULES: Array<{ rule: string; pattern: RegExp; message: string }> = [
  { rule: "drop-table", pattern: /\bDROP\s+TABLE\b/i, message: "DROP TABLE удаляет таблицу вместе с данными" },
  { rule: "drop-column", pattern: /\bDROP\s+COLUMN\b/i, message: "DROP COLUMN удаляет данные колонки" },
  { rule: "drop-type", pattern: /\bDROP\s+TYPE\b/i, message: "DROP TYPE удаляет enum/тип" },
  {
    rule: "alter-column-type",
    pattern: /\bALTER\s+COLUMN\b[^;]*?\b(?:SET\s+DATA\s+)?TYPE\b/i,
    message: "смена типа колонки может потерять данные и молча сбрасывает коллацию",
  },
  { rule: "rename-column", pattern: /\bRENAME\s+COLUMN\b/i, message: "RENAME COLUMN ломает работающий код и запросы" },
  {
    rule: "rename-table",
    pattern: /^\s*ALTER\s+TABLE\b[^;]*?\bRENAME\s+TO\b/i,
    message: "переименование таблицы ломает работающий код и запросы",
  },
  { rule: "truncate", pattern: /^\s*TRUNCATE\b/i, message: "TRUNCATE стирает все строки" },
  { rule: "delete", pattern: /^\s*DELETE\s+FROM\b/i, message: "DELETE FROM удаляет данные" },
];

function blank(text: string): string {
  return text.replace(/[^\n]/g, " ");
}

export function stripSqlNoise(sql: string): string {
  let result = "";
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    const lineComment = /^--[^\n]*/.exec(rest);
    const blockComment = /^\/\*[\s\S]*?(?:\*\/|$)/.exec(rest);
    const literal = /^'(?:[^']|'')*(?:'|$)/.exec(rest);
    const match = lineComment ?? blockComment ?? literal;
    if (match) {
      result += blank(match[0]);
      i += match[0].length;
    } else {
      result += sql[i];
      i++;
    }
  }
  return result;
}

function maskIdentifiers(sql: string): string {
  return sql.replace(/"(?:[^"]|"")*"/g, (quoted) => `"${"_".repeat(Math.max(quoted.length - 2, 0))}"`);
}

function statements(sql: string): Array<{ text: string; line: number }> {
  const result: Array<{ text: string; line: number }> = [];
  let offset = 0;
  for (const part of sql.split(";")) {
    const leading = part.length - part.trimStart().length;
    if (part.trim() !== "") {
      result.push({ text: part, line: sql.slice(0, offset + leading).split("\n").length });
    }
    offset += part.length + 1;
  }
  return result;
}

function analyzeAdded(change: MigrationChange): Finding[] {
  const clean = stripSqlNoise(change.sql ?? "");
  const masked = maskIdentifiers(clean);
  const findings: Finding[] = [];

  for (const index of PROTECTED_INDEXES) {
    const pattern = new RegExp(`\\bDROP\\s+INDEX\\b[^;]*\\b${index}\\b`, "i");
    for (const statement of statements(clean)) {
      if (pattern.test(statement.text)) {
        findings.push({
          severity: "error",
          rule: "protected-index",
          path: change.path,
          line: statement.line,
          message: `DROP INDEX "${index}" — manual-migration point: Prisma генерирует этот DROP сама, его нужно вырезать вручную`,
        });
      }
    }
  }

  for (const statement of statements(masked)) {
    for (const { rule, pattern, message } of DESTRUCTIVE_RULES) {
      if (pattern.test(statement.text)) {
        findings.push({ severity: "destructive", rule, path: change.path, line: statement.line, message });
      }
    }
  }

  return findings;
}

export function analyzeMigrationChanges(changes: MigrationChange[]): Finding[] {
  const findings: Finding[] = [];

  for (const change of changes) {
    if (!MIGRATION_FILE.test(change.path)) continue;

    if (change.status === "A") {
      findings.push(...analyzeAdded(change));
    } else {
      findings.push({
        severity: "error",
        rule: "immutable",
        path: change.path,
        message: "применённую миграцию менять нельзя: контрольная сумма в _prisma_migrations перестанет совпадать, migrate deploy упадёт",
      });
    }
  }

  return findings.sort((a, b) => a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0));
}

export function decideOutcome(findings: Finding[], approved: boolean): Outcome {
  const errors = findings.filter((finding) => finding.severity === "error");
  const destructive = findings.filter((finding) => finding.severity === "destructive");

  if (errors.length > 0) {
    return { exitCode: 3, summary: `${errors.length} жёстких ошибок: исправь миграцию, метка не поможет` };
  }
  if (destructive.length > 0 && !approved) {
    return {
      exitCode: 1,
      summary: `${destructive.length} деструктивных операций: подтверди план бэкфилла меткой migration-reviewed`,
    };
  }
  if (destructive.length > 0) {
    return { exitCode: 0, summary: `${destructive.length} деструктивных операций подтверждены меткой migration-reviewed` };
  }
  return { exitCode: 0, summary: "опасных операций в миграциях нет" };
}
