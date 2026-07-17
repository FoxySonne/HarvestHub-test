import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const ignoredDirectories = new Set([".git", "node_modules", "upload"]);

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

function resolveLocalReference(sourceFile, reference) {
  const cleanReference = reference.split(/[?#]/)[0];
  if (!cleanReference || /^(?:https?:|data:|mailto:|#)/.test(reference)) return null;
  return path.resolve(path.dirname(sourceFile), cleanReference);
}

const files = collectFiles(root);
const javascriptFiles = files.filter(file => file.endsWith(".js") || file.endsWith(".mjs"));
const cssFiles = files.filter(file => file.endsWith(".css"));
const htmlFiles = files.filter(file => file.endsWith(".html"));
const errors = [];

function validateCssBraces(file, source) {
  let depth = 0;
  let quote = "";
  let inComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (inComment) {
      if (character === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
      continue;
    }

    if (character === "/" && next === "*") {
      inComment = true;
      index += 1;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth < 0) {
        errors.push(`${relative(file)}: лишняя закрывающая скобка CSS`);
        return;
      }
    }
  }

  if (inComment) errors.push(`${relative(file)}: незакрытый комментарий CSS`);
  if (quote) errors.push(`${relative(file)}: незакрытая строка CSS`);
  if (depth > 0) errors.push(`${relative(file)}: не хватает ${depth} закрывающих скобок CSS`);
}

for (const file of javascriptFiles) {
  const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (check.status !== 0) errors.push(`${relative(file)}: ${check.stderr.trim()}`);

  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/(?:import|export)\s+(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g)) {
    const reference = match[1];
    if (!reference.startsWith(".")) continue;
    const target = resolveLocalReference(file, reference);
    if (target && !fs.existsSync(target)) errors.push(`${relative(file)}: не найден импорт ${reference}`);
  }
}

for (const file of cssFiles) {
  const source = fs.readFileSync(file, "utf8");
  validateCssBraces(file, source);
  for (const match of source.matchAll(/@import\s+(?:url\()?['"]?([^'")\s]+)["']?\)?/g)) {
    const reference = match[1];
    const target = resolveLocalReference(file, reference);
    if (target && !fs.existsSync(target)) errors.push(`${relative(file)}: не найден CSS ${reference}`);
  }
}

for (const file of htmlFiles) {
  const source = fs.readFileSync(file, "utf8");

  if (/<style\b/i.test(source) || /\sstyle\s*=/i.test(source)) {
    errors.push(`${relative(file)}: CSS должен находиться в отдельном файле`);
  }
  if (/<script\b(?![^>]*\bsrc\s*=)[^>]*>/i.test(source)) {
    errors.push(`${relative(file)}: JavaScript должен находиться в отдельном файле`);
  }
  if (/\son[a-z]+\s*=/i.test(source)) {
    errors.push(`${relative(file)}: встроенный обработчик события должен находиться в JS`);
  }

  for (const match of source.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const reference = match[1];
    const target = resolveLocalReference(file, reference);
    if (target && !fs.existsSync(target)) errors.push(`${relative(file)}: не найден ресурс ${reference}`);
  }

  for (const match of source.matchAll(/data-page-path=["']([^"']+)["']/g)) {
    const target = path.resolve(root, "pages", match[1]);
    if (!fs.existsSync(target)) errors.push(`${relative(file)}: не найдена страница ${match[1]}`);
  }
}

const duplicateCandidates = [...javascriptFiles, ...cssFiles];
const contentHashes = new Map();
for (const file of duplicateCandidates) {
  const source = fs.readFileSync(file);
  if (source.length === 0) continue;
  const hash = crypto.createHash("sha256").update(source).digest("hex");
  const duplicate = contentHashes.get(hash);
  if (duplicate) errors.push(`${relative(file)}: точная копия ${relative(duplicate)}`);
  else contentHashes.set(hash, file);
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Проверено: ${javascriptFiles.length} JS, ${cssFiles.length} CSS, ${htmlFiles.length} HTML.`);
