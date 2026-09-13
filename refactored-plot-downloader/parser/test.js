import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join, extname, dirname, basename } from "path";
import { load } from "cheerio";
import parser from "./parser.js";
import { fileURLToPath } from "url";

const parseOne = parser.parseOne;
const renderMdAst = parser.renderMdAst;

/**
 * @param {string} text
 * @returns {string}
 */
function cleanRawText(text) {
  return text.replace(/\s+/g, "").trim();
}

/**
 * 复刻extractor选取逻辑，直接操作DOM
 * @param {cheerio.CheerioAPI} $
 * @param {cheerio.Cheerio<cheerio.Element>} rootEl
 * @returns {MarkdownNode[]} ast节点数组
 */
function extractStoryAst($, rootEl) {
  if (!rootEl.length) return [];
  const $parserOutput = rootEl.find(".mw-parser-output").first();
  if ($parserOutput.length) rootEl = $parserOutput;

  const taskStoryHeading = rootEl
    .find("h2,h3")
    .filter((_, el) => cleanRawText($(el).text()) === "任务剧情");

  let targetDomElements;
  if (taskStoryHeading.length > 0) {
    targetDomElements = taskStoryHeading.nextAll().toArray();
  } else {
    targetDomElements = rootEl.find("> *").toArray();
  }

  const astResult = [];
  for (const el of targetDomElements) {
    const nodeAst = parseOne($, $(el), rootEl);
    if (nodeAst.type !== "null") {
      astResult.push(nodeAst);
    }
  }
  return astResult;
}

/**
 * 递归遍历目录，读取全部 .html 文件
 * @param {string} srcDir 源目录
 * @param {string} destDir 输出目录
 */
function processDirectory(srcDir, destDir) {
  if (!existsSync(srcDir)) {
    console.error(`源目录不存在: ${srcDir}`);
    return;
  }
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  const entries = readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcFull = join(srcDir, entry.name);
    if (entry.isDirectory()) {
      // 目录：递归保持一一对应
      const destFull = join(destDir, entry.name);
      processDirectory(srcFull, destFull);
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".html") {
      // 文件：直接算出目标md路径，传给处理函数
      const baseName = basename(entry.name, ".html");
      const destFull = join(destDir, `${baseName}.md`);
      handleHtmlFile(srcFull, destFull);
    }
  }
}

/**
 * 处理单个html
 * @param {string} srcFilePath 源html完整路径
 * @param {string} destFilePath 目标md完整路径
 */
function handleHtmlFile(srcFilePath, destFilePath) {
  try {
    const htmlContent = readFileSync(srcFilePath, "utf8");
    const $ = load(htmlContent);
    const rootEl = $("#mw-content-text");
    const ast = extractStoryAst($, rootEl);

    if (!ast || ast.length === 0) {
      console.log(`无剧情内容 ${srcFilePath}`);
      writeFileSync(destFilePath, "", "utf8");
      return;
    }

    let mdText = renderMdAst(ast).join("  \n");
    // 换行压缩 + 清理冗余标记
    mdText = mdText.replace("MediaWiki:PlotOptions", "").replace(/(\n\s*){3,}/g, "\n\n").trim();

    // 确保目标目录存在
    const outDir = dirname(destFilePath);
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }

    writeFileSync(destFilePath, mdText, "utf8");
    console.log(`${srcFilePath} → ${destFilePath}`);
  } catch (err) {
    console.error(`处理失败 ${srcFilePath}:`, err.stack);
  }
}

// ========== CLI入口 ==========
const url = import.meta.url;
const pathdir = dirname(fileURLToPath(url));

const opts = {
  src: join(pathdir, "./input_html"),
  dest: join(pathdir, "./output_md")
};

const args = process.argv.slice(2);
for (const arg of args) {
  if (arg.startsWith("--src=")) opts.src = arg.slice("--src=".length);
  if (arg.startsWith("--dest=")) opts.dest = arg.slice("--dest=".length);
}

console.log(`源目录: ${opts.src}`);
console.log(`输出目录: ${opts.dest}`);
processDirectory(opts.src, opts.dest);
