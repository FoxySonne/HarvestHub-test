const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const descriptionsPath = path.join(ROOT, "PROJECT_DESCRIPTIONS.json");

let descriptions = {};

if (fs.existsSync(descriptionsPath)) {
    descriptions = JSON.parse(fs.readFileSync(descriptionsPath, "utf8"));
}

const ignored = new Set([
    ".git",
    ".github",
    "node_modules"
]);

function scan(dir) {

    let result = [];

    const files = fs.readdirSync(dir);

    for (const file of files) {

        if (ignored.has(file))
            continue;

        const full = path.join(dir, file);

        const stat = fs.statSync(full);

        if (stat.isDirectory()) {

            result.push({
                type: "folder",
                name: file,
                children: scan(full)
            });

        } else {

            const rel = path.relative(ROOT, full).replace(/\\/g, "/");

            result.push({
                type: "file",
                name: file,
                path: rel,
                description:
                    descriptions[rel]?.description || ""
            });

        }

    }

    return result;
}

function render(tree, depth = 0) {

    let md = "";

    for (const item of tree) {

        const indent = "  ".repeat(depth);

        if (item.type === "folder") {

            md += `${indent}- 📁 **${item.name}**\n`;

            md += render(item.children, depth + 1);

        } else {

            md += `${indent}- 📄 ${item.name}`;

            if (item.description)
                md += ` — ${item.description}`;

            md += "\n";

        }

    }

    return md;

}

const tree = scan(ROOT);

const output =
`# HarvestHub

> Этот файл создается автоматически.

## Структура проекта

${render(tree)}
`;

fs.writeFileSync(
    path.join(ROOT, "PROJECT_MAP.md"),
    output,
    "utf8"
);

console.log("PROJECT_MAP.md обновлен.");
