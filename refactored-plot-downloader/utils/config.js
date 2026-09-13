import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const BASE_URL = "https://wiki.biligame.com/ys/";

export const INDEX_PAGES = [
  { type: "魔神任务", ruleId: "taskIcon", extract: true },
  { type: "传说任务", ruleId: "taskIcon", extract: false },
  { type: "世界任务", ruleId: "columns", extract: true },
  { type: "游逸旅闻", ruleId: "taskIcon", extract: true },
  { type: "伴月纪闻", ruleId: "伴月纪闻", extract: true },
  { type: "活动任务", ruleId: "psah", extract: true },
  { type: "委托任务", ruleId: "tishi", extract: true },
];

export const REQUEST_DELAY = 3500;
export const MAX_RETRY = 1;
export const FETCH_TIMEOUT = 15000;

const projectDir = join(dirname(fileURLToPath(import.meta.url)), "..");
export const OUT_DIR = join(projectDir, "plots");
export const CFG_DIR = join(projectDir, "config");
export const DONE_FILE = join(CFG_DIR, "done.json");
export const CONTENT_JSON = join(CFG_DIR, "content.json");

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
if (!existsSync(CFG_DIR)) mkdirSync(CFG_DIR, { recursive: true });