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
const sqlFiles = files.filter(file => file.endsWith(".sql"));
const migrationFiles = sqlFiles.filter(file => relative(file).startsWith("supabase/migrations/"));
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

const migrationVersions = new Map();
const sqlFunctionDefinitions = new Set();
for (const file of sqlFiles) {
  const source = fs.readFileSync(file, "utf8");
  const dollarTags = new Map();

  for (const match of source.matchAll(/\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$/g)) {
    dollarTags.set(match[0], (dollarTags.get(match[0]) || 0) + 1);
  }
  for (const [tag, count] of dollarTags) {
    if (count % 2 !== 0) errors.push(`${relative(file)}: незакрытый SQL-блок ${tag}`);
  }

  for (const match of source.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([A-Za-z_][A-Za-z0-9_]*)/gi)) {
    sqlFunctionDefinitions.add(match[1]);
  }
}

for (const file of migrationFiles) {
  const fileName = path.basename(file);
  const match = fileName.match(/^(\d{8,14})_[a-z0-9_]+\.sql$/);
  if (!match) {
    errors.push(`${relative(file)}: имя миграции должно начинаться с уникальной даты или времени`);
    continue;
  }
  const duplicate = migrationVersions.get(match[1]);
  if (duplicate) errors.push(`${relative(file)}: версия миграции совпадает с ${relative(duplicate)}`);
  else migrationVersions.set(match[1], file);
}

const rpcManifestPath = path.join(root, "supabase", "rpc-manifest.json");
if (!fs.existsSync(rpcManifestPath)) {
  errors.push("supabase/rpc-manifest.json: отсутствует перечень RPC Supabase");
} else {
  let rpcManifest = [];
  try {
    rpcManifest = JSON.parse(fs.readFileSync(rpcManifestPath, "utf8"));
  } catch (error) {
    errors.push(`supabase/rpc-manifest.json: некорректный JSON — ${error.message}`);
  }

  if (!Array.isArray(rpcManifest) || rpcManifest.some(name => typeof name !== "string" || !name)) {
    errors.push("supabase/rpc-manifest.json: ожидается массив непустых имён функций");
  } else {
    const declaredRpc = new Set(rpcManifest);
    if (declaredRpc.size !== rpcManifest.length) errors.push("supabase/rpc-manifest.json: есть повторяющиеся имена RPC");

    for (const rpcName of declaredRpc) {
      if (!sqlFunctionDefinitions.has(rpcName)) {
        errors.push(`supabase/rpc-manifest.json: функция ${rpcName} не найдена ни в одном SQL-файле`);
      }
    }

    for (const file of javascriptFiles) {
      const source = fs.readFileSync(file, "utf8");
      for (const match of source.matchAll(/\.rpc\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/g)) {
        if (!declaredRpc.has(match[1])) {
          errors.push(`${relative(file)}: RPC ${match[1]} отсутствует в supabase/rpc-manifest.json`);
        }
      }
    }
  }
}

const duplicateCandidates = [...javascriptFiles, ...cssFiles, ...sqlFiles];
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

console.log(`Проверено: ${javascriptFiles.length} JS, ${cssFiles.length} CSS, ${htmlFiles.length} HTML, ${sqlFiles.length} SQL, ${migrationFiles.length} миграций.`);
