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
  descriptions = JSON.parse(fs.readFileSync(DESC_PATH, "utf8"));
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
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

  return result;
}

function renderTree(items, depth = 0) {
  let md = "";

  for (const item of items) {
    const indent = "  ".repeat(depth);

    if (item.type === "folder") {
      md += `${indent}- 📁 **${item.name}**\n`;
      md += renderTree(item.children, depth + 1);
    } else {
      const desc = descriptions[item.path]?.description || "";
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

  return {
    ids: [...new Set(ids)],
    classes: [...new Set(classes)],
    tags: [...new Set(tags)],
    cssLinks: [...new Set(cssLinks)],
    jsLinks: [...new Set(jsLinks)]
  };
}

function extractCssInfo(content) {
  const classes = [...content.matchAll(/\.([a-zA-Z0-9_-]+)\s*[,{:#.\[]/g)]
    .map(m => m[1]);

  const ids = [...content.matchAll(/#([a-zA-Z0-9_-]+)\s*[,{:#.\[]/g)]
    .map(m => m[1]);

  const media = [...content.matchAll(/@media[^{]+{/g)]
    .map(m => m[0].replace("{", "").trim());

  const imports = [...content.matchAll(/@import\s+url\(["']?([^"')]+)["']?\)/g)]
    .map(m => m[1]);

  const sections = [...content.matchAll(/\/\*+\s*={3,}\s*([\s\S]*?)\s*={3,}\s*\*+\//g)]
    .map(m => m[1].trim().replace(/\s+/g, " "));

  return {
    classes: [...new Set(classes)],
    ids: [...new Set(ids)],
    media: [...new Set(media)],
    imports: [...new Set(imports)],
    sections: [...new Set(sections)]
  };
}

function extractJsInfo(content) {
  const functions = [
    ...content.matchAll(/function\s+([a-zA-Z0-9_$]+)\s*\(/g),
    ...content.matchAll(/const\s+([a-zA-Z0-9_$]+)\s*=\s*\(/g),
    ...content.matchAll(/const\s+([a-zA-Z0-9_$]+)\s*=\s*async\s*\(/g),
    ...content.matchAll(/export\s+function\s+([a-zA-Z0-9_$]+)\s*\(/g)
  ].map(m => m[1]);

  const imports = [...content.matchAll(/import\s+.*?from\s+["']([^"']+)["']/g)]
    .map(m => m[1]);

 const exports = [
  ...[...content.matchAll(/export\s+\{([^}]+)\}/g)]
    .flatMap(m => m[1].split(",").map(x => x.trim())),

  ...[...content.matchAll(/export\s+function\s+([a-zA-Z0-9_$]+)\s*\(/g)]
    .map(m => m[1]),

  ...[...content.matchAll(/export\s+const\s+([a-zA-Z0-9_$]+)/g)]
    .map(m => m[1])
];

  return {
    functions: [...new Set(functions)],
    imports: [...new Set(imports)],
    exports: [...new Set(exports)]
  };
}

function listBlock(title, items) {
  if (!items || items.length === 0) return "";
  return `\n**${title}:**\n${items.map(x => `- \`${x}\``).join("\n")}\n`;
}

const tree = scanDirectory(ROOT);
const files = getAllFiles(tree);

let md = `# HarvestHub — карта проекта

> Файл создаётся автоматически.  
> Описания бери из \`PROJECT_DESCRIPTIONS.json\`.

---

## 1. Структура файлов

${renderTree(tree)}

---

## 2. Подробная карта файлов

`;

for (const file of files) {
  const fullPath = path.join(ROOT, file.path);
  const content = readFileSafe(fullPath);
  const desc = descriptions[file.path]?.description || "Описание пока не добавлено.";

  md += `\n---\n\n### \`${file.path}\`\n\n${desc}\n`;

  if (file.ext === ".html") {
    const info = extractHtmlInfo(content);

    md += listBlock("HTML-теги блоков", info.tags);
    md += listBlock("ID", info.ids);
    md += listBlock("Классы", info.classes);
    md += listBlock("Подключённые CSS", info.cssLinks);
    md += listBlock("Подключённые JS", info.jsLinks);
  }

  if (file.ext === ".css") {
    const info = extractCssInfo(content);

    md += listBlock("CSS-секции из комментариев", info.sections);
    md += listBlock("CSS-классы", info.classes);
    md += listBlock("CSS-ID", info.ids);
    md += listBlock("@media", info.media);
    md += listBlock("@import", info.imports);
  }

  if (file.ext === ".js") {
    const info = extractJsInfo(content);

    md += listBlock("Функции", info.functions);
    md += listBlock("Импорты", info.imports);
    md += listBlock("Экспорты", info.exports);
  }
}

fs.writeFileSync(MAP_PATH, md, "utf8");

console.log("PROJECT_MAP.md обновлён.");
