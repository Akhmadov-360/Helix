import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeMigrationChanges, decideOutcome, type ChangeStatus, type Finding, type MigrationChange } from "./rules";

const MIGRATIONS_PATHSPEC = ":(top)packages/db/prisma/migrations";

const git = (...args: string[]): string => execFileSync("git", args, { encoding: "utf8" }).trim();

function readChanges(base: string): MigrationChange[] {
  const root = git("rev-parse", "--show-toplevel");
  const output = git("diff", "--name-status", "--find-renames", `${base}...HEAD`, "--", MIGRATIONS_PATHSPEC);
  const changes: MigrationChange[] = [];

  for (const line of output.split("\n").filter(Boolean)) {
    const [rawStatus = "", path = ""] = line.split("\t");
    const status = rawStatus[0] as ChangeStatus;
    if (status === "A") {
      changes.push({ status, path, sql: readFileSync(join(root, path), "utf8") });
    } else if (status === "M" || status === "D" || status === "R") {
      changes.push({ status, path });
    }
  }
  return changes;
}

function report(findings: Finding[], approved: boolean): void {
  const annotate = process.env.GITHUB_ACTIONS === "true";
  for (const finding of findings) {
    const location = finding.line === undefined ? finding.path : `${finding.path}:${finding.line}`;
    console.log(`${location} [${finding.rule}] ${finding.message}`);
    if (annotate) {
      const level = finding.severity === "destructive" && approved ? "warning" : "error";
      console.log(`::${level} file=${finding.path}${finding.line === undefined ? "" : `,line=${finding.line}`}::[${finding.rule}] ${finding.message}`);
    }
  }
}

const args = process.argv.slice(2);
const baseIndex = args.indexOf("--base");
const base = baseIndex >= 0 ? (args[baseIndex + 1] ?? "origin/main") : "origin/main";
const approved = args.includes("--approved") || process.env.MIGRATION_APPROVED === "true";

try {
  git("rev-parse", "--verify", base);
} catch {
  console.error(`Базовая ветка '${base}' недоступна. Выполни git fetch.`);
  process.exit(2);
}

const changes = readChanges(base);
const findings = analyzeMigrationChanges(changes);
const outcome = decideOutcome(findings, approved);

console.log(`Миграции относительно ${base}: изменённых файлов ${changes.length}`);
report(findings, approved);
console.log(outcome.summary);
process.exit(outcome.exitCode);
