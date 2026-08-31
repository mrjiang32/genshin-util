import { safeLog } from "../logger.js";

export function setMark(mark, text) {
  if (text.startsWith(mark) && text.endsWith(mark)) {
    return text;
  }
  if (text.startsWith("「") && text.endsWith("」")) {
    return `「${mark}${text.slice(1, -1)}${mark}」`;
  }
  return `${mark}${text}${mark}`;
}

export function cleanRawText(text) {
  return (
    text
      .replace(/!\[.*?\]\([^)]*\)/g, "")
      .replace(/^\s*[*-] +/gm, "")
      .replace(/(?<!\*)\*(?!\*)$/g, "")
      // 修复：将换行替换为空格时，保留加粗标记后的换行
      .replace(/\s+/g, " ")
      .trim()
  );
}

const b = (t) => setMark("**", t);
const i = (t) => setMark("*", t);

export function convertInlineTags($, $el) {
  $el.find("b, strong, span").each((_, el) => {
    let text = b($(el).text().trim());
    $(el).replaceWith(text);
  });
  $el.find("i, e").each((_, el) => {
    let text = i($(el).text().trim());
    $(el).replaceWith(text);
  });
}

export function parseTextDialogue(text) {
  const t = cleanRawText(text);
  if (t === "MediaWiki:PlotOptions") {
    return { speaker: null, content: "" };
  }
  const m = t.match(/^(.+?)([:：])(.+)$/);

  // !m && safeLog(t + new Error().stack.replace("Error", "\n调用于"));

  return m
    ? { speaker: m[1].trim(), content: m[3].trim() }
    : { speaker: null, content: t?.trim() };
}

export function parseDl($, $el) {
  const result = [];

  $el.children("dd").each((_, el) => {
    const $dd = $(el);
    const inner = [];

    $dd.contents().each((_, child) => {
      if (child.type === "text") {
        const text = cleanRawText($(child).text().trim());
        if (text) {
          inner.push({ type: "text", text });
        }
        return;
      }

      if (child.type === "tag") {
        const tag = child.tagName?.toLowerCase();

        if (tag === "dl") {
          inner.push(parseDl($, $(child)));
          return;
        }

        const $child = $(child)
        convertInlineTags($, $child);

        const text = cleanRawText($child.text());
        if (text) {
          inner.push({ type: "text", text: text.trim() });
        }
      }
    });

    result.push({ type: "dd", items: inner });
  });

  return {
    type: "dl",
    items: result,
  };
}

export function parseContainer($, $root) {
  const items = [];
  const subOptTexts = new Set();

  // 包装容器不处理直接文本节点，避免重复解析
  const WRAPPER_CLASSES = ["plotBox", "plotFrame", "shipChat"];
  const isWrapper = WRAPPER_CLASSES.some((cls) => $root.hasClass(cls));

  $root.contents().each((_, node) => {
    if (node.type === "text") {
      // 包装容器的直接文本节点跳过，防止重复解析
      if (isWrapper) return;

      const txt = cleanRawText($(node).text());
      if (!txt || subOptTexts.has(txt)) return;
      items.push({ type: "dialog", ...parseTextDialogue(txt) });
      return;
    }

    if (node.type === "tag") {
      const $el = $(node);
      // console.log(node.attribs?.class)
      const tagName = node.tagName?.toLowerCase();

      // 跳过元素
      if (["script", "style", "img"].includes(tagName)) return;

      // 子剧情框架
      if ($el.hasClass("plotFrame") || $el.hasClass("plotBox")) {
        const subGroup = parsePlainPlotFrame($, $el, false);
        if (subGroup) items.push({ type: "subPlotGroup", group: subGroup });
        return;
      }

      // br 换行：插入空行标记，后续拆分用
      if (tagName === "br") {
        items.push({ type: "lineBreak" });
        return;
      }

      // 列表：解析内部 li
      if (tagName === "ul") {
        $el.find("> li").each((_, li) => {
          const $clone = $(li).clone();
          convertInlineTags($, $clone);
          const txt = cleanRawText($clone.text());
          const sp = parseTextDialogue(txt);
          if (sp.content) {
            items.push({
              type: "dialog",
              speaker: sp.speaker,
              content: sp.content,
            });
          }
        });
        return;
      }

      if (tagName === "dl") {
        items.push(parseDl($, $el));
        return;
      }

      if (tagName === "li") {
        if (tagName === "li") {
          const $clone = $el.clone();
          convertInlineTags($, $clone);
          const txt = cleanRawText($clone.text());
          const sp = parseTextDialogue(txt);
          if (sp.content) {
            items.push({
              type: "dialog",
              speaker: sp.speaker,
              content: sp.content,
            });
          }
          return;
        }
      }

      if (tagName === "span" || tagName === "b" || tagName === "strong") {
        let text = `${$el.text().trim()}`;
        if (text.startsWith("「") && text.endsWith("」")) {
          const inner = text.slice(1, -1);
          text = `「**${inner}**」`;
        } else {
          text = `**${text}**`;
        }
        items.push({ type: "dialog", speaker: null, content: text });
        return;
      }

      if (tagName === "em" || tagName === "i") {
        let text = `${$el.text().trim()}`;
        if (text.startsWith("「") && text.endsWith("」")) {
          const inner = text.slice(1, -1);
          text = `「*${inner}*」`;
        } else {
          text = `*${text}*`;
        }
        items.push({ type: "dialog", speaker: null, content: text });
        return;
      }

      // 角色对话气泡
      if ($el.hasClass("shipChat")) {
        items.push({ type: "dialog", ...parseShipChat($, $el) });
        return;
      }

      if (["p", "div", "section", "center"].includes(tagName)) {
        const innerItems = parseContainer($, $el);
        items.push(...innerItems);
        return;
      }

      // 其他行内元素：继续递归
      parseContainer($, $el).forEach((item) => items.push(item));
    }
  });

  // 合并连续文本，按换行拆分
  const merged = [];
  let buffer = "";
  for (const item of items) {
    if (item.type === "lineBreak") {
      if (buffer.trim()) {
        merged.push({ type: "dialog", ...parseTextDialogue(buffer) });
        buffer = "";
      }
      continue;
    }
    if (item.type === "dialog" && !item.speaker) {
      buffer += (buffer ? " " : "") + item.content;
    } else {
      if (buffer.trim()) {
        merged.push({ type: "dialog", ...parseTextDialogue(buffer) });
        buffer = "";
      }
      merged.push(item);
    }
  }
  if (buffer.trim())
    merged.push({ type: "dialog", ...parseTextDialogue(buffer) });

  return merged.filter((it) => it.type !== "lineBreak");
}

export function parseBlockQuote($, $root) {
  let items = [];
  const $p = $root.children("p");
  const $rightDiv = $root
    .children("div")
    .filter(function () {
      const style = $(this).attr("style") || "";
      return /text-align\s*:\s*right/i.test(style);
    })
    .first();

  if ($p.length && $rightDiv.length) {
    const $proot = $p.first();
    convertInlineTags($, $proot);
    const mainText = cleanRawText($proot.text());

    const $spans = $rightDiv.find("span");
    const locationParts = [];
    $spans.each((_, span) => {
      const text = $(span).text().trim();
      if (text) locationParts.push(`<i><strong>${text}</strong></i>`);
    });
    const locationText =
      locationParts.length > 0
        ? locationParts.join(" ")
        : cleanRawText($rightDiv.text());

    items.push({ type: "dialog", speaker: null, content: `**${mainText}**` });
    items.push({ type: "lineBreak" });
    items.push({
      type: "dialog",
      speaker: null,
      content: `<div style="text-align:right">-- ${locationText}</div>\n`,
    });
  } else {
    const innerItems = parseContainer($, $root);
    items.push({
      type: "blockquote",
      items: innerItems,
      isSimple: false,
    });
  }
  return items;
}

export function parseCollapseFrame($, $frame) {
  const title = cleanRawText($frame.find(".ys-collapse-title").text())?.trim();
  const $innerContent = $frame.find(".ys-collapse-content").first();
  const lines = parseContainer($, $innerContent);
  return { type: "collapse", title, items: lines };
}

export function parseTabbertab($, $tab) {
  const tabTitle = $tab.attr("title")?.trim() || "";
  const $plotBox = $tab.find(".plotBox").first();
  const options = [];
  const blocks = [];

  if ($plotBox.length) {
    $plotBox.find("> .plotOptions").each((_, el) => {
      const optText = cleanRawText($(el).text())?.trim();
      options.push(optText);
    });
    $plotBox.find("> .content").each((_, el) => {
      const items = parseContainer($, $(el));
      blocks.push(items);
    });
  } else {
    const items = parseContainer($, $tab);
    if (items.length > 0) {
      blocks.push(items);
    }
  }
  return { tabTitle, options, blocks };
}

export function parsePlainPlotFrame($, $plotFrame) {
  let $plotBox = $plotFrame.find("> .plotBox").first();
  if (!$plotBox.length) $plotBox = $plotFrame;
  if (!$plotBox?.hasClass("plotBox")) return null;
  const options = [];
  const blocks = [];
  $plotBox.find("> .plotOptions").each((_, el) => {
    const optText = cleanRawText($(el).text());
    options.push(optText);
  });
  $plotBox.find("> .content").each((_, el) => {
    const items = parseContainer($, $(el), false);
    blocks.push(items);
  });
  return { type: "plainPlotGroup", options, blocks };
}

export function parseShipChat($, $el) {
  const $clone = $el.clone();
  convertInlineTags($, $clone);
  const chatbox = $clone.children("div.chatBox");
  return {
    speaker: chatbox.children("div.chat_title").text().trim(),
    content: chatbox.children("div.chat_textbox").text().trim(),
  };
}
