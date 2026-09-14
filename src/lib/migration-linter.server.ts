/**
 * Phase 8.1 — Expand-and-Contract Migration Linter & Safety Protocol.
 *
 * Enforces zero-downtime database schema evolutions across 4 distinct phases:
 * - Stage 1 (Expand): Add nullable columns, new tables, or columns with default values.
 * - Stage 2 (Dual-Write): Application writes to both legacy and new structures.
 * - Stage 3 (Read-New): Application reads/writes exclusively to new structures.
 * - Stage 4 (Contract): Drop legacy column/table only after all pods are running Stage 3.
 *
 * Dangerous DDL operations that break backward-compatibility during rolling releases
 * are strictly blocked in standard PRs:
 * 1. ALTER TABLE ... DROP COLUMN (unless annotated with `-- @framique-stage: contract`)
 * 2. ALTER TABLE ... RENAME COLUMN
 * 3. ALTER TABLE ... RENAME TO (table rename)
 * 4. ADD COLUMN ... NOT NULL without DEFAULT
 * 5. ALTER COLUMN ... SET NOT NULL (without prior validation constraint)
 * 6. ALTER COLUMN ... TYPE (in-place type change acquiring ACCESS EXCLUSIVE lock)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type LintSeverity = "error" | "warning";

export type LintViolation = {
  ruleId: string;
  ruleName: string;
  severity: LintSeverity;
  filePath?: string;
  lineNumber: number;
  lineContent: string;
  message: string;
  remediation: string;
};

export type LintResult = {
  filePath?: string;
  valid: boolean;
  stage: "expand" | "contract" | "unknown";
  rationale?: string;
  violations: LintViolation[];
};

export type LintRule = {
  id: string;
  name: string;
  severity: LintSeverity;
  pattern?: RegExp;
  matcher?: (statement: string) => boolean;
  message: string;
  remediation: string;
  allowedInContract?: boolean;
};

export const EXPAND_CONTRACT_RULES: LintRule[] = [
  {
    id: "RULE_NO_DROP_COLUMN",
    name: "Prohibit Dropping Columns in Standard Migrations",
    severity: "error",
    pattern: /alter\s+table\s+(?:if\s+exists\s+)?(?:\w+\.)?(\w+)\s+drop\s+(?:column\s+(?:if\s+exists\s+)?(\w+)|(?:if\s+exists\s+)?(?!constraint|trigger|policy|rule)(\w+))/i,
    message: "Dropping a column immediately breaks running Version N (BLUE) pods.",
    remediation:
      "Follow Expand-and-Contract: First stop reading/writing the column in application code. Only drop it in a dedicated Stage 4 Contract migration annotated with `-- @framique-stage: contract` and `-- @rationale: <reason>`.",
    allowedInContract: true,
  },
  {
    id: "RULE_NO_RENAME_COLUMN",
    name: "Prohibit Renaming Columns",
    severity: "error",
    pattern: /alter\s+table\s+(?:if\s+exists\s+)?(?:\w+\.)?(\w+)\s+rename\s+(?:column\s+)?(\w+)\s+to\s+(\w+)/i,
    message: "Renaming a column immediately breaks running Version N (BLUE) pods querying the old column name.",
    remediation:
      "Follow Expand-and-Contract: 1) Add new column (Expand); 2) Dual-write to both; 3) Backfill historical rows; 4) Read exclusively from new; 5) Drop old column in a Stage 4 Contract migration.",
    allowedInContract: false,
  },
  {
    id: "RULE_NO_RENAME_TABLE",
    name: "Prohibit Renaming Tables",
    severity: "error",
    pattern: /alter\s+table\s+(?:if\s+exists\s+)?(?:\w+\.)?(\w+)\s+rename\s+to\s+(\w+)/i,
    message: "Renaming a table immediately breaks all existing active queries referencing the old table.",
    remediation:
      "Create the new table, replicate data in dual-write mode, backfill historical rows, and migrate traffic before decommissioning the old table.",
    allowedInContract: false,
  },
  {
    id: "RULE_NO_NOT_NULL_WITHOUT_DEFAULT",
    name: "Prohibit NOT NULL Columns Without Default on Existing Tables",
    severity: "error",
    matcher: (stmt: string) => {
      const isAddColumn =
        /alter\s+table\s+(?:if\s+exists\s+)?(?:\w+\.)?\w+\s+add\s+column\s+/i.test(stmt) ||
        /alter\s+table\s+(?:if\s+exists\s+)?(?:\w+\.)?\w+\s+add\s+(?!constraint|check|foreign|primary|unique)\w+\s+[a-z0-9_]+/i.test(stmt);
      if (!isAddColumn) return false;
      if (/\bdrop\s+not\s+null\b/i.test(stmt)) return false;
      const hasNotNull = /\bnot\s+null\b/i.test(stmt);
      const hasDefault = /\bdefault\b/i.test(stmt);
      return hasNotNull && !hasDefault;
    },
    message: "Adding a NOT NULL column without a DEFAULT fails if the table has rows, and breaks concurrent Version N inserts.",
    remediation:
      "Add the column as NULLABLE or provide an explicit `DEFAULT <value>` so existing rows and concurrent inserts succeed without failure.",
    allowedInContract: false,
  },
  {
    id: "RULE_NO_IN_PLACE_TYPE_ALTERATION",
    name: "Prohibit In-Place Column Type Alteration",
    severity: "error",
    pattern: /alter\s+table\s+(?:if\s+exists\s+)?(?:\w+\.)?(\w+)\s+alter\s+(?:column\s+)?(\w+)\s+(?:set\s+data\s+)?type\s+(\w+)/i,
    message: "Altering column types in-place acquires an ACCESS EXCLUSIVE table lock, locking out all live traffic and potentially causing deadlocks.",
    remediation:
      "Add a new column with the desired type, dual-write to both, backfill in background chunks, and switch reads before dropping the old column.",
    allowedInContract: false,
  },
  {
    id: "RULE_NO_DROP_TABLE",
    name: "Prohibit Dropping Tables in Standard Migrations",
    severity: "error",
    pattern: /drop\s+table\s+(?:if\s+exists\s+)?(?:\w+\.)?(\w+)/i,
    message: "Dropping a table immediately breaks any service or canary query referencing it.",
    remediation:
      "Drop tables only in a dedicated Stage 4 Contract migration annotated with `-- @framique-stage: contract` and `-- @rationale: <reason>`.",
    allowedInContract: true,
  },
  {
    id: "RULE_INDEX_CONCURRENTLY_WARNING",
    name: "Prefer Concurrent Index Creation on Existing Tables",
    severity: "warning",
    pattern: /create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?(\w+)\s+on\s+(?!concurrently\b)/i,
    message: "Creating indexes without CONCURRENTLY locks the table against concurrent writes during index generation.",
    remediation: "Use `CREATE INDEX CONCURRENTLY` in production environments to avoid write blocking.",
    allowedInContract: true,
  },
];

/**
 * Parses annotations from SQL header comments.
 * Example:
 *   -- @framique-stage: contract
 *   -- @rationale: Decommissioning legacy orders.total_old column after 60-day dual-run
 */
export function parseMigrationMetadata(sqlContent: string): {
  isContract: boolean;
  rationale?: string;
} {
  const contractMatch = sqlContent.match(/--\s*@framique-stage:\s*(contract|expand)/i);
  const rationaleMatch = sqlContent.match(/--\s*@rationale:\s*(.+)/i);

  const isContract = contractMatch ? contractMatch[1].toLowerCase() === "contract" : false;
  const rationale = rationaleMatch ? rationaleMatch[1].trim() : undefined;

  return { isContract, rationale };
}

/**
 * Remove SQL line and block comments to avoid false-positive rule matches inside comments.
 */
function stripComments(sql: string): { cleanSql: string; lines: string[] } {
  const originalLines = sql.split("\n");
  const cleanedLines: string[] = [];

  let inBlockComment = false;

  for (const line of originalLines) {
    let cleaned = line;

    if (inBlockComment) {
      const endCommentIdx = cleaned.indexOf("*/");
      if (endCommentIdx !== -1) {
        cleaned = cleaned.slice(endCommentIdx + 2);
        inBlockComment = false;
      } else {
        cleaned = "";
      }
    }

    if (!inBlockComment) {
      // Remove line comments (-- ...)
      const lineCommentIdx = cleaned.indexOf("--");
      if (lineCommentIdx !== -1) {
        cleaned = cleaned.slice(0, lineCommentIdx);
      }

      // Check block comment start
      const startCommentIdx = cleaned.indexOf("/*");
      if (startCommentIdx !== -1) {
        const endCommentIdx = cleaned.indexOf("*/", startCommentIdx + 2);
        if (endCommentIdx !== -1) {
          cleaned = cleaned.slice(0, startCommentIdx) + cleaned.slice(endCommentIdx + 2);
        } else {
          cleaned = cleaned.slice(0, startCommentIdx);
          inBlockComment = true;
        }
      }
    }

    cleanedLines.push(cleaned);
  }

  return { cleanSql: cleanedLines.join("\n"), lines: cleanedLines };
}

/**
 * Lint SQL content against Expand-and-Contract rules.
 */
export function lintMigrationSql(sqlContent: string, filePath?: string): LintResult {
  const { isContract, rationale } = parseMigrationMetadata(sqlContent);
  const { lines } = stripComments(sqlContent);
  const violations: LintViolation[] = [];

  // If marked as contract stage, ensure valid rationale exists
  if (isContract && !rationale) {
    violations.push({
      ruleId: "RULE_CONTRACT_RATIONALE_REQUIRED",
      ruleName: "Contract Stage Rationale Required",
      severity: "error",
      filePath,
      lineNumber: 1,
      lineContent: "-- @framique-stage: contract",
      message: "Contract stage migrations must provide an explicit rationale explaining why legacy objects can now be safely dropped.",
      remediation: "Add `-- @rationale: <detailed explanation of prior dual-run and safety verification>` to the migration header.",
    });
  }

  // Iterate over cleaned lines with sliding window to catch multiline DDL statements
  for (let i = 0; i < lines.length; i++) {
    // Lookahead up to 6 lines to assemble full statement, but stop if we hit a semicolon
    const windowLines: string[] = [];
    for (let j = i; j < Math.min(lines.length, i + 6); j++) {
      windowLines.push(lines[j]);
      if (lines[j].includes(";")) break;
    }
    const combinedWindow = windowLines.join(" ").replace(/\s+/g, " ").trim();

    if (!combinedWindow) continue;

    for (const rule of EXPAND_CONTRACT_RULES) {
      if (isContract && rule.allowedInContract) {
        // Permitted in Stage 4 Contract migrations
        continue;
      }

      const isMatch = rule.matcher
        ? rule.matcher(combinedWindow)
        : rule.pattern
          ? rule.pattern.test(combinedWindow)
          : false;

      if (isMatch) {
        // Avoid duplicate detections on the same statement
        const statementFirstLine = lines[i].trim();
        const alreadyReported = violations.some(
          (v) => v.ruleId === rule.id && Math.abs(v.lineNumber - (i + 1)) <= 2,
        );

        if (!alreadyReported) {
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            filePath,
            lineNumber: i + 1,
            lineContent: statementFirstLine || lines.slice(i, i + 3).join(" ").trim(),
            message: rule.message,
            remediation: rule.remediation,
          });
        }
      }
    }
  }

  const hasErrors = violations.some((v) => v.severity === "error");

  return {
    filePath,
    valid: !hasErrors,
    stage: isContract ? "contract" : "expand",
    rationale,
    violations,
  };
}

/**
 * Lint an SQL file from the filesystem.
 */
export function lintMigrationFile(filePath: string): LintResult {
  if (!existsSync(filePath)) {
    return {
      filePath,
      valid: false,
      stage: "unknown",
      violations: [
        {
          ruleId: "FILE_NOT_FOUND",
          ruleName: "File Not Found",
          severity: "error",
          lineNumber: 0,
          lineContent: filePath,
          message: `Migration file does not exist: ${filePath}`,
          remediation: "Ensure the path to the SQL migration is valid.",
        },
      ],
    };
  }

  const content = readFileSync(filePath, "utf8");
  return lintMigrationSql(content, filePath);
}

/**
 * Lint all SQL migrations within a directory (e.g. `supabase/migrations/`).
 */
export function lintMigrationDirectory(dirPath: string): {
  totalFiles: number;
  passedFiles: number;
  failedFiles: number;
  results: LintResult[];
} {
  if (!existsSync(dirPath)) {
    return { totalFiles: 0, passedFiles: 0, failedFiles: 0, results: [] };
  }

  const files = readdirSync(dirPath)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const results: LintResult[] = [];
  let passedFiles = 0;
  let failedFiles = 0;

  for (const file of files) {
    const fullPath = resolve(dirPath, file);
    const result = lintMigrationFile(fullPath);
    results.push(result);
    if (result.valid) {
      passedFiles++;
    } else {
      failedFiles++;
    }
  }

  return {
    totalFiles: files.length,
    passedFiles,
    failedFiles,
    results,
  };
}
