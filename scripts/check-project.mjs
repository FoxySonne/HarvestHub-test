import fs from "node:fs";
import path from "node:path";
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

for (const file of javascriptFiles) {
  const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (check.status !== 0) errors.push(`${relative(file)}: ${check.stderr.trim()}`);

  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/(?:import|export)\s+(?:[^'\"]*?\s+from\s+)?["']([^"']+)["']/g)) {
    const reference = match[1];
    if (!reference.startsWith(".")) continue;
    const target = resolveLocalReference(file, reference);
    if (target && !fs.existsSync(target)) errors.push(`${relative(file)}: не найден импорт ${reference}`);
  }
}

for (const file of cssFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/@import\s+(?:url\()?['\"]?([^'\")\s]+)["']?\)?/g)) {
    const reference = match[1];
    const target = resolveLocalReference(file, reference);
    if (target && !fs.existsSync(target)) errors.push(`${relative(file)}: не найден CSS ${reference}`);
  }
}

for (const file of htmlFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const reference = match[1];
    const target = resolveLocalReference(file, reference);
    if (target && !fs.existsSync(target)) errors.push(`${relative(file)}: не найден ресурс ${reference}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Проверено: ${javascriptFiles.length} JS, ${cssFiles.length} CSS, ${htmlFiles.length} HTML.`);
