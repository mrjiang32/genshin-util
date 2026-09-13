import fetch from "node-fetch";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { sep } from "node:path";
import { BASE_URL, DONE_FILE, FETCH_TIMEOUT, MAX_RETRY, REQUEST_DELAY } from "./config.js";
import { safeLog } from "./logger.js";

const htmlCache = new Map();
let doneSet = new Set();
if (existsSync(DONE_FILE)) doneSet = new Set(JSON.parse(readFileSync(DONE_FILE, "utf-8")));

export function markDone(url) {
  doneSet.add(url);
  writeFileSync(DONE_FILE, JSON.stringify([...doneSet], null, 2), "utf-8");
}

export function isDone(url) {
  return doneSet.has(url);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sleepWithProgress(ms, onTick) {
  const endTime = Date.now() + ms;
  onTick(Math.ceil(ms / 1000));
  while (Date.now() < endTime) {
    const remaining = endTime - Date.now();
    onTick(Math.floor(remaining / 1000));
    await sleep(Math.min(1000, remaining));
  }
  onTick(0);
}

export function resolveWikiHref(basePageUrl, href) {
  if (href.startsWith("http")) return new URL(href).href;
  if (href.startsWith("/ys/")) return new URL(href, BASE_URL).href;
  if (!href.startsWith("/") && !href.startsWith("#")) return new URL(`/ys/${href}`, BASE_URL).href;
  return new URL(href, BASE_URL).href;
}

export async function fetchHtml(url, retry = 0, onTick) {
  if (htmlCache.has(url)) return htmlCache.get(url);
  try {
    const response = await fetch(url, {
      timeout: FETCH_TIMEOUT,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
        Accept: "text/html",
        Referer: "https://wiki.biligame.com/",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    htmlCache.set(url, text);
    return text;
  } catch (error) {
    if (retry < MAX_RETRY) {
      const wait = REQUEST_DELAY * 2;
      safeLog(`[!] 重试 ${url} ${retry + 1}/${MAX_RETRY}, wait ${wait}ms: ${error.message}`);
      await sleepWithProgress(wait, onTick);
      return fetchHtml(url, retry + 1, onTick);
    }
    throw error;
  }
}

export function safeDirName(str) {
  return str.replace(/[\\/:*?"<>|]/g, "_").trim();
}

export function safeNestedPath(rawParentName) {
  return rawParentName.split("/").map((segment) => safeDirName(segment)).filter(Boolean).join(sep);
}

export function normalizeText(str = "") {
  return str.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function ensureDir(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
}