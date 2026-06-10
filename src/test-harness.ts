#!/usr/bin/env node
/**
 * Phase 4 verification harness — exercises parsers, cache, and security gates
 * without starting the MCP stdio transport.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { CacheStore } from "./cache/store.js";
import { ResourceRegistry } from "./cache/registry.js";
import { resolveSafePath } from "./lib/paths.js";
import { fetchOpenApiDocument } from "./parsers/openapi/fetcher.js";
import { buildFlattenUri } from "./resources/flatten-uri.js";
import { parseLocalTypes } from "./tools/parse-local-types.js";

const PASS = "PASS";
const FAIL = "FAIL";

interface TestResult {
  name: string;
  status: typeof PASS | typeof FAIL;
  detail: string;
}

const results: TestResult[] = [];

function log(line: string): void {
  console.log(line);
}

function record(name: string, status: typeof PASS | typeof FAIL, detail: string): void {
  results.push({ name, status, detail });
  log(`[${status}] ${name}`);
  log(`       ${detail}`);
}

function assertThrows(
  name: string,
  fn: () => unknown,
  expectedSubstring: string,
): void {
  try {
    fn();
    record(name, FAIL, `Expected an error containing "${expectedSubstring}"`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(expectedSubstring)) {
      record(name, PASS, `Blocked as expected — ${message}`);
      return;
    }
    record(
      name,
      FAIL,
      `Threw unexpected error — ${message}`,
    );
  }
}

async function assertThrowsAsync(
  name: string,
  fn: () => Promise<unknown>,
  expectedSubstring: string,
): Promise<void> {
  try {
    await fn();
    record(name, FAIL, `Expected an error containing "${expectedSubstring}"`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(expectedSubstring)) {
      record(name, PASS, `Blocked as expected — ${message}`);
      return;
    }
    record(name, FAIL, `Threw unexpected error — ${message}`);
  }
}

function resetSingletons(): void {
  CacheStore.resetInstance();
  ResourceRegistry.resetInstance();
}

function runTraversalTests(workspaceRoot: string): void {
  log("\n── Traversal Test ──");

  assertThrows(
    "resolveSafePath rejects .. segment",
    () => resolveSafePath(workspaceRoot, "../../../etc/passwd"),
    'forbidden ".." segment',
  );

  assertThrows(
    "parse_local_types rejects traversal paths",
    () =>
      parseLocalTypes({
        packageName: "../../../etc/passwd",
        paths: ["../../../etc/passwd"],
      }),
    'forbidden ".." segment',
  );
}

async function runSsrfTest(): Promise<void> {
  log("\n── SSRF Boundary Test ──");

  await assertThrowsAsync(
    "fetch_openapi_schema blocks loopback host",
    () => fetchOpenApiDocument("http://127.0.0.1:9000/spec.yaml"),
    "private or loopback hosts is not allowed",
  );
}

function runLiveParseTest(workspaceRoot: string): void {
  log("\n── Live Parse Test ──");

  const fixtureDir = path.join(workspaceRoot, "fixtures");
  const fixtureRelative = "fixtures/harness-mock.d.ts";
  const fixtureAbsolute = path.join(workspaceRoot, fixtureRelative);

  mkdirSync(fixtureDir, { recursive: true });
  writeFileSync(
    fixtureAbsolute,
    [
      "/** Harness fixture for Phase 4 verification */",
      "export interface HarnessWidget {",
      "  id: string;",
      "  label: string;",
      "}",
      "export type HarnessMode = \"read\" | \"write\";",
      "",
    ].join("\n"),
    "utf8",
  );

  const packageName = "harness-mock";
  const expectedUri = buildFlattenUri("types", packageName);

  try {
    const result = parseLocalTypes({
      packageName,
      paths: [fixtureRelative],
    });

    const cache = CacheStore.getInstance();
    const entry = cache.get(expectedUri);

    if (!entry) {
      record(
        "CacheStore contains flatten://types resource",
        FAIL,
        `Missing cache entry for ${expectedUri}`,
      );
      return;
    }

    if (result.uri !== expectedUri) {
      record(
        "parse_local_types returns expected URI",
        FAIL,
        `Expected ${expectedUri}, got ${result.uri}`,
      );
      return;
    }

    if (!entry.content.includes("HarnessWidget")) {
      record(
        "Flattened output includes exported interface",
        FAIL,
        "HarnessWidget not found in cached content",
      );
      return;
    }

    if (!entry.content.includes("HarnessMode")) {
      record(
        "Flattened output includes exported type alias",
        FAIL,
        "HarnessMode not found in cached content",
      );
      return;
    }

    record(
      "CacheStore contains flatten://types resource",
      PASS,
      `${expectedUri} (revision ${entry.revision})`,
    );
    record(
      "Flattened output includes exported interface",
      PASS,
      "Found HarnessWidget in cached plain-text payload",
    );
    record(
      "Flattened output includes exported type alias",
      PASS,
      "Found HarnessMode in cached plain-text payload",
    );

    log("\n       Cached excerpt:");
    for (const line of entry.content.split("\n").slice(0, 12)) {
      log(`       ${line}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record("Live parse pipeline", FAIL, message);
  }
}

async function main(): Promise<void> {
  const workspaceRoot = path.join(
    os.tmpdir(),
    `type-cast-harness-${Date.now().toString()}`,
  );

  mkdirSync(workspaceRoot, { recursive: true });
  process.env["TYPE_CAST_WORKSPACE"] = workspaceRoot;
  resetSingletons();

  log("type-cast Phase 4 verification harness");
  log(`workspace: ${workspaceRoot}`);

  try {
    runTraversalTests(workspaceRoot);
    await runSsrfTest();
    runLiveParseTest(workspaceRoot);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }

  const failed = results.filter((r) => r.status === FAIL);
  log("\n── Summary ──");
  log(`total: ${results.length}  passed: ${results.length - failed.length}  failed: ${failed.length}`);

  if (failed.length > 0) {
    log("\nFailed checks:");
    for (const failure of failed) {
      log(`  - ${failure.name}: ${failure.detail}`);
    }
    process.exit(1);
  }

  log("\nAll security gates and parse pipeline checks passed.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : error;
  console.error("Harness fatal error:", message);
  process.exit(1);
});
