import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("better-sqlite3", () => {
  class FakeDatabase {
    nextIds = {
      sourceFiles: 1,
      sourceLines: 1,
      tests: 1,
      coverageLines: 1,
    };

    sourceFiles = [];
    sourceLines = [];
    tests = [];
    coverageLines = [];

    exec() {}

    close() {}

    transaction(fn) {
      return (records) => fn(records);
    }

    prepare(sql) {
      const normalized = sql.replace(/\s+/g, " ").trim();

      return {
        get: (...args) => this.#get(normalized, args),
        all: (...args) => this.#all(normalized, args),
        run: (...args) => this.#run(normalized, args),
      };
    }

    #get(sql, args) {
      if (sql === "SELECT id FROM source_files WHERE path = ?") {
        const row = this.sourceFiles.find((entry) => entry.path === args[0]);
        return row ? { id: row.id } : undefined;
      }

      if (sql === "SELECT id FROM source_lines WHERE source_file_id = ? AND line_number = ?") {
        const row = this.sourceLines.find(
          (entry) => entry.source_file_id === args[0] && entry.line_number === args[1],
        );
        return row ? { id: row.id } : undefined;
      }

      if (sql === "SELECT id FROM tests WHERE name = ?") {
        const row = this.tests.find((entry) => entry.name === args[0]);
        return row ? { id: row.id } : undefined;
      }

      if (sql === "SELECT COUNT(*) AS count FROM source_files") {
        return { count: this.sourceFiles.length };
      }

      if (sql === "SELECT COUNT(*) AS count FROM source_lines") {
        return { count: this.sourceLines.length };
      }

      if (sql === "SELECT COUNT(*) AS count FROM tests") {
        return { count: this.tests.length };
      }

      if (sql === "SELECT COUNT(*) AS count FROM source_lines WHERE total_hit_count > 0") {
        return { count: this.sourceLines.filter((entry) => entry.total_hit_count > 0).length };
      }

      if (sql === "SELECT file_path, line_count, covered_lines, uncovered_lines, coverage_percent FROM combined_file_coverage") {
        const [file] = this.#combinedCoverage();
        return file;
      }

      throw new Error(`Unhandled get query: ${sql}`);
    }

    #all(sql) {
      if (
        sql ===
        "SELECT sf.path AS file_path, sl.line_number FROM source_lines sl JOIN source_files sf ON sf.id = sl.source_file_id WHERE sl.total_hit_count = 0 ORDER BY sf.path, sl.line_number"
      ) {
        return this.sourceLines
          .filter((line) => line.total_hit_count === 0)
          .map((line) => {
            const file = this.sourceFiles.find((entry) => entry.id === line.source_file_id);
            return { file_path: file.path, line_number: line.line_number };
          })
          .sort((a, b) => a.file_path.localeCompare(b.file_path) || a.line_number - b.line_number);
      }

      if (
        sql ===
        "SELECT sf.path AS file_path, sl.line_number, sl.test_count, sl.total_hit_count FROM source_lines sl JOIN source_files sf ON sf.id = sl.source_file_id WHERE sl.test_count >= 2 ORDER BY sl.test_count DESC, sl.total_hit_count DESC, sf.path, sl.line_number"
      ) {
        return this.sourceLines
          .filter((line) => line.test_count >= 2)
          .map((line) => {
            const file = this.sourceFiles.find((entry) => entry.id === line.source_file_id);
            return {
              file_path: file.path,
              line_number: line.line_number,
              test_count: line.test_count,
              total_hit_count: line.total_hit_count,
            };
          })
          .sort(
            (a, b) =>
              b.test_count - a.test_count ||
              b.total_hit_count - a.total_hit_count ||
              a.file_path.localeCompare(b.file_path) ||
              a.line_number - b.line_number,
          );
      }

      if (
        sql ===
        "SELECT t.id, t.name, t.is_integration, sf.path AS file_path, SUM(cl.hit_count) AS hit_count FROM tests t JOIN coverage_lines cl ON cl.test_id = t.id JOIN source_lines sl ON sl.id = cl.source_line_id JOIN source_files sf ON sf.id = sl.source_file_id WHERE cl.hit_count > 0 GROUP BY t.id, sf.path ORDER BY t.name, hit_count DESC"
      ) {
        const rows = [];
        for (const test of this.tests) {
          const perFile = new Map();
          for (const coverageLine of this.coverageLines.filter((entry) => entry.test_id === test.id)) {
            if (coverageLine.hit_count <= 0) continue;
            const sourceLine = this.sourceLines.find((entry) => entry.id === coverageLine.source_line_id);
            const sourceFile = this.sourceFiles.find((entry) => entry.id === sourceLine.source_file_id);
            perFile.set(sourceFile.path, (perFile.get(sourceFile.path) ?? 0) + coverageLine.hit_count);
          }
          for (const [file_path, hit_count] of perFile.entries()) {
            rows.push({
              id: test.id,
              name: test.name,
              is_integration: test.is_integration,
              file_path,
              hit_count,
            });
          }
        }
        return rows.sort((a, b) => a.name.localeCompare(b.name) || b.hit_count - a.hit_count);
      }

      throw new Error(`Unhandled all query: ${sql}`);
    }

    #run(sql, args) {
      if (sql === "INSERT INTO source_files(path) VALUES (?)") {
        const row = { id: this.nextIds.sourceFiles++, path: args[0] };
        this.sourceFiles.push(row);
        return { lastInsertRowid: row.id };
      }

      if (sql === "INSERT INTO source_lines(source_file_id, line_number) VALUES (?, ?)") {
        const row = {
          id: this.nextIds.sourceLines++,
          source_file_id: args[0],
          line_number: args[1],
          total_hit_count: 0,
          test_count: 0,
        };
        this.sourceLines.push(row);
        return { lastInsertRowid: row.id };
      }

      if (sql === "UPDATE tests SET report_path = ?, is_integration = ? WHERE id = ?") {
        const row = this.tests.find((entry) => entry.id === args[2]);
        row.report_path = args[0];
        row.is_integration = args[1];
        return { changes: 1 };
      }

      if (sql === "INSERT INTO tests(name, report_path, is_integration) VALUES (?, ?, ?)") {
        const row = {
          id: this.nextIds.tests++,
          name: args[0],
          report_path: args[1],
          is_integration: args[2],
        };
        this.tests.push(row);
        return { lastInsertRowid: row.id };
      }

      if (sql === "INSERT OR REPLACE INTO coverage_lines(test_id, source_line_id, hit_count) VALUES (?, ?, ?)") {
        const existing = this.coverageLines.find(
          (entry) => entry.test_id === args[0] && entry.source_line_id === args[1],
        );
        if (existing) {
          existing.hit_count = args[2];
          return { changes: 1 };
        }
        const row = {
          id: this.nextIds.coverageLines++,
          test_id: args[0],
          source_line_id: args[1],
          hit_count: args[2],
        };
        this.coverageLines.push(row);
        return { lastInsertRowid: row.id };
      }

      if (sql === "UPDATE source_lines SET total_hit_count = total_hit_count + ?, test_count = test_count + 1 WHERE id = ?") {
        const row = this.sourceLines.find((entry) => entry.id === args[1]);
        row.total_hit_count += args[0];
        row.test_count += 1;
        return { changes: 1 };
      }

      throw new Error(`Unhandled run query: ${sql}`);
    }

    #combinedCoverage() {
      return this.sourceFiles
        .map((file) => {
          const lines = this.sourceLines.filter((line) => line.source_file_id === file.id);
          const covered = lines.filter((line) => line.total_hit_count > 0).length;
          const uncovered = lines.filter((line) => line.total_hit_count === 0).length;
          const lineCount = lines.length;
          return {
            file_path: file.path,
            line_count: lineCount,
            covered_lines: covered,
            uncovered_lines: uncovered,
            coverage_percent: lineCount === 0 ? 0 : Number(((covered / lineCount) * 100).toFixed(1)),
          };
        })
        .sort((a, b) => a.file_path.localeCompare(b.file_path));
    }
  }

  return { default: FakeDatabase };
});

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  buildDatabase,
  reportRedundancy,
  reportUnexpectedCoverage,
  summarizeCoverage,
} from "../../../scripts/coverage-audit.mjs";

function makeTempRoot() {
  return mkdtempSync(join(tmpdir(), "glaze-coverage-audit-"));
}

function writeCoverageFile(root: string, relativePath: string, contents: string) {
  const fullPath = join(root, relativePath);
  mkdirSync(resolve(fullPath, ".."), { recursive: true });
  writeFileSync(fullPath, contents);
  return fullPath;
}

function fakeLcov(testName: string, lines: Array<[number, number]>, filePath: string) {
  return [
    `TN:${testName}`,
    `SF:${filePath}`,
    ...lines.map(([lineNumber, hitCount]) => `DA:${lineNumber},${hitCount}`),
    "end_of_record",
    "",
  ].join("\n");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("coverage audit tool", () => {
  it("ingests LCOV files and summarizes coverage", async () => {
    const root = makeTempRoot();
    try {
      const reportsDir = join(root, "reports");
      const coveragePath = writeCoverageFile(
        reportsDir,
        "coverage.dat",
        fakeLcov(
          "unit",
          [
            [1, 1],
            [2, 0],
            [3, 0],
          ],
          "web/src/foo.ts",
        ),
      );

      const dbPath = join(root, "audit.sqlite3");
      const db = await buildDatabase({
        command: "summary",
        dbPath,
        reports: [reportsDir],
        integrationRegex: /integration/i,
        limit: 10,
        minFiles: 8,
        minBuckets: 3,
      });

      try {
        expect(coveragePath).toContain("coverage.dat");

        expect(summarizeCoverage(db)).toEqual({
          files: 1,
          lines: 3,
          tests: 1,
          coveredLines: 1,
        });

        expect(
          db
            .prepare(
              `SELECT file_path, line_count, covered_lines, uncovered_lines, coverage_percent
               FROM combined_file_coverage`,
            )
            .get(),
        ).toEqual({
          file_path: "web/src/foo.ts",
          line_count: 3,
          covered_lines: 1,
          uncovered_lines: 2,
          coverage_percent: 33.3,
        });
      } finally {
        db.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports redundant coverage when multiple tests hit the same line", async () => {
    const root = makeTempRoot();
    try {
      const unitDir = join(root, "unit-a");
      const unitDir2 = join(root, "unit-b");
      writeCoverageFile(
        unitDir,
        "coverage.dat",
        fakeLcov("unit-a", [
          [1, 1],
          [2, 0],
        ], "web/src/redundant.ts"),
      );
      writeCoverageFile(
        unitDir2,
        "coverage.dat",
        fakeLcov("unit-b", [
          [1, 1],
          [2, 1],
        ], "web/src/redundant.ts"),
      );

      const db = await buildDatabase({
        command: "redundant",
        dbPath: join(root, "audit.sqlite3"),
        reports: [unitDir, unitDir2],
        integrationRegex: /integration/i,
        limit: 10,
        minFiles: 8,
        minBuckets: 3,
      });

      try {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        reportRedundancy(db, 10);
        expect(logSpy.mock.calls.flat().join("\n")).toContain(
          "web/src/redundant.ts:1 is hit by 2 tests",
        );
      } finally {
        db.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags broad non-integration coverage and skips integration-tagged reports", async () => {
    const root = makeTempRoot();
    try {
      const unitDir = join(root, "unit");
      const integrationDir = join(root, "integration");
      const lcov = [
        fakeLcov("unit", [[1, 1]], "web/src/components/Button.ts"),
        fakeLcov("unit", [[1, 1]], "web/src/pages/Landing.ts"),
        fakeLcov("unit", [[1, 1]], "api/foo.py"),
      ].join("\n");

      writeCoverageFile(unitDir, "coverage.dat", lcov);
      writeCoverageFile(integrationDir, "coverage.dat", lcov);

      const db = await buildDatabase({
        command: "unexpected",
        dbPath: join(root, "audit.sqlite3"),
        reports: [unitDir, integrationDir],
        integrationRegex: /integration/i,
        limit: 10,
        minFiles: 3,
        minBuckets: 3,
      });

      try {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        reportUnexpectedCoverage(db, 10, 3, 3, /integration/i);
        const output = logSpy.mock.calls.flat().join("\n");
        expect(output).toContain(join(root, "unit"));
        expect(output).not.toContain(join(root, "integration"));
      } finally {
        db.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
