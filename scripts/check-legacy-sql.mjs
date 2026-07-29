import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const supabaseDirectory = path.join(root, "supabase");
const manifestPath = path.join(supabaseDirectory, "legacy-sql-manifest.json");

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

if (!fs.existsSync(manifestPath)) {
  fail("supabase/legacy-sql-manifest.json: отсутствует перечень исторических SQL-файлов");
} else {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail(`supabase/legacy-sql-manifest.json: некорректный JSON — ${error.message}`);
  }

  const declaredFiles = Array.isArray(manifest?.files) ? manifest.files : [];
  if (declaredFiles.length === 0 || declaredFiles.some(file => typeof file !== "string" || !file.endsWith(".sql") || file.includes("/"))) {
    fail("supabase/legacy-sql-manifest.json: поле files должно содержать имена SQL-файлов из корня supabase");
  } else {
    const declaredSet = new Set(declaredFiles);
    if (declaredSet.size !== declaredFiles.length) {
      fail("supabase/legacy-sql-manifest.json: есть повторяющиеся имена файлов");
    }

    const actualRootSql = fs.readdirSync(supabaseDirectory, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith(".sql"))
      .map(entry => entry.name)
      .sort();

    for (const file of declaredFiles) {
      if (!actualRootSql.includes(file)) fail(`supabase/${file}: файл указан в историческом перечне, но отсутствует`);
    }

    for (const file of actualRootSql) {
      if (!declaredSet.has(file)) {
        fail(`supabase/${file}: новый SQL должен находиться в supabase/migrations, а не в корне supabase`);
      }
    }

    if (!process.exitCode) {
      console.log(`Проверено исторических SQL-файлов: ${declaredFiles.length}. Новых SQL вне migrations нет.`);
    }
  }
}
