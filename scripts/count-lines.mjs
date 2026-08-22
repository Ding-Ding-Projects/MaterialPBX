#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { TextDecoder } from "node:util";

const CATEGORY_ORDER = [
  "Source",
  "Tests and verification",
  "Styles and markup",
  "Documentation",
  "Configuration and data",
  "Generated",
  "Excluded",
];

const PROJECT_CATEGORIES = new Set([
  "Source",
  "Tests and verification",
  "Styles and markup",
  "Documentation",
  "Configuration and data",
]);

const LOCKFILE_NAMES = new Set(["pnpm-lock.yaml", "package-lock.json", "npm-shrinkwrap.json", "yarn.lock"]);
const GENERATED_PATHS = [
  /^assets\/generated\//,
  /^docs\/screenshots\/.*\.(?:gif|jpe?g|png|webp)$/i,
  /^site\/public\/social-preview\.png$/,
  /^social-preview\.png$/,
];
const TEST_PATHS = [
  /(^|\/)tests?\//,
  /(^|\/)__tests__\//,
  /\.(?:test|spec)\.[^.]+$/,
  /^scripts\/check-[^/]+\.mjs$/,
];
const SOURCE_EXTENSIONS = new Set([
  ".bat",
  ".c",
  ".cc",
  ".cjs",
  ".cpp",
  ".cs",
  ".go",
  ".h",
  ".hpp",
  ".java",
  ".js",
  ".jsx",
  ".mjs",
  ".php",
  ".ps1",
  ".py",
  ".rb",
  ".rs",
  ".service",
  ".sh",
  ".ts",
  ".tsx",
]);
const STYLE_MARKUP_EXTENSIONS = new Set([".css", ".htm", ".html", ".scss", ".svg", ".vue"]);
const DOCUMENTATION_EXTENSIONS = new Set([".md", ".mdx", ".rst"]);
const CONFIGURATION_EXTENSIONS = new Set([
  ".conf",
  ".env",
  ".example",
  ".json",
  ".jsonc",
  ".toml",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

function runGit(args, options = {}) {
  return execFileSync("git", args, {
    cwd: options.cwd,
    encoding: options.encoding ?? "utf8",
    maxBuffer: 128 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function classifyPath(filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  const baseName = path.posix.basename(normalized);
  const extension = path.posix.extname(baseName).toLowerCase();

  if (LOCKFILE_NAMES.has(baseName)) return { category: "Excluded", reason: "dependency lockfile" };
  if (GENERATED_PATHS.some((pattern) => pattern.test(normalized))) {
    return { category: "Generated", reason: "generated asset" };
  }
  if (TEST_PATHS.some((pattern) => pattern.test(normalized))) {
    return { category: "Tests and verification", reason: "test or executable contract check" };
  }
  if (SOURCE_EXTENSIONS.has(extension) || baseName === "Dockerfile") {
    return { category: "Source", reason: "application, service, deployment, or build source" };
  }
  if (STYLE_MARKUP_EXTENSIONS.has(extension)) {
    return { category: "Styles and markup", reason: "user-interface style or markup" };
  }
  if (DOCUMENTATION_EXTENSIONS.has(extension) || baseName === "LICENSE") {
    return { category: "Documentation", reason: "project documentation or legal text" };
  }
  if (
    CONFIGURATION_EXTENSIONS.has(extension) ||
    baseName.startsWith(".") ||
    baseName === "CODEOWNERS"
  ) {
    return { category: "Configuration and data", reason: "configuration or structured project data" };
  }

  throw new Error(`Unclassified tracked path: ${normalized}`);
}

function countLogicalLines(buffer) {
  if (buffer.length === 0) return { total: 0, nonblank: 0, binary: false };
  if (buffer.includes(0)) return { total: 0, nonblank: 0, binary: true };

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return { total: 0, nonblank: 0, binary: true };
  }

  const lines = text.split(/\r\n|\n|\r/);
  if (/\r\n$|\n$|\r$/.test(text)) lines.pop();
  return {
    total: lines.length,
    nonblank: lines.filter((line) => line.trim().length > 0).length,
    binary: false,
  };
}

function isAgentCommit(metadata) {
  const normalized = metadata.toLowerCase();
  return (
    normalized.includes("claude fable 5") ||
    normalized.includes("noreply@anthropic.com") ||
    /^author:(?:.*(?:\[bot\]|automation|chatgpt|codex))/m.test(normalized) ||
    /^co-authored-by:\s*(?:claude|chatgpt|codex|.*\[bot\])/m.test(normalized)
  );
}

function commitIsAgent(commit, cwd, cache) {
  if (!cache.has(commit)) {
    const details = runGit(["show", "-s", "--format=author:%an <%ae>%n%B", commit], { cwd });
    cache.set(commit, isAgentCommit(details));
  }
  return cache.get(commit);
}

function blameFile(filePath, revision, cwd, commitCache) {
  const output = runGit(["blame", "--line-porcelain", "--root", revision, "--", filePath], { cwd });
  const attribution = { agent: 0, people: 0, total: 0, agentNonblank: 0, peopleNonblank: 0, nonblank: 0 };
  let currentCommit = null;

  for (const line of output.split("\n")) {
    const header = /^([0-9a-f]{40}) \d+ \d+(?: \d+)?$/.exec(line);
    if (header) {
      currentCommit = header[1];
      continue;
    }
    if (!line.startsWith("\t")) continue;
    if (!currentCommit) throw new Error(`Blame output for ${filePath} contains a line without a commit.`);

    const agentOwned = commitIsAgent(currentCommit, cwd, commitCache);
    const nonblank = line.slice(1).trim().length > 0;
    attribution.total += 1;
    attribution.nonblank += nonblank ? 1 : 0;
    if (agentOwned) {
      attribution.agent += 1;
      attribution.agentNonblank += nonblank ? 1 : 0;
    } else {
      attribution.people += 1;
      attribution.peopleNonblank += nonblank ? 1 : 0;
    }
  }

  return attribution;
}

export function buildReport({ revision = "HEAD", cwd = process.cwd() } = {}) {
  const resolvedRevision = runGit(["rev-parse", "--verify", `${revision}^{commit}`], { cwd }).trim();
  const tracked = runGit(["ls-tree", "-r", "--name-only", "-z", resolvedRevision], {
    cwd,
    encoding: "buffer",
  })
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "en"));

  const categories = Object.fromEntries(
    CATEGORY_ORDER.map((name) => [name, { name, files: 0, textFiles: 0, binaryFiles: 0, total: 0, nonblank: 0 }]),
  );
  const exclusionReasons = new Map();
  const commitCache = new Map();
  const attribution = { agent: 0, people: 0, total: 0, agentNonblank: 0, peopleNonblank: 0, nonblank: 0 };

  for (const filePath of tracked) {
    const classification = classifyPath(filePath);
    const buffer = runGit(["show", `${resolvedRevision}:${filePath}`], { cwd, encoding: "buffer" });
    const counts = countLogicalLines(buffer);
    const category = categories[classification.category];
    category.files += 1;
    category.binaryFiles += counts.binary ? 1 : 0;
    category.textFiles += counts.binary ? 0 : 1;
    category.total += counts.total;
    category.nonblank += counts.nonblank;

    if (classification.category === "Excluded") {
      const reason = exclusionReasons.get(classification.reason) ?? { files: 0, total: 0, nonblank: 0 };
      reason.files += 1;
      reason.total += counts.total;
      reason.nonblank += counts.nonblank;
      exclusionReasons.set(classification.reason, reason);
    }

    if (PROJECT_CATEGORIES.has(classification.category) && !counts.binary) {
      const fileAttribution = blameFile(filePath, resolvedRevision, cwd, commitCache);
      if (fileAttribution.total !== counts.total || fileAttribution.nonblank !== counts.nonblank) {
        throw new Error(
          `Attribution arithmetic mismatch for ${filePath}: counted ${counts.total}/${counts.nonblank}, blamed ${fileAttribution.total}/${fileAttribution.nonblank}.`,
        );
      }
      for (const key of Object.keys(attribution)) attribution[key] += fileAttribution[key];
    }
  }

  const project = CATEGORY_ORDER.filter((name) => PROJECT_CATEGORIES.has(name)).reduce(
    (sum, name) => ({
      files: sum.files + categories[name].files,
      total: sum.total + categories[name].total,
      nonblank: sum.nonblank + categories[name].nonblank,
    }),
    { files: 0, total: 0, nonblank: 0 },
  );
  const grand = CATEGORY_ORDER.reduce(
    (sum, name) => ({
      files: sum.files + categories[name].files,
      total: sum.total + categories[name].total,
      nonblank: sum.nonblank + categories[name].nonblank,
    }),
    { files: 0, total: 0, nonblank: 0 },
  );

  if (project.total !== attribution.total || project.nonblank !== attribution.nonblank) {
    throw new Error(
      `Project attribution does not add up: project ${project.total}/${project.nonblank}, attribution ${attribution.total}/${attribution.nonblank}.`,
    );
  }
  if (attribution.agent + attribution.people !== attribution.total) {
    throw new Error("Agent and people attribution totals do not equal the project total.");
  }
  if (attribution.agentNonblank + attribution.peopleNonblank !== attribution.nonblank) {
    throw new Error("Agent and people nonblank attribution totals do not equal the project nonblank total.");
  }

  return {
    schemaVersion: 1,
    revision: resolvedRevision,
    command: `node scripts/count-lines.mjs --revision ${resolvedRevision}`,
    definitions: {
      projectTotal: "Hand-written source, tests and verification, styles and markup, documentation, configuration, and data.",
      grandTotal: "Every tracked text line, including generated and excluded rows; binary files contribute zero lines and remain visible in file counts.",
      attribution: "Surviving lines from git blame at the measured commit. A line is agent-authored when its commit author is a known automation identity or its commit has an agent co-author trailer; every other line is attributed to people.",
    },
    categories: CATEGORY_ORDER.map((name) => categories[name]),
    exclusions: [...exclusionReasons.entries()].map(([reason, value]) => ({ reason, ...value })),
    project,
    grand,
    attribution,
  };
}

export function renderMarkdown(report) {
  const rows = report.categories
    .map(
      (category) =>
        `| ${category.name} | ${category.files.toLocaleString("en-US")} | ${category.total.toLocaleString("en-US")} | ${category.nonblank.toLocaleString("en-US")} |`,
    )
    .join("\n");
  const exclusions = report.exclusions.length
    ? report.exclusions
        .map(
          (entry) =>
            `- ${entry.reason}: ${entry.files.toLocaleString("en-US")} files, ${entry.total.toLocaleString("en-US")} total lines, ${entry.nonblank.toLocaleString("en-US")} nonblank lines.`,
        )
        .join("\n")
    : "- No tracked exclusions at this revision.";

  return `## Line count at \`${report.revision}\`

Reproduce with \`${report.command}\`.

| Category | Files | Total lines | Nonblank lines |
|---|---:|---:|---:|
${rows}
| **Project total** | **${report.project.files.toLocaleString("en-US")}** | **${report.project.total.toLocaleString("en-US")}** | **${report.project.nonblank.toLocaleString("en-US")}** |
| **Grand total** | **${report.grand.files.toLocaleString("en-US")}** | **${report.grand.total.toLocaleString("en-US")}** | **${report.grand.nonblank.toLocaleString("en-US")}** |

Project total: ${report.definitions.projectTotal}

Grand total: ${report.definitions.grandTotal}

### Surviving-line attribution

| Attribution | Total lines | Nonblank lines |
|---|---:|---:|
| Claude Fable 5 / agent-authored | ${report.attribution.agent.toLocaleString("en-US")} | ${report.attribution.agentNonblank.toLocaleString("en-US")} |
| People | ${report.attribution.people.toLocaleString("en-US")} | ${report.attribution.peopleNonblank.toLocaleString("en-US")} |
| **Attribution total** | **${report.attribution.total.toLocaleString("en-US")}** | **${report.attribution.nonblank.toLocaleString("en-US")}** |

${report.definitions.attribution}

### Exclusions

${exclusions}
`;
}

function parseArguments(argv) {
  const options = { revision: "HEAD", jsonOutput: null, markdownOutput: null, format: "markdown" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--revision") options.revision = argv[++index];
    else if (argument === "--json-output") options.jsonOutput = argv[++index];
    else if (argument === "--markdown-output") options.markdownOutput = argv[++index];
    else if (argument === "--format") options.format = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.revision) throw new Error("--revision requires a value.");
  if (!new Set(["json", "markdown"]).has(options.format)) throw new Error("--format must be json or markdown.");
  return options;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const report = buildReport({ revision: options.revision });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = renderMarkdown(report);
  if (options.jsonOutput) writeFileSync(options.jsonOutput, json, "utf8");
  if (options.markdownOutput) writeFileSync(options.markdownOutput, markdown, "utf8");
  if (!options.jsonOutput && !options.markdownOutput) {
    process.stdout.write(options.format === "json" ? json : markdown);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) main();
