import fetch from "node-fetch";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, sep } from "path";
import { DONE_FILE, FETCH_TIMEOUT, MAX_RETRY, REQUEST_DELAY, BASE_URL } from "./config.js";
import { safeLog } from "./logger.js";

const htmlCache = new Map();

let doneSet = new Set();
if (existsSync(DONE_FILE)) {
  const arr = JSON.parse(readFileSync(DONE_FILE, "utf-8"));
  doneSet = new Set(arr);
}

export function markDone(url) {
  doneSet.add(url);
  writeFileSync(DONE_FILE, JSON.stringify([...doneSet], null, 2), "utf-8");
}
export function isDone(url) {
  return doneSet.has(url);
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * 绝对精准、带进度回调的睡眠函数
 */
export async function sleepWithProgress(ms, onTick) {
  const startTime = Date.now();
  const endTime = startTime + ms;
  
  // 先显示总秒数
  onTick(Math.ceil(ms / 1000)); 

  while (Date.now() < endTime) {
    const remainingMs = endTime - Date.now();
    const remainingSec = Math.ceil(remainingMs / 1000);
    
    // 告诉外部还剩几秒
    onTick(remainingSec); 
    
    // 每次最多等 1 秒，或者等剩下的时间（处理最后几百毫秒）
    const waitTime = Math.min(1000, remainingMs);
    await sleep(waitTime);
  }
  
  // 确保结束时归零
  onTick(0); 
}

export function resolveWikiHref(basePageUrl, href) {
  if(href.startsWith("http")) return new URL(href).href;
  if(href.startsWith("/ys/")) {
    return new URL(href, BASE_URL).href;
  }
  if(!href.startsWith("/") && !href.startsWith("#")) {
    return new URL(`/ys/${href}`, BASE_URL).href;
  }
  return new URL(href, BASE_URL).href;
}

export async function fetchHtml(url, retry = 0, onTick) {
  if(htmlCache.has(url)){
    return htmlCache.get(url);
  }
  try {
    const resp = await fetch(url, {
      timeout: FETCH_TIMEOUT,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        Accept: "text/html",
        Referer: "https://wiki.biligame.com/",
      },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    htmlCache.set(url, text);
    return text;
  } catch (err) {
    if (retry < MAX_RETRY) {
      const wait = REQUEST_DELAY * 2;
      safeLog(`[!] 重试 ${url} ${retry+1}/${MAX_RETRY}, wait ${wait}ms : ${err.message} ${err.stack}`);
      await sleepWithProgress(wait, onTick);
      return fetchHtml(url, retry+1);
    }
    throw err;
  }
}

export function safeDirName(str) {
  return str.replace(/[\\/:*?"<>|]/g, "_").trim();
}

export function safeNestedPath(rawParentName) {
  return rawParentName.split("/")
    .map(seg => safeDirName(seg))
    .filter(seg => seg)
    .join(sep);
}

export function normalizeText(str = "") {
  return str.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
