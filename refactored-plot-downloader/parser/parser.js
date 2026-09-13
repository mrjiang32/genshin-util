import * as cheerio from "cheerio";
import _parsers from "./register.js";

/**
 * @typedef {Object} MarkdownNode
 * @property {'text'|'node'|'bold'|'italic'|'img'|'a'|'quote'|'h1'|'h2'|'h3'|'indent'|'element'|'deline'|'splitline'|'list'|'null'|'dialog'} type
 * @property {string} [src]
 * @property {string} [speaker]
 * @property {string} [href]
 * @property {string} [text]
 * @property {MarkdownNode[]} [children]
 */

function htmlToMdAst(html, root = "body") {
  const $ = cheerio.load(html);
  const rootEl = $(root);
  return parseAll($, rootEl);
}

function renderMdAst(nodes) {
  const lines = [];
  for (const node of nodes) {
    const nodeLines = renderSingleNode(node);
    // 将节点返回的行推入总数组
    if (Array.isArray(nodeLines)) {
      lines.push(...nodeLines);
    } else if (typeof nodeLines === "string") {
      // 兼容可能返回单行字符串的情况
      lines.push(nodeLines);
    }
  }
  return lines;
}

function renderSingleNode(node) {
  switch (node.type) {
    case "text":
      return node.text ?? "";

    case "strong":
    case "b":
    case "bold": {
      const childLines = node.children ? renderMdAst(node.children) : [];
      const content = childLines.join("");
      // 如果拼接后的内容去除空白后为空，则放弃加粗
      if (!content.trim()) return "";
      if (content.trim().startsWith("**")) return content;
      return `**${content}**`;
    }

    case "i":
    case "em":
    case "italic": {
      const childLines = node.children ? renderMdAst(node.children) : [];
      const content = childLines.join("");
      if (!content.trim()) return "";
      if (content.trim().startsWith("*") && !content.trim().startsWith("**"))
        return content;
      return `*${content}*`;
    }

    case "h1":
      return `# ${node.children ? renderMdAst(node.children).join("") : ""}`;

    case "h2":
      return `## ${node.children ? renderMdAst(node.children).join("") : ""}`;

    case "h3":
      return `### ${node.children ? renderMdAst(node.children).join("") : ""}`;

    case "h4":
      return `#### ${node.children ? renderMdAst(node.children).join("") : ""}`;

    case "img":
      return `![image](${node.src})`;

    case "a":
      return `[${node.children ? renderMdAst(node.children).join("") : ""}](${node.href})`;

    // 列表项：加上 "- " 前缀，并作为独立的一行
    case "element":
      const elContent = node.children
        ? renderMdAst(node.children).join(" ").split("\n").join(" ")
        : "";
      return `- ${elContent}`;

    // 缩进容器：递归获取子节点行，并在每行前面加上缩进（例如 2 个空格）
    case "indent":
      const childLines = node.children ? renderMdAst(node.children) : [];
      let mapped = childLines.map((line) => `  ${line}`);
      return mapped;

    // 普通块级容器：直接平铺子节点
    case "node":
      return node.children ? renderMdAst(node.children) : [];

    case "dialog": {
      return node.speaker && node.text
        ? `**${node.speaker}**：${node.text}`
        : `${node.speaker ?? ""}${node.text ?? ""}`;
    }

    case "inline-block": {
      const childLines = node.children ? renderMdAst(node.children) : [];
      return childLines.join("");
    }

    case "newline":
      return "\n";

    case "html": {
      return node?.html ?? "";
    }

    case "quote": {
      const childLines = node.children ? renderMdAst(node.children) : [];
      let mapped = childLines.map((line) => {
        if (line.trim() === "") {
          return ">"; // 空行也要加上引用符号，避免破坏引用块的结构
        }
        // 如果子行本身已经是引用了，直接在最前面加 >，避免变成 > >
        if (line.startsWith(">")) {
          return `>${line}`;
        }
        return `> ${line}`;
      });
      // 在引用块后加一个空行，分隔后续内容
      mapped.push("");
      return mapped;
    }

    case "null":
      return "";

    default:
      return node.children ? renderMdAst(node.children) : [];
  }
}

import { parseAll, parseOne } from "./register.js";

export default {
  parseOne,
  parseAll,
  htmlToMdAst,
  renderMdAst,
};
