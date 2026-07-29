import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const ignoredDirectories = new Set([".git", "node_modules", "upload", "dist", "coverage"]);
const textExtensions = new Set([".css", ".html", ".js", ".json", ".md", ".mjs", ".sql", ".ts", ".yml", ".yaml"]);

function collectFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (ignoredDirectories.has(entry.name)) return [];
    const filePath = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(filePath) : [filePath];
  });
}

function relative(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8").replaceAll("\r\n", "\n");
}

function normalizedHash(source) {
  const normalized = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

const files = collectFiles(root);
const textFiles = files.filter(file => textExtensions.has(path.extname(file).toLowerCase()));
const records = textFiles.map(file => {
  const source = readText(file);
  return {
    path: relative(file),
    extension: path.extname(file).toLowerCase(),
    bytes: Buffer.byteLength(source),
    lines: source.split("\n").length,
    source,
  };
});

const exactHashes = new Map();
const normalizedHashes = new Map();
const exactDuplicates = [];
const normalizedDuplicates = [];

for (const record of records) {
  if (!record.source.trim()) continue;
  const exactHash = crypto.createHash("sha256").update(record.source).digest("hex");
  const exactMatch = exactHashes.get(exactHash);
  if (exactMatch) exactDuplicates.push([exactMatch, record.path]);
  else exactHashes.set(exactHash, record.path);

  if (![".css", ".js", ".mjs", ".sql", ".ts"].includes(record.extension)) continue;
  const cleanHash = normalizedHash(record.source);
  const normalizedMatch = normalizedHashes.get(cleanHash);
  if (normalizedMatch) normalizedDuplicates.push([normalizedMatch, record.path]);
  else normalizedHashes.set(cleanHash, record.path);
}

const rootSupabaseSql = records
  .filter(record => /^supabase\/[^/]+\.sql$/.test(record.path))
  .map(record => record.path);
const migrationSql = records
  .filter(record => record.path.startsWith("supabase/migrations/") && record.extension === ".sql")
  .map(record => record.path);
const largeFiles = records
  .filter(record => record.lines >= 700 || record.bytes >= 100_000)
  .sort((left, right) => right.bytes - left.bytes)
  .map(({ path: filePath, lines, bytes }) => ({ path: filePath, lines, bytes }));
const inlineHtmlCode = records
  .filter(record => record.extension === ".html")
  .flatMap(record => {
    const findings = [];
    if (/<style\b|\sstyle\s*=/i.test(record.source)) findings.push("inline CSS");
    if (/<script\b(?![^>]*\bsrc\s*=)[^>]*>/i.test(record.source)) findings.push("inline JavaScript");
    if (/\son[a-z]+\s*=/i.test(record.source)) findings.push("inline event handler");
    return findings.length ? [{ path: record.path, findings }] : [];
  });

const extensionSummary = Object.values(records.reduce((summary, record) => {
  const key = record.extension || "без расширения";
  summary[key] ??= { extension: key, files: 0, lines: 0, bytes: 0 };
  summary[key].files += 1;
  summary[key].lines += record.lines;
  summary[key].bytes += record.bytes;
  return summary;
}, {})).sort((left, right) => right.bytes - left.bytes);

const report = {
  generatedAt: new Date().toISOString(),
  totals: {
    files: files.length,
    textFiles: records.length,
    lines: records.reduce((sum, record) => sum + record.lines, 0),
    bytes: records.reduce((sum, record) => sum + record.bytes, 0),
  },
  extensionSummary,
  exactDuplicates,
  normalizedDuplicates,
  largeFiles,
  inlineHtmlCode,
  supabase: {
    rootSqlFiles: rootSupabaseSql,
    migrationFiles: migrationSql.length,
  },
};

const outputDirectory = path.join(root, "reports");
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, "project-audit.json"), `${JSON.stringify(report, null, 2)}\n`);

const markdown = [
  "# Автоматический аудит HarvestHub",
  "",
  `Создан: ${report.generatedAt}`,
  "",
  `- Всего файлов: ${report.totals.files}`,
  `- Текстовых файлов: ${report.totals.textFiles}`,
  `- Строк текста и кода: ${report.totals.lines}`,
  `- Точных копий: ${exactDuplicates.length}`,
  `- Совпадений после удаления комментариев и пробелов: ${normalizedDuplicates.length}`,
  `- Крупных файлов: ${largeFiles.length}`,
  `- HTML-файлов со встроенным кодом: ${inlineHtmlCode.length}`,
  `- Исторических SQL-файлов вне migrations: ${rootSupabaseSql.length}`,
  `- Миграций: ${migrationSql.length}`,
  "",
  "Полные данные находятся в `reports/project-audit.json`.",
  "",
].join("\n");
fs.writeFileSync(path.join(outputDirectory, "project-audit.md"), markdown);

console.log(markdown.trim());
