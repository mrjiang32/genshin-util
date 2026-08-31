// list-parser.js
import { load } from "cheerio";
import {
  fetchHtml,
  normalizeText,
  resolveWikiHref,
  sleepWithProgress,
} from "./utils.js";
import { BASE_URL } from "./config.js";
import { safeLog, updateProgress } from "./logger.js";

function getDisplayWidth(str) {
  return [...str].reduce((len, char) => {
    const code = char.charCodeAt(0);
    // 中文汉字 \u4e00‑\u9fa5
    // CJK标点符号 \u3000‑\u303F （「」『』、。等）
    // 全角字符 \uff00‑\uffff
    const isWide =
      (code >= 0x4e00 && code <= 0x9fa5) ||
      (code >= 0x3000 && code <= 0x303f) ||
      (code >= 0xff00 && code <= 0xffff);
    return len + (isWide ? 2 : 1);
  }, 0);
}

function visualPadEnd(str, targetWidth, fillChar = " ") {
  const width = getDisplayWidth(str);
  return width >= targetWidth
    ? str
    : str + fillChar.repeat(targetWidth - width);
}

const urlSet = new Set();

export async function parseIndexPage(
  indexUrl,
  taskType,
  ruleId,
  extarctDir = false,
) {
  const html = await fetchHtml(indexUrl, (s) =>
    updateProgress({ task: "获取主页", stat: `等待${s}s` }),
  );
  const $ = load(html);
  const results = {};

  // const container = $("#mw-content-text");

  if (ruleId === "taskIcon") {
    const before = $("#邀约事件").parent();

    let mainlinks = $(".taskIconTitle");
    const sublinks = $(".taskInviteIconMarkImg a[href]");
    const itemhovers = $(".itemhover");

    if (before.length > 0) {
      mainlinks = before.prevAll().find(".taskIconTitle");
    }

    // assert that length > 0
    if (!mainlinks?.length && !sublinks?.length && !itemhovers?.length) {
      throw new Error("规则taskIcon中的taskIcon数目必须大于0");
    }

    const tkIconF = (_, el) => {
      let a = $(el);

      if (!a.attr().href) {
        a = a.children().find(".floatnone a[href]").first();
      }

      let href = a.attr().href;
      let name = a.attr().title;

      if (!href || !name) {
        throw new Error("Missing required fields at " + a.parent().html());
        return;
      }

      const full = BASE_URL + href.replace("/ys/", "");

      if (urlSet.has(full)) return;
      urlSet.add(full);

      let pageKey = decodeURIComponent(full)
        .replace(BASE_URL, "")
        .replace("（系列任务）", "");

      if (pageKey.includes("#")) {
        pageKey = pageKey.slice(0, pageKey.indexOf("#"));
      }

      if (pageKey === name) name = "";

      let displayName = `${name}${name && "_"}${pageKey}`;
      // safeLog(`[${taskType}] ${pageKey} ${displayName}`);
      if (pageKey === displayName) {
        displayName = true;
      }

      results[pageKey] = {
        displayName,
        type: taskType,
      };
    };

    mainlinks.each(tkIconF);
    sublinks.length > 0 && sublinks.each(tkIconF);
    itemhovers.length > 0 && itemhovers.each(tkIconF);
  }

  if (ruleId === "columns") {
    const headlines = $(".columns");
    headlines.each((_, element) => {
      // $(element)
      //   .find("a")
      //   .each((_, element) => {
      //     let h = $(element).html();
      //     if (!h) return;

      //     if (urlSet.has(h)) return;
      //     urlSet.add(h);
      //     results[h] = {
      //       displayName: true,
      //       type: taskType,
      //     };
      //   });

      const pList = $(element)
        .find("p[style]")
        .filter((_, ele) => $(ele).parent().is("div"));

      if (pList.length > 0) {
        pList.each((_, ele) => {
          let h = $(ele).children("a").html();
          if (!h) return;

          if (urlSet.has(h)) return;
          urlSet.add(h);
          results[h] = {
            displayName: true,
            type: taskType,
          };
        });
      } else {
        $(element)
          .find("a")
          .each((_, element) => {
            let h = $(element).html();
            if (!h) return;

            if (urlSet.has(h)) return;
            urlSet.add(h);
            results[h] = {
              displayName: true,
              type: taskType,
            };
          });
      }
    });
  }

  if (ruleId === "tishi") {
    const items = $(".tishi");
    items.each((_, element) => {
      $(element)
        .find("a")
        .each((_, element) => {
          if ($(element).html() !== "任务详情页") return;

          let t = decodeURIComponent(
            $(element).attr().href.replace("/ys/", ""),
          );
          if (urlSet.has(t)) return;
          urlSet.add(t);
          results[t] = {
            displayName: true,
            type: taskType,
          };
        });
    });
  }

  if (ruleId === "psah") {
    $("#mw-content-text")
      .find("p[style]")
      .each((_, ele) => {
        let h = $(ele).children("a").html();
        if (!h) return;
        // if (!$(ele).prevAll("h4").first().children(".mw-headline").attr()?.id?.includes("世界任务"))
        //   return;

        if (urlSet.has(h)) return;
        urlSet.add(h);
        results[h] = {
          displayName: true,
          type: taskType,
        };
      });
  }

  if (ruleId === "伴月纪闻") {
    $(".mw-headline").each((_, element) => {
      let h = $(element).children("a[href]").attr()?.title;
      if (!h) return;
      if (urlSet.has(h)) return;
      urlSet.add(h);
      results[h] = {
        displayName: true,
        type: taskType,
      };
    });
  }

  if (!extarctDir) {
    Object.keys(results).forEach(
      (keys) =>
        typeof results[keys].displayName === "string" &&
        (results[keys].displayName = results[keys].displayName.replace(
          " ",
          "_",
        )),
    );
  }

  safeLog(`[i] [${taskType}] ${Object.keys(results).length} 个条目`);

  return results;
}

export async function expandSubStories(url) {
  const html = await fetchHtml(url, (s) =>
    updateProgress({ task: "获取剧情", stat: `等待${s}s` }),
  );
  const $ = load(html);
  const subs = [];
  const urlSet = new Set();
  const $tishi = $("div.tishi a[href]");

  // if ($("#任务剧情")) {
  //   safeLog("规则")
  //   return [url];
  // }

  if ($tishi.length > 0) {
    $tishi.each((_, el) => {
      const href = $(el).attr().href;
      if (!href || href.startsWith("#")) return;
      if (urlSet.has(href)) return;
      urlSet.add(href);
      subs.push(BASE_URL + href.replace("/ys/", ""));
    });
    return {subs: subs};
  } else {
    return {subs: [url], html};
  }
}
