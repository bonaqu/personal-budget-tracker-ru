"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");

const rootDir = process.cwd();

function resolveWorkerPath() {
  const candidate = fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(rootDir, entry.name, "worker_edited.txt"))
    .find((filePath) => fs.existsSync(filePath));

  return candidate || path.join(rootDir, "worker_edited.txt");
}

const workerPath = resolveWorkerPath();
const idealWorkerPath = path.join(rootDir, "privat_исходники для сверки", "worker_prod_ideal.js");

function assert(condition, message, details = {}) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

function assertValidSyntax(source) {
  const tmpFile = path.join(os.tmpdir(), `codex-worker-audit-${Date.now()}.mjs`);
  fs.writeFileSync(tmpFile, source, "utf8");

  try {
    childProcess.execFileSync(process.execPath, ["--check", tmpFile], {
      stdio: "pipe"
    });
  } catch (error) {
    throw Object.assign(
      new Error("Reference worker has invalid JavaScript syntax"),
      {
        details: {
          message: error?.stderr?.toString?.("utf8")?.trim?.() || error?.message || String(error)
        }
      }
    );
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

function auditFile(filePath, requiredSnippets) {
  assert(fs.existsSync(filePath), "Reference worker file not found", { workerPath: filePath });
  const source = fs.readFileSync(filePath, "utf8");
  assert(source.trim().length > 0, "Reference worker file is empty", { workerPath: filePath });
  const missing = requiredSnippets.filter((snippet) => !source.includes(snippet));
  assert(missing.length === 0, "Reference worker is missing required secure markers", {
    workerPath: filePath,
    missing
  });
  assertValidSyntax(source);
  return {
    workerPath: filePath,
    requiredMarkers: requiredSnippets.length
  };
}

function main() {
  const baseRequiredSnippets = [
    'service: "personal-budget-worker"',
    'case "POST /register"',
    'case "POST /login"',
    'case "GET /load"',
    'case "POST /save"',
    'case "POST /logout"',
    '"TOKEN_REQUIRED"',
    '"INVALID_SESSION"',
    '"INVALID_CREDENTIALS"',
    "PBKDF2",
    "sessionTokenHash",
    "requireAuthorizedUser",
    "Authorization"
  ];

  const idealRequiredSnippets = [
    ...baseRequiredSnippets,
    "CORS_ALLOW_ORIGINS",
    "X-Request-Id",
    "stableJson",
    "UPSTREAM_COMMIT_NOT_VISIBLE"
  ];

  const results = [
    auditFile(workerPath, baseRequiredSnippets)
  ];

  if (fs.existsSync(idealWorkerPath)) {
    results.push(auditFile(idealWorkerPath, idealRequiredSnippets));
  }

  console.log(JSON.stringify({
    ok: true,
    checkedAt: new Date().toISOString(),
    files: results
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    workerPath,
    message: error.message,
    details: error.details || null
  }, null, 2));
  process.exitCode = 1;
}
