import { load } from "cheerio";
import { fetchHtml, resolveWikiHref, normalizeText } from "./utils.js";
import { BASE_URL } from "./config.js";
import { safeLog, updateProgress } from "./logger.js";

const urlSet = new Set();

export async function parseIndexPage(indexUrl, taskType, ruleId, extractDir = false) {
  const html = await fetchHtml(indexUrl, (seconds) =>
    updateProgress({ task: "获取主页", stat: `等待${seconds}s` }),
  );
  const $ = load(html);
  const results = {};

  const addTask = (element) => {
    const $element = $(element);
    const anchor = $element.attr("href") ? $element : $element.children().find(".floatnone a[href]").first();
    const href = anchor.attr("href");
    const name = anchor.attr("title");
    if (!href || !name) return;

    const fullUrl = resolveWikiHref(indexUrl, href);
    if (urlSet.has(fullUrl)) return;
    urlSet.add(fullUrl);

    // 系列任务后缀属于页面 URL 身份，不能从任务键中删除。
    const pageKey = decodeURIComponent(fullUrl).replace(BASE_URL, "").split("#")[0];
    const displayPageKey = pageKey.replace("（系列任务）", "");
    let displayName = `${name}${name && "_"}${displayPageKey}`;
    if (displayPageKey === name) displayName = true;
    results[pageKey] = { displayName, type: taskType, url: fullUrl };
  };

  if (ruleId === "taskIcon") {
    const before = $("#邀约事件").parent();
    let mainLinks = $(".taskIconTitle");
    if (before.length > 0) mainLinks = before.prevAll().find(".taskIconTitle");
    const subLinks = $(".taskInviteIconMarkImg a[href]");
    const itemHovers = $(".itemhover");
    if (!mainLinks.length && !subLinks.length && !itemHovers.length) throw new Error("规则taskIcon中的taskIcon数目必须大于0");
    mainLinks.each((_, element) => addTask(element));
    subLinks.each((_, element) => addTask(element));
    itemHovers.each((_, element) => addTask(element));
  }

  if (ruleId === "columns") {
    $(".columns").each((_, element) => {
      const $element = $(element);
      const styled = $element.find("p[style]").filter((__, child) => $(child).parent().is("div"));
      const anchors = styled.length > 0 ? styled.children("a") : $element.find("a");
      anchors.each((__, anchor) => {
        const key = $(anchor).html();
        if (!key || urlSet.has(key)) return;
        urlSet.add(key);
        results[key] = { displayName: true, type: taskType };
      });
    });
  }

  if (ruleId === "tishi") {
    $(".tishi a").each((_, element) => {
      if ($(element).html() !== "任务详情页") return;
      const key = decodeURIComponent($(element).attr("href").replace("/ys/", ""));
      if (urlSet.has(key)) return;
      urlSet.add(key);
      results[key] = { displayName: true, type: taskType };
    });
  }

  if (ruleId === "psah") {
    $("#mw-content-text p[style]").each((_, element) => {
      const key = $(element).children("a").html();
      if (!key || urlSet.has(key)) return;
      urlSet.add(key);
      results[key] = { displayName: true, type: taskType };
    });
  }

  if (ruleId === "伴月纪闻") {
    $(".mw-headline").each((_, element) => {
      const key = $(element).children("a[href]").attr("title");
      if (!key || urlSet.has(key)) return;
      urlSet.add(key);
      results[key] = { displayName: true, type: taskType };
    });
  }

  if (!extractDir) {
    for (const key of Object.keys(results)) {
      if (typeof results[key].displayName === "string") results[key].displayName = results[key].displayName.replace(" ", "_");
    }
  }
  safeLog(`[i] [${taskType}] ${Object.keys(results).length} 个条目`);
  return results;
}

export async function expandSubStories(url) {
  const html = await fetchHtml(url, (seconds) => updateProgress({ task: "获取剧情", stat: `等待${seconds}s` }));
  const $ = load(html);
  const urls = new Set();
  $("div.tishi a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (href && !href.startsWith("#")) urls.add(resolveWikiHref(url, href));
  });
  return { subs: [...urls], html: urls.size === 0 ? html : undefined };
}