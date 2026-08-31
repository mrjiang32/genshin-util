import { load } from "cheerio";
import { safeLog } from "./logger.js";
import {
  parseCollapseFrame,
  parseContainer,
  parseDl,
  parseTextDialogue,
  parsePlainPlotFrame,
  parseShipChat,
  parseTabbertab,
  cleanRawText,
  convertInlineTags,
  parseBlockQuote,
  setMark,
} from "./md/parser.js";
import {
  renderBranchGroup,
  renderCollapse,
  renderContentItems,
  renderDialog,
  renderDl,
  renderPlainPlotGroup,
  renderUl,
} from "./md/render.js";

function fixInlineMergedDialogues(md) {
  const lines = md.split("\n");
  const outLines = [];

  for (const line of lines) {
    const prefixRe = /^(\s*(?:[>-]\s*)*)/;
    const prefixMatch = prefixRe.exec(line);
    const fullPrefix = prefixMatch[1];
    const content = line.slice(fullPrefix.length);

    if (
      /<[^>]+>/g.test(content) ||
      /^#{1,6}\s/.test(content) ||
      !content.trim() ||
      content.replace(fullPrefix, "").trim().split(" ").length <= 1
    ) {
      outLines.push(line);
      continue;
    }

    const chatRegex = /^([^:：]+)[:：](.*)$/;

    const subLines = content
      .trim()
      .split(" ")
      .map((s) => s.replace(fullPrefix))
      .map((s) => {
        const match = s.match(chatRegex);

        if (match) {
          return `${setMark("**", s)}：${match[2].trim()}`;
        }
        return s;
      });

    outLines.push(...subLines);
  }

  return outLines.join("  \n");
}

export function parseAst($, nodes) {
  const ast = [];
  let i = 0;
  while (i < nodes.length) {
    const el = nodes[i];
    const $el = $(el);
    const tag = el.tagName?.toLowerCase();
    if ($el.hasClass("ys-collapse-frame")) {
      ast.push(parseCollapseFrame($, $el));
      i++;
      continue;
    }
    if (["h2", "h3", "h4"].includes(tag)) {
      // 标题内 span 为锚点，直接提取纯文本
      ast.push({ type: "heading", text: cleanRawText($el.text()) });
      i++;
      continue;
    }
    if ($el.hasClass("tabber")) {
      const group = { type: "branchGroup", groupTitle: "", branches: [] };
      $el.find("> .tabbertab").each((_, tabEl) => {
        group.branches.push(parseTabbertab($, $(tabEl)));
      });
      ast.push(group);
      i++;
      continue;
    }
    if ($el.hasClass("plotFrame")) {
      const plotGroup = parsePlainPlotFrame($, $el);
      if (plotGroup) ast.push(plotGroup);
      i++;
      continue;
    }
    if ($el.hasClass("shipChat")) {
      ast.push({ type: "dialog", ...parseShipChat($, $el) });
      i++;
      continue;
    }
    if (tag === "ul") {
      const domUl = parseContainer($, $el);
      ast.push({ type: "ul", items: domUl });
      i++;
      continue;
    }
    if (tag === "li") {
      const $clone = $el.clone();
      convertInlineTags($, $clone);
      ast.push({ type: "dialog", ...parseTextDialogue($clone.text()) });
      i++;
      continue;
    }
    if (tag === "dl") {
      const $clone = $el.clone();
      convertInlineTags($, $clone);
      ast.push(parseDl($, $clone));
      i++;
      continue;
    }
    if (tag === "blockquote") {
      const $clone = $el.clone();
      if ($clone.children("div").length === 0) {
        convertInlineTags($, $clone);
        const rawTxt = cleanRawText($clone.text());
        // 改为 push blockquote 节点，和 renderContentItems 的 isSimple 分支对齐
        ast.push({ type: "blockquote", content: rawTxt, isSimple: true });
      } else {
        const innerItems = parseBlockQuote($, $clone, true);
        ast.push({ type: "blockquote", items: innerItems, isSimple: false });
      }
      i++;
      continue;
    }
    if (tag === "p" || tag === "center") {
      const $clone = $el.clone();
      convertInlineTags($, $clone);
      const rawTxt = cleanRawText($clone.text());
      if (rawTxt) ast.push({ type: "text", text: rawTxt });
      i++;
      continue;
    }
    const rawTxt = cleanRawText($el.text());
    if (/MediaWiki[:：]PlotOptions/i.test(rawTxt) || rawTxt === "") {
      i++;
      continue;
    }
    ast.push({ type: "text", text: rawTxt });
    safeLog(`触发text ${tag} ${rawTxt}`);
    i++;
  }
  return ast;
}

export function renderAst(ast, depth = 0) {
  const indent = " ".repeat(depth * 4);
  let out = "";
  for (const node of ast) {
    switch (node.type) {
      case "heading":
        out += `${indent}### ${node.text}\n\n`;
        break;
      case "text":
        if (node.text.trim()) out += `${indent}${node.text}\n\n`;
        break;
      case "branchGroup":
        out += renderBranchGroup(node, indent);
        break;
      case "plainPlotGroup":
        out += renderPlainPlotGroup(node, indent);
        break;
      case "collapse":
        out += renderCollapse(node, indent);
        break;
      case "dialog":
        out += renderDialog(node, indent);
        break;
      case "ul":
        out += renderUl(node, indent);
        break;
      case "dl":
        out += renderDl(node, indent);
        break;
      case "blockquote":
        if (node.isSimple) {
          out += `${indent}> **${node.content}**  \n`;
        } else {
          out += renderContentItems(node.items, indent, true);
        }
        break;
    }
  }
  return out;
}

export function extractor($, rootEl) {
  if (!rootEl.length) return "";
  const $parserOutput = rootEl.find(".mw-parser-output").first();
  if ($parserOutput.length) rootEl = $parserOutput;
  const taskStoryHeading = rootEl
    .find("h2,h3")
    .filter((_, el) => cleanRawText($(el).text()) === "任务剧情");
  let targetNodes;
  if (taskStoryHeading.length > 0) {
    targetNodes = taskStoryHeading.nextAll().toArray();
  } else {
    targetNodes = rootEl.find("> *").toArray();
  }
  const ast = parseAst($, targetNodes);
  let mdBody = renderAst(ast, 0);

  mdBody = fixInlineMergedDialogues(mdBody);

  mdBody = mdBody.replace(/(\n\s*){3,}/g, "\n\n").trim();
  return mdBody;
}

export function extractStoryMarkdown($) {
  return extractor($, $("#mw-content-text"));
}
