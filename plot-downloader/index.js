import { load } from "cheerio";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { parseArgs } from "node:util";
import chalk from "chalk";
import path from "node:path";

import {
  fetchHtml,
  sleep,
  isDone,
  markDone,
  safeDirName,
  safeNestedPath,
  ensureDir,
  sleepWithProgress,
} from "./utils/utils.js";
import { parseIndexPage, expandSubStories } from "./utils/list-parser.js";
import {
  INDEX_PAGES,
  CONTENT_JSON,
  OUT_DIR,
  REQUEST_DELAY,
  BASE_URL,
} from "./utils/config.js";
import { extractStoryMarkdown } from "./utils/extract-story.js";

import {
  failProgress,
  safeLog,
  stopProgress,
  updateProgress,
  initProgress,
  incrementProgress,
} from "./utils/logger.js";

// 监听 Ctrl+C 信号
process.on("SIGINT", () => {
  failProgress("中断");
  console.log(chalk.yellow("\n[i] 收到中断信号，程序已安全退出"));
  process.exit(0);
});

// 1. 命令行参数解析
const { values: cliOptions } = parseArgs({
  options: {
    "dry-run": {
      type: "boolean",
      default: false,
      short: "n",
      description: "试运行模式",
    },
    limit: {
      type: "string",
      short: "l",
      description: "限制本次下载的任务数量",
    },
    force: {
      type: "boolean",
      default: false,
      short: "f",
      description: "强制下载：忽略已完成记录",
    },
    help: { type: "boolean", short: "h", description: "显示帮助信息" },
    type: { type: "string", short: "t", description: "按类型过滤" },
  },
  strict: false,
});

if (cliOptions.help) {
  console.log(
    "用法: node index.js [选项]\n选项:\n  -n, --dry-run    试运行模式\n  -l, --limit <n>  限制任务数量\n  -f, --force      强制下载\n  -t, --type <t>   按类型过滤\n  -h, --help       显示帮助"
  );
  process.exit(0);
}

// 工具函数
function numberedName(index, total, name) {
  const width = Math.max(1, String(total).length);
  const num = String(index + 1).padStart(width, "0");
  return num + "_" + name;
}

function stripParentPrefix(name) {
  const spIndex = name.indexOf(" ");
  if (spIndex <= 0) return name;
  return name.slice(spIndex + 1).trim();
}

// 统一获取真实显示名称的工具，兼容 displayName 为 true 的情况
function getDisplayName(key, item) {
  if (item.displayName === true) return key;
  return item.displayName || key;
}

let first = true;
let allTasks = {};

// 2. 核心下载逻辑
async function downloadOne(key, item, options, level = 0, outdir = OUT_DIR) {
  if (level >= 2) return;

  const url = BASE_URL + encodeURIComponent(key);
  if (!options?.force && isDone(url)) {
    safeLog(chalk.gray("跳过已完成: " + key));
    return;
  }

  // 字段兜底：递归子任务补默认值
  const chapterIndex = item._chapterIndex ?? 0;
  const chapterTotal = item._chapterTotal ?? 1;
  const chapterName = item._chapterName || "其他";
  const actIndex = item._actIndex ?? 0;
  const actTotal = item._actTotal ?? 1;
  const displayName = getDisplayName(key, item);
  const itemType = item.type || "";

  // 构建当前幕的完整目录：类型 / 大章节 / 幕
  const actName = stripParentPrefix(displayName);
  const rawActName = safeNestedPath(actName).replace("（任务）", "");

  const chapterWidth = Math.max(1, String(chapterTotal).length);
  const chapterNum = String(chapterIndex + 1).padStart(chapterWidth, "0");
  const chapterFolder = chapterNum + "_" + chapterName;

  const actWidth = Math.max(1, String(actTotal).length);
  const actNum = String(actIndex + 1).padStart(actWidth, "0");
  const actFolder = actNum + "_" + rawActName;

  const actFolderPath = path.join(outdir, itemType, chapterFolder, actFolder)
    .replace(/\\/g, "/");
  ensureDir(actFolderPath);

  if (REQUEST_DELAY !== 0 && !first) {
    await sleepWithProgress(REQUEST_DELAY, (s) => {
      updateProgress({
        task: chalk.green(key) + chalk.bold.gray("[获取中]"),
        stat: chalk.bold("等待" + s + "s"),
      });
    });
    updateProgress({
      task: chalk.green(key) + "[获取中]",
      stat: chalk.bold("处理中"),
    });
  }
  first = false;

  const { subs, ahtml } = await expandSubStories(url);
  const total = subs.length;

  // 叶子节点：没有子剧情，直接输出 md 到幕文件夹
  if (total === 0) {
    const html = ahtml ?? (await fetchHtml(url, (s) => {
      updateProgress({ task: key, stat: "等待" + s + "s" });
    }));
    const $ = load(html);
    $("script,style").remove();
    let md = extractStoryMarkdown($);
    md = "# " + key + "\n\n" + md;

    const savePath = path.join(
      actFolderPath,
      safeDirName(key).replace("（任务）", "") + ".md"
    );
    writeFileSync(savePath, md, "utf-8");
    markDone(url);
    safeLog(chalk.gray("   已保存: " + savePath));
    return;
  }

  // 有子剧情：循环每个片段，直接输出 md 文件，不建子文件夹
  let i = 0;
  for (const subUrl of subs) {
    const name = decodeURIComponent(subUrl).replace(BASE_URL, "");
    const fileName = numberedName(i, total, name);

    let showName = name === key ? name : chalk.green(key) + "[" + chalk.cyanBright.bold(name) + "]";
    if (!options.force && isDone(subUrl)) {
      safeLog(chalk.gray("[i] 跳过已完成: " + showName));
      i++;
      continue;
    }

    const idxStr = String(i + 1).padStart(String(total).length, " ");
    showName = chalk.green(key) + chalk.bold("[" + idxStr + "/" + total + "]") + " | " + chalk.cyanBright.bold(name);
    if (REQUEST_DELAY !== 0 && key !== name) {
      await sleepWithProgress(REQUEST_DELAY, (s) => {
        updateProgress({ task: showName, stat: chalk.bold("等待" + s + "s") });
      });
      updateProgress({ task: showName, stat: chalk.bold("处理中") });
    }

    const html = ahtml ?? (await fetchHtml(subUrl, (s) => {
      updateProgress({ task: showName, stat: "等待" + s + "s" });
    }));
    const $ = load(html);
    $("script,style").remove();

    let md = extractStoryMarkdown($);
    let ext = "md";

    if (!md) {
      if ($("div.tishi a[href]").length > 0) {
        await downloadOne(
          name,
          {
            displayName: name,
            type: "",
            _chapterIndex: chapterIndex,
            _chapterTotal: chapterTotal,
            _chapterName: chapterName,
          },
          options,
          level + 1,
          actFolderPath,
        );
      }
      ext = "html";
    } else {
      md = "# " + key + "-" + name + "\n\n" + md;
    }

    // 直接保存到幕文件夹，不额外建子目录
    const savePath = path.join(
      actFolderPath,
      safeDirName(fileName).replace("（任务）", "") + "." + ext
    );

    writeFileSync(savePath, ext === "md" ? md : $("#mw-content-text").html(), "utf-8");
    markDone(subUrl);
    safeLog(chalk.gray("   已保存: " + savePath));
    i++;
  }
  markDone(url);
}

// 3. 构建任务列表
async function buildAllTaskList() {
  try {
    const raw = readFileSync(CONTENT_JSON, "utf-8");
    safeLog(chalk.blue("[i] 读取本地缓存 content.json"));
    return JSON.parse(raw);
  } catch (e) {
    // 缓存不存在，继续抓取
  }
  first = false;

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

  writeFileSync(CONTENT_JSON, JSON.stringify(result, null, 2), "utf-8");
  safeLog(
    chalk.green("[i] 生成任务总列表，共 " + Object.keys(result).length + " 条")
  );
  return result;
}

// 4. 主函数
async function main() {
  allTasks = await buildAllTaskList();

  // 按 type 分组后，再按大章节（displayName 第一段空格前）二次分组编号
  const typeGroups = {};
  for (const [k, v] of Object.entries(allTasks)) {
    const type = v.type || "其他";
    if (!typeGroups[type]) typeGroups[type] = [];
    typeGroups[type].push(k);
  }

  for (const [type, keys] of Object.entries(typeGroups)) {
    // 按大章节名称分组
    const chapterGroups = {};
    for (const k of keys) {
      // ✅ 修复：统一使用 getDisplayName，兼容 displayName 为 true 的情况
      const disp = getDisplayName(k, allTasks[k]);
      const spaceIdx = disp.indexOf(" ");
      const chapterName = spaceIdx > 0 ? disp.slice(0, spaceIdx).trim() : "其他";
      if (!chapterGroups[chapterName]) chapterGroups[chapterName] = [];
      chapterGroups[chapterName].push(k);
    }

    // 大章节在同类型内全局编号
    const chapterNames = Object.keys(chapterGroups);
    const chapterTotal = chapterNames.length;

    chapterNames.forEach((chapterName, chapterIdx) => {
      const actKeys = chapterGroups[chapterName];
      const actTotal = actKeys.length;

      // 幕在所属大章节内从 01 开始编号
      actKeys.forEach((k, actIdx) => {
        allTasks[k]._chapterIndex = chapterIdx;
        allTasks[k]._chapterTotal = chapterTotal;
        allTasks[k]._chapterName = chapterName;
        allTasks[k]._actIndex = actIdx;
        allTasks[k]._actTotal = actTotal;
      });
    });
  }

  let tasksToProcess = Object.keys(allTasks);

  if (cliOptions.limit) {
    const limitNum = parseInt(cliOptions.limit, 10);
    if (!isNaN(limitNum) && limitNum > 0) {
      tasksToProcess = tasksToProcess.slice(0, limitNum);
    }
  }

  if (cliOptions.type) {
    tasksToProcess = tasksToProcess.filter((task) => {
      const t = allTasks[task]?.type || "";
      return cliOptions.type.includes(t) || cliOptions.type.includes(task);
    });
  }

  if (tasksToProcess.length === 0) {
    safeLog(chalk.yellow("[!] 没有符合条件的任务需要处理"));
    stopProgress();
    return;
  }

  safeLog(chalk.green("[i] 共" + tasksToProcess.length + "项任务处理"));
  initProgress(tasksToProcess.length);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < tasksToProcess.length; i++) {
    const task = tasksToProcess[i];
    try {
      await downloadOne(task, allTasks[task], cliOptions);
      successCount++;
    } catch (err) {
      failCount++;
      safeLog(chalk.red("[x] 任务失败 [" + task + "]: " + err.message + " " + err.stack));
    }
    incrementProgress();
  }

  stopProgress();
  console.log(
    "   成功: " + chalk.green(successCount) + " | 失败: " + chalk.red(failCount) + " | 总计: " + tasksToProcess.length
  );

  process.exit(0);
}

main().catch((err) => {
  failProgress("程序异常!");
  console.error(err);
  process.exit(1);
});
