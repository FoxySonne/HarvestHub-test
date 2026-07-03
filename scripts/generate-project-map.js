const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const MAP_PATH = path.join(ROOT, "PROJECT_MAP.md");
const DESC_PATH = path.join(ROOT, "PROJECT_DESCRIPTIONS.json");

const ignored = new Set([
  ".git",
  ".github",
  "node_modules",
  ".vscode"
]);

const allowedExtensions = [".html", ".css", ".js", ".json", ".md"];

let descriptions = {};

if (fs.existsSync(DESC_PATH)) {
  try {
    descriptions = JSON.parse(fs.readFileSync(DESC_PATH, "utf8"));
  } catch (error) {
    console.error("Ошибка в PROJECT_DESCRIPTIONS.json. Проверь запятые, кавычки и скобки.");
    throw error;
  }
}

function normalizeDescription(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value.description === "string") return value.description;
  return "";
}

function getFromPath(object, pathList) {
  let current = object;

  for (const key of pathList) {
    if (!current || typeof current !== "object") return "";
    current = current[key];
  }

  return normalizeDescription(current);
}

function getFileDescription(filePath) {
  return (
    getFromPath(descriptions, ["files", filePath]) ||
    getFromPath(descriptions, [filePath])
  );
}

function getBlockDescription(type, key, filePath = "") {
  const blocks = descriptions.blocks || {};

  const typeAliases = {
    htmlIds: ["htmlIds", "ids"],
    htmlClasses: ["htmlClasses", "classes"],
    htmlTags: ["htmlTags"],
    cssClasses: ["cssClasses", "classes"],
    cssIds: ["cssIds", "ids"],
    cssVariables: ["cssVariables"],
    cssMedia: ["cssMedia"],
    cssImports: ["cssImports"],
    cssSections: ["cssSections"],
    jsFunctions: ["jsFunctions", "functions"],
    jsImports: ["jsImports"],
    jsExports: ["jsExports"],
    jsDomIds: ["jsDomIds", "ids", "htmlIds"],
    jsCssClasses: ["jsCssClasses", "classes", "cssClasses"],
    storageKeys: ["storageKeys"],
    databaseKeys: ["databaseKeys"],
    dataCategories: ["dataCategories"],
    dataActions: ["dataActions"],
    dataDays: ["dataDays"]
  };

  const aliases = typeAliases[type] || [type];

  // 1) Можно задать описание конкретного блока внутри конкретного файла:
  // "fileBlocks": { "pages/x.html": { "htmlIds": { "page-content": "..." } } }
  for (const alias of aliases) {
    const scoped = getFromPath(descriptions, ["fileBlocks", filePath, alias, key]);
    if (scoped) return scoped;
  }

  // 2) Основной общий словарь:
  // "blocks": { "classes": { "card": "..." } }
  for (const alias of aliases) {
    const global = getFromPath(blocks, [alias, key]);
    if (global) return global;
  }

  return "Описание пока не добавлено.";
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function sortByName(items) {
  return items.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, "ru");
  });
}

function scanDirectory(dir) {
  const result = [];

  for (const item of fs.readdirSync(dir)) {
    if (ignored.has(item)) continue;

    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      result.push({
        type: "folder",
        name: item,
        children: scanDirectory(fullPath)
      });
    } else {
      const ext = path.extname(item);
      if (!allowedExtensions.includes(ext)) continue;

      const relPath = path.relative(ROOT, fullPath).replace(/\\/g, "/");

      result.push({
        type: "file",
        name: item,
        path: relPath,
        ext
      });
    }
  }

  return sortByName(result);
}

function renderTree(items, depth = 0) {
  let md = "";

  for (const item of items) {
    const indent = "  ".repeat(depth);

    if (item.type === "folder") {
      md += `${indent}- 📁 **${item.name}**\n`;
      md += renderTree(item.children, depth + 1);
    } else {
      const desc = getFileDescription(item.path);
      md += `${indent}- 📄 \`${item.path}\`${desc ? ` — ${desc}` : ""}\n`;
    }
  }

  return md;
}

function getAllFiles(items, result = []) {
  for (const item of items) {
    if (item.type === "file") result.push(item);
    if (item.type === "folder") getAllFiles(item.children, result);
  }

  return result;
}

function uniqueSorted(items) {
  return [...new Set(items.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
}

function extractHtmlInfo(content) {
  const ids = [...content.matchAll(/id=["']([^"']+)["']/g)].map(m => m[1]);

  const classes = [...content.matchAll(/class=["']([^"']+)["']/g)]
    .flatMap(m => m[1].split(/\s+/))
    .filter(Boolean);

  const tags = [...content.matchAll(/<(main|section|aside|header|footer|nav|article)\b/gi)]
    .map(m => m[1].toLowerCase());

  const cssLinks = [...content.matchAll(/<link[^>]+href=["']([^"']+\.css)["']/g)]
    .map(m => m[1]);

  const jsLinks = [...content.matchAll(/<script[^>]+src=["']([^"']+\.js)["']/g)]
    .map(m => m[1]);

  const pageLinks = [...content.matchAll(/loadPage\(["']([^"']+)["']\)/g)]
    .map(m => m[1]);

  return {
    ids: uniqueSorted(ids),
    classes: uniqueSorted(classes),
    tags: uniqueSorted(tags),
    cssLinks: uniqueSorted(cssLinks),
    jsLinks: uniqueSorted(jsLinks),
    pageLinks: uniqueSorted(pageLinks)
  };
}

function extractCssInfo(content) {
  const classes = [...content.matchAll(/\.([a-zA-Z_-][a-zA-Z0-9_-]*)\s*[,{:#.\[\s]/g)]
    .map(m => m[1]);

  const ids = [...content.matchAll(/#([a-zA-Z_-][a-zA-Z0-9_-]*)\s*[,{:#.\[\s]/g)]
    .map(m => m[1]);

  const variables = [...content.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)]
    .map(m => m[1]);

  const usedVariables = [...content.matchAll(/var\((--[a-zA-Z0-9_-]+)/g)]
    .map(m => m[1]);

  const media = [...content.matchAll(/@media[^{]+{/g)]
    .map(m => m[0].replace("{", "").trim());

  const imports = [...content.matchAll(/@import\s+url\(["']?([^"')]+)["']?\)/g)]
    .map(m => m[1]);

  const sections = [...content.matchAll(/\/\*+\s*={3,}\s*([\s\S]*?)\s*={3,}\s*\*+\//g)]
    .map(m => m[1].trim().replace(/\s+/g, " "));

  return {
    classes: uniqueSorted(classes),
    ids: uniqueSorted(ids),
    variables: uniqueSorted(variables),
    usedVariables: uniqueSorted(usedVariables),
    media: uniqueSorted(media),
    imports: uniqueSorted(imports),
    sections: uniqueSorted(sections)
  };
}

function extractJsInfo(content) {
  const functions = [
    ...[...content.matchAll(/(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)\s*\(/g)]
      .map(m => m[1]),

    ...[...content.matchAll(/(?:export\s+)?const\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g)]
      .map(m => m[1]),

    ...[...content.matchAll(/(?:export\s+)?const\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?function\b/g)]
      .map(m => m[1])
  ];

  const imports = [
    ...[...content.matchAll(/import\s+.*?from\s+["']([^"']+)["']/gs)]
      .map(m => m[1]),

    ...[...content.matchAll(/import\(\s*`?["']?([^"`')]+\.js)/g)]
      .map(m => m[1])
  ];

  const exports = [
    ...[...content.matchAll(/export\s+\{([^}]+)\}/g)]
      .flatMap(m => m[1].split(",").map(x => x.trim())),

    ...[...content.matchAll(/export\s+function\s+([a-zA-Z_$][\w$]*)\s*\(/g)]
      .map(m => m[1]),

    ...[...content.matchAll(/export\s+const\s+([a-zA-Z_$][\w$]*)/g)]
      .map(m => m[1])
  ];

  const domIds = [
    ...[...content.matchAll(/getElementById\(["']([^"']+)["']\)/g)]
      .map(m => m[1]),

    ...[...content.matchAll(/querySelector\(["']#([^"']+)["']\)/g)]
      .map(m => m[1])
  ];

  const cssClasses = [
    ...[...content.matchAll(/className\s*=\s*["']([^"']+)["']/g)]
      .flatMap(m => m[1].split(/\s+/)),

    ...[...content.matchAll(/classList\.(?:add|remove|toggle|contains)\(([^)]+)\)/g)]
      .flatMap(m => [...m[1].matchAll(/["']([^"']+)["']/g)].map(x => x[1])),

    ...[...content.matchAll(/querySelector\(["']\.([^"']+)["']\)/g)]
      .map(m => m[1])
  ];

  const storageKeys = [...content.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(["']([^"']+)["']/g)]
    .map(m => m[1]);

  return {
    functions: uniqueSorted(functions),
    imports: uniqueSorted(imports),
    exports: uniqueSorted(exports),
    domIds: uniqueSorted(domIds),
    cssClasses: uniqueSorted(cssClasses),
    storageKeys: uniqueSorted(storageKeys)
  };
}

function extractDataInfo(content) {
  const databaseKeys = [];

  if (/export\s+const\s+database\s*=/.test(content)) databaseKeys.push("database");
  if (/category\s*:/.test(content)) databaseKeys.push("category");
  if (/action\s*:/.test(content)) databaseKeys.push("action");
  if (/dayOrder\s*:/.test(content)) databaseKeys.push("dayOrder");
  if (/days\s*:/.test(content)) databaseKeys.push("days");
  if (/points\s*:/.test(content)) databaseKeys.push("points");
  if (/options\s*:/.test(content)) databaseKeys.push("options");
  if (/quantityOptions\s*:/.test(content)) databaseKeys.push("quantityOptions");

  const categories = [...content.matchAll(/\{name:\s*"([^"]+)",\s*id:\s*"([^"]+)"\}/g)]
    .map(m => ({ name: m[1], id: m[2] }));

  const actions = [...content.matchAll(/\{name:\s*"([^"]+)",\s*id:\s*"([^"]+)",\s*categoryId:\s*"([^"]+)"/g)]
    .map(m => ({ name: m[1], id: m[2], categoryId: m[3] }));

  const days = [...content.matchAll(/\n\s*([a-z]{3}):\s*\{\s*name:\s*"([^"]+)"/g)]
    .map(m => ({ id: m[1], name: m[2] }));

  return {
    databaseKeys: uniqueSorted(databaseKeys),
    categories,
    actions,
    days
  };
}

function listDetailedBlock(title, items, type, filePath, formatter = item => item) {
  if (!items || items.length === 0) return "";

  let output = `\n**${title}:**\n`;

  for (const item of items) {
    const key = typeof item === "string" ? item : item.id;
    const label = formatter(item);
    const description = getBlockDescription(type, key, filePath);

    output += `- \`${label}\` — ${description}\n`;
  }

  return output;
}

function listPlainBlock(title, items) {
  if (!items || items.length === 0) return "";
  return `\n**${title}:**\n${items.map(x => `- \`${x}\``).join("\n")}\n`;
}

const tree = scanDirectory(ROOT);
const files = getAllFiles(tree);

let md = `# HarvestHub — карта проекта

> Файл создаётся автоматически через \`scripts/generate-project-map.js\`.  
> Описания подтягиваются из \`PROJECT_DESCRIPTIONS.json\`.  
> Редактируй вручную именно \`PROJECT_DESCRIPTIONS.json\`, а не этот файл.

---

## 1. Структура файлов

${renderTree(tree)}

---

## 2. Подробная карта файлов

`;

for (const file of files) {
  const fullPath = path.join(ROOT, file.path);
  const content = readFileSafe(fullPath);
  const fileDescription = getFileDescription(file.path) || "Описание файла пока не добавлено.";

  md += `\n---\n\n### \`${file.path}\`\n\n${fileDescription}\n`;

  if (file.ext === ".html") {
    const info = extractHtmlInfo(content);

    md += listDetailedBlock("HTML-теги блоков", info.tags, "htmlTags", file.path);
    md += listDetailedBlock("ID", info.ids, "htmlIds", file.path);
    md += listDetailedBlock("Классы", info.classes, "htmlClasses", file.path);
    md += listPlainBlock("Переходы loadPage()", info.pageLinks);
    md += listPlainBlock("Подключённые CSS", info.cssLinks);
    md += listPlainBlock("Подключённые JS", info.jsLinks);
  }

  if (file.ext === ".css") {
    const info = extractCssInfo(content);

    md += listDetailedBlock("CSS-секции из комментариев", info.sections, "cssSections", file.path);
    md += listDetailedBlock("CSS-классы", info.classes, "cssClasses", file.path);
    md += listDetailedBlock("CSS-ID", info.ids, "cssIds", file.path);
    md += listDetailedBlock("CSS-переменные, объявленные в файле", info.variables, "cssVariables", file.path);
    md += listDetailedBlock("CSS-переменные, используемые в файле", info.usedVariables, "cssVariables", file.path);
    md += listDetailedBlock("@media", info.media, "cssMedia", file.path);
    md += listDetailedBlock("@import", info.imports, "cssImports", file.path);
  }

  if (file.ext === ".js") {
    const info = extractJsInfo(content);

    md += listDetailedBlock("Функции", info.functions, "jsFunctions", file.path);
    md += listDetailedBlock("Импорты", info.imports, "jsImports", file.path);
    md += listDetailedBlock("Экспорты", info.exports, "jsExports", file.path);
    md += listDetailedBlock("DOM ID, к которым обращается JS", info.domIds, "jsDomIds", file.path);
    md += listDetailedBlock("CSS-классы, которыми управляет JS", info.cssClasses, "jsCssClasses", file.path);
    md += listDetailedBlock("Ключи localStorage", info.storageKeys, "storageKeys", file.path);
  }

  if (file.path === "data/database.js") {
    const info = extractDataInfo(content);

    md += listDetailedBlock("Ключи базы данных", info.databaseKeys, "databaseKeys", file.path);
    md += listDetailedBlock("Категории действий", info.categories, "dataCategories", file.path, item => `${item.id} — ${item.name}`);
    md += listDetailedBlock("Действия", info.actions, "dataActions", file.path, item => `${item.id} — ${item.name} [${item.categoryId}]`);
    md += listDetailedBlock("Дни", info.days, "dataDays", file.path, item => `${item.id} — ${item.name}`);
  }
}

fs.writeFileSync(MAP_PATH, md, "utf8");

console.log("PROJECT_MAP.md обновлён.");
