import { load } from "cheerio";
import { parseArgs } from "node:util";
import path from "node:path";
import chalk from "chalk";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import {
  fetchHtml,
  isDone,
  markDone,
  safeDirName,
  safeNestedPath,
  ensureDir,
  sleepWithProgress,
  resolveWikiHref,
} from "./utils/utils.js";
import { parseIndexPage } from "./utils/list-parser.js";
import {
  INDEX_PAGES,
  CONTENT_JSON,
  OUT_DIR,
  REQUEST_DELAY,
  BASE_URL,
} from "./utils/config.js";
import { convertDirectory } from "./parser/convert.js";
import {
  failProgress,
  safeLog,
  stopProgress,
  updateProgress,
  initProgress,
  incrementProgress,
} from "./utils/logger.js";

const { values: cliOptions } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false, short: "n" },
    limit: { type: "string", short: "l" },
    force: { type: "boolean", default: false, short: "f" },
    help: { type: "boolean", short: "h" },
    type: { type: "string", short: "t" },
    "download-only": { type: "boolean", default: false },
    "convert-only": { type: "boolean", default: false },
    "refresh-list": { type: "boolean", default: false },
  },
  strict: false,
});

if (cliOptions.help) {
  console.log(
    "用法: node index.js [选项]\n选项:\n  -n, --dry-run       试运行模式\n  -l, --limit <n>     限制任务数量\n  -f, --force         强制下载\n  -t, --type <t>      按类型过滤\n      --download-only 只下载 HTML\n      --convert-only  只转换已有 HTML\n      --refresh-list  重新抓取任务列表\n  -h, --help          显示帮助",
  );
  process.exit(0);
}

function getDisplayName(key, item) {
  return item.displayName === true ? key : item.displayName || key;
}

function stripParentPrefix(name) {
  const spaceIndex = name.indexOf(" ");
  return spaceIndex <= 0 ? name : name.slice(spaceIndex + 1).trim();
}

function buildActDirectory(item, key, outdir = OUT_DIR) {
  const displayName = getDisplayName(key, item);
  const chapterName = item._chapterName || "其他";
  const chapterIndex = item._chapterIndex ?? 0;
  const chapterTotal = item._chapterTotal ?? 1;
  const actIndex = item._actIndex ?? 0;
  const actTotal = item._actTotal ?? 1;
  const chapterNum = String(chapterIndex + 1).padStart(String(chapterTotal).length, "0");
  const actName = safeNestedPath(stripParentPrefix(displayName)).replace("（任务）", "");
  const actNum = String(actIndex + 1).padStart(String(actTotal).length, "0");
  const directory = path.join(
    outdir,
    item.type || "其他",
    `${chapterNum}_${chapterName}`,
    `${actNum}_${actName}`,
  );
  ensureDir(directory);
  return directory;
}

function getSubStoryUrls(html) {
  const $ = load(html);
  const urls = new Set();
  $("div.tishi a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href || href.startsWith("#")) return;
    urls.add(resolveWikiHref(BASE_URL, href));
  });
  return [...urls];
}

function pageName(url) {
  return decodeURIComponent(url).replace(BASE_URL, "");
}

async function waitBeforeRequest(label, firstRequest) {
  if (firstRequest.value || REQUEST_DELAY === 0) {
    firstRequest.value = false;
    return;
  }
  await sleepWithProgress(REQUEST_DELAY, (seconds) => {
    updateProgress({ task: label, stat: `等待${seconds}s` });
  });
}

async function downloadPage(url, label, firstRequest) {
  await waitBeforeRequest(label, firstRequest);
  return fetchHtml(url, (seconds) => {
    updateProgress({ task: label, stat: `等待${seconds}s` });
  });
}

async function downloadStoryTree(rootUrl, rootKey, item, options, actDirectory) {
  const firstRequest = { value: true };

  async function visit(url, name, isRoot = false) {
    const prefix = isRoot ? "" : `${rootKey}-`;
    const fileName = safeDirName(`${prefix}${name}`.replace("（任务）", ""));
    const htmlPath = path.join(actDirectory, `${fileName}.html`);
    if (!options.force && isDone(url) && existsSync(htmlPath)) {
      safeLog(chalk.gray(`跳过已完成: ${name}`));
      return;
    }

    const html = await downloadPage(url, name, firstRequest);
    const children = getSubStoryUrls(html);
    if (children.length > 0) {
      for (const childUrl of children) {
        const childName = pageName(childUrl);
        await visit(childUrl, childName);
      }
      if (isRoot) markDone(url);
      return;
    }

    writeFileSync(htmlPath, html, "utf8");
    markDone(url);
    safeLog(chalk.gray(`   已保存 HTML: ${htmlPath}`));
  }

  await visit(rootUrl, rootKey, true);
}

async function buildAllTaskList() {
  if (!cliOptions["refresh-list"]) {
    try {
      safeLog(chalk.blue("[i] 读取本地缓存 content.json"));
      return JSON.parse(readFileSync(CONTENT_JSON, "utf8"));
    } catch {
      // 缓存不存在时从索引页构建任务列表。
    }
  }

  let result = {};
  for (const page of INDEX_PAGES) {
    const list = await parseIndexPage(
      BASE_URL + page.type,
      page.type,
      page.ruleId,
      page.extract,
    );
    result = Object.assign(result, list);
  }
  writeFileSync(CONTENT_JSON, JSON.stringify(result, null, 2), "utf8");
  safeLog(chalk.green(`[i] 生成任务总列表，共 ${Object.keys(result).length} 条`));
  return result;
}

function addTaskIndexes(tasks) {
  const typeGroups = {};
  for (const [key, item] of Object.entries(tasks)) {
    const type = item.type || "其他";
    (typeGroups[type] ||= []).push(key);
  }

  for (const [type, keys] of Object.entries(typeGroups)) {
    const chapterGroups = {};
    for (const key of keys) {
      const displayName = getDisplayName(key, tasks[key]);
      const spaceIndex = displayName.indexOf(" ");
      const chapterName = spaceIndex > 0 ? displayName.slice(0, spaceIndex).trim() : "其他";
      (chapterGroups[chapterName] ||= []).push(key);
    }

    const chapterNames = Object.keys(chapterGroups);
    chapterNames.forEach((chapterName, chapterIndex) => {
      const keysInChapter = chapterGroups[chapterName];
      keysInChapter.forEach((key, actIndex) => {
        tasks[key]._chapterIndex = chapterIndex;
        tasks[key]._chapterTotal = chapterNames.length;
        tasks[key]._chapterName = chapterName;
        tasks[key]._actIndex = actIndex;
        tasks[key]._actTotal = keysInChapter.length;
      });
    });
  }
}

async function main() {
  const tasks = await buildAllTaskList();
  addTaskIndexes(tasks);

  let taskKeys = Object.keys(tasks);
  if (cliOptions.limit) {
    const limit = Number.parseInt(cliOptions.limit, 10);
    if (Number.isInteger(limit) && limit > 0) taskKeys = taskKeys.slice(0, limit);
  }
  if (cliOptions.type) {
    taskKeys = taskKeys.filter((key) => {
      const type = tasks[key]?.type || "";
      return cliOptions.type.includes(type) || cliOptions.type.includes(key);
    });
  }

  if (!cliOptions.convertOnly) {
    if (taskKeys.length === 0) {
      safeLog(chalk.yellow("[!] 没有符合条件的任务需要处理"));
    } else {
      initProgress(taskKeys.length);
      for (const key of taskKeys) {
        try {
          if (!cliOptions.dryRun) {
            const item = tasks[key];
            const directory = buildActDirectory(item, key);
            await downloadStoryTree(
              item.url || BASE_URL + encodeURIComponent(key),
              key,
              item,
              cliOptions,
              directory,
            );
          }
        } catch (error) {
          safeLog(chalk.red(`[x] 下载失败 [${key}]: ${error.message}`));
        }
        incrementProgress();
      }
      stopProgress();
    }
  }

  if (!cliOptions.downloadOnly && !cliOptions.dryRun) {
    const result = convertDirectory(OUT_DIR, OUT_DIR);
    safeLog(chalk.green(`[i] Markdown 转换完成：成功 ${result.converted}，失败 ${result.failed}`));
  }
}

process.on("SIGINT", () => {
  failProgress("中断");
  process.exit(0);
});

main().catch((error) => {
  failProgress("程序异常");
  console.error(error);
  process.exit(1);
});