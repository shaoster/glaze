#!/usr/bin/env node
/**
 * Coverage audit CLI.
 *
 * Ingests Bazel per-test LCOV reports into a temporary SQLite database and
 * exposes a handful of report modes for coverage gaps, redundant coverage,
 * unexpected overlap, and broad non-integration coverage.
 */

import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  mkdirSync,
  existsSync,
  unlinkSync,
  readdirSync,
  statSync,
} from "node:fs";
import { accessSync, constants as fsConstants } from "node:fs";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import lcovParse from "lcov-parse";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(SCRIPT_DIR, "..");
const REPO_ROOT = resolve(WEB_DIR, "..");
const DEFAULT_REPORT_ROOT = resolve(REPO_ROOT, "bazel-testlogs");
const DEFAULT_INTEGRATION_REGEX = /(?:^|[/_.-])integration(?:$|[/_.-])/i;

function defaultDbPath() {
  const preferred = resolve(REPO_ROOT, ".coverage-audit", "coverage-audit.sqlite3");
  try {
    accessSync(REPO_ROOT, fsConstants.W_OK);
    return preferred;
  } catch {
    return resolve(tmpdir(), "glaze-coverage-audit.sqlite3");
  }
}

export function help(exitCode = 0) {
  const dbPath = defaultDbPath();
  console.log(`
Usage:
  coverage-audit.mjs [options] [summary|gaps|redundant|unexpected]

Options:
  --db <path>                 SQLite database path (default: ${displayPath(dbPath)})
  --reports <path>            LCOV file or directory to scan (repeatable; default: ${relative(REPO_ROOT, DEFAULT_REPORT_ROOT)})
  --integration-regex <re>    Regex used to label a test as integration (default: ${DEFAULT_INTEGRATION_REGEX})
  --limit <n>                 Maximum rows to print in each section (default: 10)
  --min-files <n>             Flag tests covering at least this many files (default: 8)
  --min-buckets <n>           Flag tests covering at least this many feature buckets (default: 3)
  -h, --help                  Show help

Commands:
  summary     Build the DB and print a compact overview
  gaps        Print uncovered files and the largest uncovered ranges
  redundant   Print lines covered by many tests
  unexpected  Print tests that fan out across unrelated feature buckets
`);
  process.exit(exitCode);
}

export function parseArgs(argv) {
  const options = {
    command: "summary",
    dbPath: defaultDbPath(),
    reports: [],
    integrationRegex: DEFAULT_INTEGRATION_REGEX,
    limit: 10,
    minFiles: 8,
    minBuckets: 3,
  };

  const rest = [];
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      help(0);
    } else if (arg === "--db") {
      options.dbPath = resolve(REPO_ROOT, argv[++i]);
    } else if (arg === "--reports") {
      options.reports.push(resolve(REPO_ROOT, argv[++i]));
    } else if (arg === "--integration-regex") {
      options.integrationRegex = new RegExp(argv[++i], "i");
    } else if (arg === "--limit") {
      options.limit = Number(argv[++i]);
    } else if (arg === "--min-files") {
      options.minFiles = Number(argv[++i]);
    } else if (arg === "--min-buckets") {
      options.minBuckets = Number(argv[++i]);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      rest.push(arg);
    }
  }

  if (rest[0]) {
    options.command = rest[0];
  }

  if (options.reports.length === 0) {
    options.reports.push(DEFAULT_REPORT_ROOT);
  }

  return options;
}

export function normalizeCoveragePath(inputPath) {
  if (!inputPath) return inputPath;
  let path = String(inputPath).replaceAll("\\", "/");
  const repoPrefix = REPO_ROOT.replaceAll("\\", "/") + "/";
  if (path.startsWith(repoPrefix)) {
    return path.slice(repoPrefix.length);
  }

  const markers = ["/web/", "/api/", "/backend/", "/tools/", "/tests/", "/docs/"];
  for (const marker of markers) {
    const idx = path.indexOf(marker);
    if (idx >= 0) {
      return path.slice(idx + 1);
    }
  }

  if (path.startsWith("./")) {
    return path.slice(2);
  }

  return path;
}

export function displayReportName(reportPath) {
  const normalized = relative(REPO_ROOT, reportPath).replaceAll("\\", "/");
  if (normalized.startsWith("..")) {
    return reportPath.replaceAll("\\", "/");
  }
  return normalized;
}

export function displayPath(path) {
  const normalized = relative(REPO_ROOT, path).replaceAll("\\", "/");
  if (normalized.startsWith("..")) {
    return path.replaceAll("\\", "/");
  }
  return normalized;
}

export function bucketForPath(path) {
  if (path.startsWith("web/src/components/")) return "web/src/components";
  if (path.startsWith("web/src/pages/")) return "web/src/pages";
  if (path.startsWith("web/src/util/")) return "web/src/util";
  if (path.startsWith("web/src/")) return "web/src";
  if (path.startsWith("api/")) return "api";
  if (path.startsWith("backend/")) return "backend";
  if (path.startsWith("tools/")) return "tools";
  if (path.startsWith("tests/")) return "tests";
  if (path.startsWith("docs/")) return "docs";
  return path.split("/")[0] || path;
}

export function isIntegrationTest(testName, integrationRegex) {
  return integrationRegex.test(testName);
}

export function discoverCoverageFiles(paths) {
  const files = new Set();
  for (const candidate of paths) {
    if (!existsSync(candidate)) {
      continue;
    }
    const stats = statSync(candidate);
    if (stats.isFile()) {
      if (candidate.endsWith("coverage.dat")) {
        files.add(candidate);
      }
      continue;
    }
    walk(candidate, (filePath) => {
      if (filePath.endsWith("coverage.dat")) {
        files.add(filePath);
      }
    });
  }
  return [...files].sort();
}

export function walk(dirPath, onFile) {
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = resolve(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, onFile);
    } else if (entry.isFile()) {
      onFile(fullPath);
    }
  }
}

export function parseLcovFile(filePath) {
  return new Promise((resolvePromise, rejectPromise) => {
    lcovParse(filePath, (error, data) => {
      if (error) {
        rejectPromise(error);
        return;
      }
      resolvePromise(data ?? []);
    });
  });
}

export function createSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS source_files (
      id INTEGER PRIMARY KEY,
      path TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS source_lines (
      id INTEGER PRIMARY KEY,
      source_file_id INTEGER NOT NULL REFERENCES source_files(id) ON DELETE CASCADE,
      line_number INTEGER NOT NULL,
      total_hit_count INTEGER NOT NULL DEFAULT 0,
      test_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(source_file_id, line_number)
    );

    CREATE TABLE IF NOT EXISTS tests (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      report_path TEXT NOT NULL,
      is_integration INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS coverage_lines (
      id INTEGER PRIMARY KEY,
      test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      source_line_id INTEGER NOT NULL REFERENCES source_lines(id) ON DELETE CASCADE,
      hit_count INTEGER NOT NULL,
      UNIQUE(test_id, source_line_id)
    );

    CREATE INDEX IF NOT EXISTS idx_source_lines_file_line
      ON source_lines(source_file_id, line_number);
    CREATE INDEX IF NOT EXISTS idx_coverage_lines_test
      ON coverage_lines(test_id);
    CREATE INDEX IF NOT EXISTS idx_coverage_lines_line
      ON coverage_lines(source_line_id);
    CREATE INDEX IF NOT EXISTS idx_tests_integration
      ON tests(is_integration);

    CREATE VIEW IF NOT EXISTS combined_source_lines AS
      SELECT
        sf.path AS file_path,
        sl.line_number,
        sl.total_hit_count,
        sl.test_count
      FROM source_lines sl
      JOIN source_files sf ON sf.id = sl.source_file_id;

    CREATE VIEW IF NOT EXISTS combined_file_coverage AS
      SELECT
        sf.path AS file_path,
        COUNT(sl.id) AS line_count,
        SUM(CASE WHEN sl.total_hit_count > 0 THEN 1 ELSE 0 END) AS covered_lines,
        SUM(CASE WHEN sl.total_hit_count = 0 THEN 1 ELSE 0 END) AS uncovered_lines,
        ROUND(
          100.0 * SUM(CASE WHEN sl.total_hit_count > 0 THEN 1 ELSE 0 END) / COUNT(sl.id),
          1
        ) AS coverage_percent
      FROM source_files sf
      JOIN source_lines sl ON sl.source_file_id = sf.id
      GROUP BY sf.id;
  `);
}

export function getOrCreateSourceFile(db, fileCache, filePath) {
  if (fileCache.has(filePath)) {
    return fileCache.get(filePath);
  }
  const existing = db.prepare("SELECT id FROM source_files WHERE path = ?").get(filePath);
  if (existing) {
    fileCache.set(filePath, existing.id);
    return existing.id;
  }
  const result = db.prepare("INSERT INTO source_files(path) VALUES (?)").run(filePath);
  fileCache.set(filePath, Number(result.lastInsertRowid));
  return Number(result.lastInsertRowid);
}

export function getOrCreateSourceLine(db, lineCache, sourceFileId, lineNumber) {
  const key = `${sourceFileId}:${lineNumber}`;
  if (lineCache.has(key)) {
    return lineCache.get(key);
  }
  const existing = db
    .prepare("SELECT id FROM source_lines WHERE source_file_id = ? AND line_number = ?")
    .get(sourceFileId, lineNumber);
  if (existing) {
    lineCache.set(key, existing.id);
    return existing.id;
  }
  const result = db
    .prepare("INSERT INTO source_lines(source_file_id, line_number) VALUES (?, ?)")
    .run(sourceFileId, lineNumber);
  lineCache.set(key, Number(result.lastInsertRowid));
  return Number(result.lastInsertRowid);
}

export function upsertTest(db, testName, reportPath, isIntegration) {
  const existing = db.prepare("SELECT id FROM tests WHERE name = ?").get(testName);
  if (existing) {
    db.prepare("UPDATE tests SET report_path = ?, is_integration = ? WHERE id = ?").run(
      reportPath,
      isIntegration ? 1 : 0,
      existing.id,
    );
    return existing.id;
  }
  const result = db
    .prepare("INSERT INTO tests(name, report_path, is_integration) VALUES (?, ?, ?)")
    .run(testName, reportPath, isIntegration ? 1 : 0);
  return Number(result.lastInsertRowid);
}

export function ingestReport(db, reportPath, integrationRegex, caches) {
  const testName = displayReportName(reportPath);
  const isIntegration = isIntegrationTest(testName, integrationRegex);
  const testId = upsertTest(db, testName, reportPath, isIntegration);
  const tx = db.transaction((records) => {
    for (const record of records) {
      const rawPath = record.file ?? record.path ?? "";
      if (!rawPath) continue;
      const filePath = normalizeCoveragePath(rawPath);
      const sourceFileId = getOrCreateSourceFile(db, caches.fileCache, filePath);
      const lines = record.lines?.details ?? record.lines ?? [];
      for (const line of lines) {
        const lineNumber = Number(line.line ?? line.lineNumber ?? line.lineno ?? line.line_number);
        const hitCount = Number(line.hit ?? line.count ?? line.hits ?? 0);
        if (!Number.isFinite(lineNumber) || lineNumber <= 0) {
          continue;
        }
        const sourceLineId = getOrCreateSourceLine(
          db,
          caches.lineCache,
          sourceFileId,
          lineNumber,
        );
        db.prepare(
          "INSERT OR REPLACE INTO coverage_lines(test_id, source_line_id, hit_count) VALUES (?, ?, ?)",
        ).run(testId, sourceLineId, hitCount);
        if (hitCount > 0) {
          db.prepare(
            `UPDATE source_lines
             SET total_hit_count = total_hit_count + ?, test_count = test_count + 1
             WHERE id = ?`,
          ).run(hitCount, sourceLineId);
        }
      }
    }
  });
  return tx;
}

export function summarizeCoverage(db) {
  return {
    files: db.prepare("SELECT COUNT(*) AS count FROM source_files").get().count,
    lines: db.prepare("SELECT COUNT(*) AS count FROM source_lines").get().count,
    tests: db.prepare("SELECT COUNT(*) AS count FROM tests").get().count,
    coveredLines: db
      .prepare("SELECT COUNT(*) AS count FROM source_lines WHERE total_hit_count > 0")
      .get().count,
  };
}

export function contiguousRanges(lines) {
  const ranges = [];
  const sorted = [...new Set(lines)].sort((a, b) => a - b);
  if (sorted.length === 0) return ranges;

  let start = sorted[0];
  let previous = sorted[0];
  for (const line of sorted.slice(1)) {
    if (line === previous + 1) {
      previous = line;
      continue;
    }
    ranges.push([start, previous]);
    start = line;
    previous = line;
  }
  ranges.push([start, previous]);
  return ranges;
}

export function formatRanges(ranges, limit = 3) {
  return ranges
    .slice(0, limit)
    .map(([start, end]) => (start === end ? `${start}` : `${start}-${end}`))
    .join(", ");
}

export function reportGaps(db, limit) {
  const fileRows = db
    .prepare(
      `
        SELECT
          sf.path AS file_path,
          sl.line_number
        FROM source_lines sl
        JOIN source_files sf ON sf.id = sl.source_file_id
        WHERE sl.total_hit_count = 0
        ORDER BY sf.path, sl.line_number
      `,
    )
    .all();

  const perFile = new Map();
  for (const row of fileRows) {
    if (!perFile.has(row.file_path)) {
      perFile.set(row.file_path, []);
    }
    perFile.get(row.file_path).push(row.line_number);
  }

  const ranked = [...perFile.entries()]
    .map(([filePath, lines]) => ({
      filePath,
      uncovered: lines.length,
      ranges: contiguousRanges(lines),
    }))
    .sort((a, b) => b.uncovered - a.uncovered || a.filePath.localeCompare(b.filePath));

  console.log("Coverage gaps:");
  for (const entry of ranked.slice(0, limit)) {
    console.log(
      `- ${entry.filePath}: ${entry.uncovered} uncovered lines (${formatRanges(entry.ranges)})`,
    );
  }
  if (ranked.length === 0) {
    console.log("- none");
  }
}

export function reportRedundancy(db, limit) {
  const rows = db
    .prepare(
      `
        SELECT
          sf.path AS file_path,
          sl.line_number,
          sl.test_count,
          sl.total_hit_count
        FROM source_lines sl
        JOIN source_files sf ON sf.id = sl.source_file_id
        WHERE sl.test_count >= 2
        ORDER BY sl.test_count DESC, sl.total_hit_count DESC, sf.path, sl.line_number
      `,
    )
    .all();

  console.log("Redundant coverage:");
  if (rows.length === 0) {
    console.log("- none");
    return;
  }

  for (const row of rows.slice(0, limit)) {
    console.log(
      `- ${row.file_path}:${row.line_number} is hit by ${row.test_count} tests (${row.total_hit_count} total hits)`,
    );
  }
}

export function reportUnexpectedCoverage(db, limit, minFiles, minBuckets, integrationRegex) {
  const tests = db
    .prepare(
      `
        SELECT
          t.id,
          t.name,
          t.is_integration,
          sf.path AS file_path,
          SUM(cl.hit_count) AS hit_count
        FROM tests t
        JOIN coverage_lines cl ON cl.test_id = t.id
        JOIN source_lines sl ON sl.id = cl.source_line_id
        JOIN source_files sf ON sf.id = sl.source_file_id
        WHERE cl.hit_count > 0
        GROUP BY t.id, sf.path
        ORDER BY t.name, hit_count DESC
      `,
    )
    .all();

  const byTest = new Map();
  for (const row of tests) {
    if (!byTest.has(row.name)) {
      byTest.set(row.name, {
        isIntegration: Boolean(row.is_integration),
        files: new Map(),
      });
    }
    byTest.get(row.name).files.set(row.file_path, row.hit_count);
  }

  const summaries = [...byTest.entries()].map(([testName, info]) => {
    const filePaths = [...info.files.keys()];
    const buckets = new Set(filePaths.map(bucketForPath));
    return {
      testName,
      isIntegration: info.isIntegration || isIntegrationTest(testName, integrationRegex),
      fileCount: filePaths.length,
      bucketCount: buckets.size,
      buckets: [...buckets].sort(),
      files: filePaths.sort(),
    };
  });

  const flagged = summaries
    .filter((row) => !row.isIntegration && (row.fileCount >= minFiles || row.bucketCount >= minBuckets))
    .sort((a, b) => b.fileCount - a.fileCount || b.bucketCount - a.bucketCount || a.testName.localeCompare(b.testName));

  console.log("Unexpected / broad non-integration coverage:");
  if (flagged.length === 0) {
    console.log("- none");
    return;
  }

  for (const row of flagged.slice(0, limit)) {
    console.log(
      `- ${row.testName}: ${row.fileCount} files across ${row.bucketCount} buckets (${row.buckets.join(", ")})`,
    );
  }
}

export function ensureDbDirectory(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
}

export async function buildDatabase(options) {
  ensureDbDirectory(options.dbPath);
  if (existsSync(options.dbPath)) {
    unlinkSync(options.dbPath);
  }
  const db = new Database(options.dbPath);
  createSchema(db);
  const reportFiles = discoverCoverageFiles(options.reports);
  const caches = {
    fileCache: new Map(),
    lineCache: new Map(),
  };

  if (reportFiles.length === 0) {
    throw new Error(`No coverage.dat files found under: ${options.reports.join(", ")}`);
  }

  for (const reportPath of reportFiles) {
    const parsed = await parseLcovFile(reportPath);
    ingestReport(db, reportPath, options.integrationRegex, caches)(parsed);
  }

  return db;
}

export async function main() {
  const options = parseArgs(process.argv);
  const db = await buildDatabase(options);
  const summary = summarizeCoverage(db);

  console.log(`SQLite DB: ${options.dbPath}`);
  console.log(
    `Files: ${summary.files}  Lines: ${summary.lines}  Tests: ${summary.tests}  Covered lines: ${summary.coveredLines}`,
  );

  if (options.command === "summary") {
    reportGaps(db, options.limit);
    reportUnexpectedCoverage(
      db,
      options.limit,
      options.minFiles,
      options.minBuckets,
      options.integrationRegex,
    );
  } else if (options.command === "gaps") {
    reportGaps(db, options.limit);
  } else if (options.command === "redundant") {
    reportRedundancy(db, options.limit);
  } else if (options.command === "unexpected") {
    reportUnexpectedCoverage(
      db,
      options.limit,
      options.minFiles,
      options.minBuckets,
      options.integrationRegex,
    );
  } else {
    throw new Error(`Unknown command: ${options.command}`);
  }

  db.close();
}

const invokedAsScript = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedAsScript) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
