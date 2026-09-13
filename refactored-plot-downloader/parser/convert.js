import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { basename, dirname, extname, join } from "path";
import { load } from "cheerio";
import parser from "./parser.js";

const { parseOne, renderMdAst } = parser;

function cleanRawText(text) {
  return text.replace(/\s+/g, "").trim();
}

function extractStoryAst($, rootEl) {
  if (!rootEl.length) return [];

  const parserOutput = rootEl.find(".mw-parser-output").first();
  if (parserOutput.length) rootEl = parserOutput;

  const taskStoryHeading = rootEl
    .find("h2,h3")
    .filter((_, el) => cleanRawText($(el).text()) === "任务剧情");

  const targetElements = taskStoryHeading.length > 0
    ? taskStoryHeading.nextAll().toArray()
    : rootEl.find("> *").toArray();

  return targetElements
    .map((element) => parseOne($, $(element), rootEl))
    .filter((node) => node.type !== "null");
}

export function convertHtmlFile(srcFilePath, destFilePath, title = "") {
  const htmlContent = readFileSync(srcFilePath, "utf8");
  const $ = load(htmlContent);
  const ast = extractStoryAst($, $("#mw-content-text"));
  let markdown = renderMdAst(ast).join("  \n");

  markdown = markdown
    .replace("MediaWiki:PlotOptions", "")
    .replace(/(\n\s*){3,}/g, "\n\n")
    .trim();

  if (title) markdown = `# ${title}\n\n${markdown}`;

  mkdirSync(dirname(destFilePath), { recursive: true });
  writeFileSync(destFilePath, markdown, "utf8");
  return markdown;
}

export function convertDirectory(srcDir, destDir) {
  if (!existsSync(srcDir)) return { converted: 0, failed: 0 };
  mkdirSync(destDir, { recursive: true });

  let converted = 0;
  let failed = 0;
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = join(srcDir, entry.name);
    const destPath = join(destDir, entry.name);

    if (entry.isDirectory()) {
      const result = convertDirectory(srcPath, destPath);
      converted += result.converted;
      failed += result.failed;
      continue;
    }

    if (!entry.isFile() || extname(entry.name).toLowerCase() !== ".html") continue;

    const markdownPath = join(destDir, `${basename(entry.name, ".html")}.md`);
    try {
      convertHtmlFile(srcPath, markdownPath, basename(entry.name, ".html"));
      converted++;
    } catch (error) {
      failed++;
      console.error(`转换失败 ${srcPath}:`, error.stack || error.message);
    }
  }

  return { converted, failed };
}