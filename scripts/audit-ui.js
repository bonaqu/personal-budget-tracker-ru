const fs = require("node:fs");
const path = require("node:path");
const iconv = require("iconv-lite");

const rootDir = process.cwd();
const styleDir = path.join(rootDir, "styles");
const scriptDir = path.join(rootDir, "scripts");
const indexFile = path.join(rootDir, "index.html");

const trackedDeadHookAttrs = new Set([
  "action",
  "analytics-view",
  "close-modal",
  "journal-action",
  "picker-toggle",
  "section-sort-btn",
  "setting-action",
  "settings-quick",
  "tab-target"
]);

function toProjectPath(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, "/");
}

function readUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function listFiles(dirPath, extension) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  return fs.readdirSync(dirPath)
    .filter((name) => name.endsWith(extension))
    .map((name) => path.join(dirPath, name))
    .sort();
}

function buildLineIndex(text) {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") {
      lineStarts.push(i + 1);
    }
  }
  return lineStarts;
}

function lineOf(index, lineStarts) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= index) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return high + 1;
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
}

function collectCssSelectorDuplicates(filePath) {
  const source = readUtf8(filePath);
  const lineStarts = buildLineIndex(source);
  const scrubbed = source.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "));
  const contexts = [];
  const blockTypes = [];
  const selectorMap = new Map();
  let segmentStart = 0;

  for (let index = 0; index < scrubbed.length; index += 1) {
    const char = scrubbed[index];
    if (char === "{") {
      const prelude = normalizeWhitespace(scrubbed.slice(segmentStart, index));
      if (prelude) {
        if (prelude.startsWith("@")) {
          contexts.push(prelude);
          blockTypes.push({ type: "at" });
        } else {
          blockTypes.push({
            type: "rule",
            selector: prelude,
            context: contexts.join(" > "),
            line: lineOf(segmentStart, lineStarts),
            bodyStart: index + 1
          });
        }
      } else {
        blockTypes.push({ type: "unknown" });
      }
      segmentStart = index + 1;
      continue;
    }
    if (char === "}") {
      const lastBlock = blockTypes.pop();
      if (lastBlock?.type === "at") {
        contexts.pop();
      } else if (lastBlock?.type === "rule") {
        const body = normalizeWhitespace(scrubbed.slice(lastBlock.bodyStart, index))
          .replace(/\s*;\s*/g, "; ")
          .trim();
        const key = `${lastBlock.context}||${lastBlock.selector}||${body}`;
        const entries = selectorMap.get(key) || [];
        entries.push({
          selector: lastBlock.selector,
          context: lastBlock.context,
          line: lastBlock.line
        });
        selectorMap.set(key, entries);
      }
      segmentStart = index + 1;
    }
  }

  return Array.from(selectorMap.values())
    .filter((entries) => entries.length > 1)
    .map((entries) => ({
      file: toProjectPath(filePath),
      selector: entries[0].selector,
      context: entries[0].context || "root",
      lines: entries.map((entry) => entry.line)
    }));
}

function collectLiteralDeclarations(files) {
  const ids = new Map();
  const data = new Map();

  files.forEach((filePath) => {
    const source = readUtf8(filePath);
    const lineStarts = buildLineIndex(source);
    const idPattern = /\bid=(["'])([^"'`]+)\1/g;
    const dataPattern = /\bdata-([a-z0-9-]+)=(["'])([^"'`]+)\2/gi;
    let match;

    while ((match = idPattern.exec(source))) {
      const [, , id] = match;
      if (!ids.has(id)) {
        ids.set(id, []);
      }
      ids.get(id).push({
        file: toProjectPath(filePath),
        line: lineOf(match.index, lineStarts)
      });
    }

    while ((match = dataPattern.exec(source))) {
      const [, attr, , value] = match;
      const key = `${attr}=${value}`;
      if (!data.has(key)) {
        data.set(key, []);
      }
      data.get(key).push({
        attr,
        value,
        file: toProjectPath(filePath),
        line: lineOf(match.index, lineStarts)
      });
    }
  });

  return { ids, data };
}

function collectLiteralUsages(files) {
  const ids = new Map();
  const data = new Map();
  const dataAttrs = new Set();

  const usagePatterns = [
    { type: "id", regex: /Utils\.\$\(\s*["'`]([^"'`]+)["'`]\s*\)/g },
    { type: "id", regex: /getElementById\(\s*["'`]([^"'`]+)["'`]\s*\)/g },
    { type: "id", regex: /querySelector(?:All)?\(\s*["'`]#([A-Za-z][\w:-]*)["'`]\s*\)/g },
    { type: "id", regex: /closest\(\s*["'`]#([A-Za-z][\w:-]*)["'`]\s*\)/g },
    { type: "data", regex: /\[\s*data-([a-z0-9-]+)=["'`]([^"'`]+)["'`]\s*\]/gi },
    { type: "data-attr", regex: /\[\s*data-([a-z0-9-]+)\s*\]/gi }
  ];

  files.forEach((filePath) => {
    const source = readUtf8(filePath);
    const lineStarts = buildLineIndex(source);

    usagePatterns.forEach(({ type, regex }) => {
      let match;
      while ((match = regex.exec(source))) {
        if (type === "id") {
          const id = match[1];
          if (!ids.has(id)) {
            ids.set(id, []);
          }
          ids.get(id).push({
            file: toProjectPath(filePath),
            line: lineOf(match.index, lineStarts)
          });
          continue;
        }
        if (type === "data-attr") {
          dataAttrs.add(match[1]);
          continue;
        }
        const [, attr, value] = match;
        const key = `${attr}=${value}`;
        if (!data.has(key)) {
          data.set(key, []);
        }
        data.get(key).push({
          attr,
          value,
          file: toProjectPath(filePath),
          line: lineOf(match.index, lineStarts)
        });
      }
    });
  });

  return { ids, data, dataAttrs };
}

function formatLocations(entries) {
  return entries.map((entry) => `${entry.file}:${entry.line}`).join(", ");
}

function collectMojibakeLines(filePath) {
  const source = readUtf8(filePath);
  const lines = source.split(/\r?\n/);
  const brokenSignature = /(?:Р.|С.|в[Ђ„†]){3,}/u;

  return lines
    .map((line, index) => {
      if (!/[^\x00-\x7F]/.test(line)) {
        return null;
      }
      const converted = iconv.decode(iconv.encode(line, "win1251"), "utf8");
      if (converted === line) {
        return null;
      }
      const originalWeird = brokenSignature.test(line) ? 1 : 0;
      const convertedWeird = brokenSignature.test(converted) ? 1 : 0;
      const originalCyr = (line.match(/[А-Яа-яЁё]/g) || []).length;
      const convertedCyr = (converted.match(/[А-Яа-яЁё]/g) || []).length;
      const likelyBroken = originalWeird > 0;
      if (!likelyBroken) {
        return null;
      }
      if (convertedWeird > originalWeird) {
        return null;
      }
      if (convertedCyr + 1 < originalCyr) {
        return null;
      }
      return {
        file: toProjectPath(filePath),
        line: index + 1,
        text: line.trim()
      };
    })
    .filter(Boolean);
}

function runAudit() {
  const cssFiles = listFiles(styleDir, ".css");
  const jsFiles = listFiles(scriptDir, ".js");
  const markupFiles = [indexFile, ...jsFiles];

  const duplicateSelectors = cssFiles.flatMap((filePath) => collectCssSelectorDuplicates(filePath));
  const mojibakeLines = [...cssFiles, ...markupFiles]
    .flatMap((filePath) => collectMojibakeLines(filePath));
  const declarations = collectLiteralDeclarations(markupFiles);
  const usages = collectLiteralUsages(jsFiles);

  const missingIdHooks = Array.from(usages.ids.entries())
    .filter(([id]) => !declarations.ids.has(id))
    .map(([id, entries]) => ({
      kind: "missing-id",
      hook: `#${id}`,
      locations: formatLocations(entries)
    }));

  const missingDataHooks = Array.from(usages.data.entries())
    .filter(([key]) => !declarations.data.has(key))
    .map(([key, entries]) => {
      const [attr, value] = key.split("=");
      return {
        kind: "missing-data",
        hook: `data-${attr}="${value}"`,
        locations: formatLocations(entries)
      };
    });

  const deadDataHooks = Array.from(declarations.data.entries())
    .filter(([key, entries]) => {
      const attr = entries[0]?.attr || "";
      const value = entries[0]?.value || "";
      if (value.includes("${")) {
        return false;
      }
      return trackedDeadHookAttrs.has(attr) && !usages.dataAttrs.has(attr) && !usages.data.has(key);
    })
    .map(([key, entries]) => {
      const [attr, value] = key.split("=");
      return {
        kind: "dead-data",
        hook: `data-${attr}="${value}"`,
        locations: formatLocations(entries)
      };
    });

  const problems = [];

  duplicateSelectors.forEach((item) => {
    problems.push(`[duplicate-selector] ${item.file} (${item.context}) :: ${item.selector} -> lines ${item.lines.join(", ")}`);
  });

  mojibakeLines.forEach((item) => {
    problems.push(`[mojibake] ${item.file}:${item.line} :: ${item.text}`);
  });

  missingIdHooks.forEach((item) => {
    problems.push(`[missing-hook] ${item.hook} used at ${item.locations}`);
  });

  missingDataHooks.forEach((item) => {
    problems.push(`[missing-hook] ${item.hook} used at ${item.locations}`);
  });

  deadDataHooks.forEach((item) => {
    problems.push(`[dead-hook] ${item.hook} declared at ${item.locations}`);
  });

  if (!problems.length) {
    console.log("UI audit passed: no exact duplicate selectors or dead DOM hooks found.");
    return;
  }

  console.log("UI audit found issues:");
  problems.forEach((line) => console.log(`- ${line}`));
  process.exitCode = 1;
}

runAudit();
