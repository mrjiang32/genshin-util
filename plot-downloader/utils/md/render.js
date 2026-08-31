import { safeLog } from "../logger.js";
import { b } from "./parser.js";

export function renderBranchGroup(node, indent) {
  let out = "";
  for (const br of node.branches) {
    out += `  \n${indent}### ${br.tabTitle}\n\n`;
    const max = Math.max(br.options.length, br.blocks.length);
    for (let i = 0; i < max; i++) {
      const opt = br.options[i];
      const blockItems = br.blocks[i];
      if (opt) out += `${indent}- 选项：${b(opt)}  \n`;
      if (blockItems && blockItems.length > 0) {
        const childIndent = opt ? indent + "  " : indent;
        out += renderContentItems(blockItems, childIndent) + "  \n";
      }
    }
  }
  return out;
}

export function renderDl(dlNode, indent = "") {
  let out = "";

  for (const dd of dlNode.items) {
    // dd.items 中每一项可能是 text 节点或嵌套 dl 节点
    for (const item of dd.items) {
      if (item.type === "text") {
        // text 节点：直接输出（span 解析时已自带 ** 加粗标记）
        out += `${indent}> ${item.text}  \n`;
      } else if (item.type === "dl") {
        // 嵌套 dl：递归渲染，缩进加深
        out += renderDl(item, indent + (dd.items.filter((s) => s.type === "dl").length === 1 ? "" : "  "));
      }
    }
    out += (dd.items.filter((s) => s.type === "dl").length === 1 ? "" : ">  \n")
  }

  return out;
}

/**
 * 递归渲染 content items，支持 dialog、blockquote、嵌套 subPlotGroup
 * @param {Array} items 解析出的 items 数组
 * @param {string} indent 当前缩进字符串
 * @param {boolean} isBlockquote 是否在引用块内
 */
export function renderContentItems(items, indent, isBlockquote = false) {
  let out = "";
  const prefix = isBlockquote ? ">" : "";

  for (const it of items) {
    if (it.type === "dialog") {
      const dialogPrefix = it.speaker ? `- **${it.speaker}**：` : "";
      out += `${indent}${prefix}${dialogPrefix}${it.content}  \n`;
    } else if (it.type === "blockquote") {
      if (it.isSimple) {
        out += `${indent}> **${it.content}**  \n`;
      } else {
        // 复杂引用块：递归渲染，内部加引用前缀
        out += renderContentItems(it.items, indent, true); // ← 改这里
      }
    } else if (it.type === "subPlotGroup") {
      const subIndent = indent + "  ";
      out += renderPlainPlotGroup(it.group, subIndent, true);
    } else if (it.type === "text") {
      out += `${indent}${it.text}`;
    } else if (it.type === "dl") {
      out += renderDl(it, indent);
    }
  }
  return out;
}

/**
 * @param {*} node
 * @param {string} indent
 * @param {boolean} isNested 是否为嵌套子剧情
 */
export function renderPlainPlotGroup(node, indent, isNested = false) {
  let out = `${indent}\n`;
  const max = Math.max(node.options.length, node.blocks.length);
  for (let i = 0; i < max; i++) {
    const opt = node.options[i];
    const blockItems = node.blocks[i];
    if (opt) out += `${indent}- 选项：${b(opt)}  \n`;
    if (blockItems && blockItems.length > 0) {
      const childIndent = opt ? indent + "  " : indent;
      out += renderContentItems(blockItems, childIndent) + "  \n";
    }
  }
  return out;
}

export function renderCollapse(node, indent) {
  return `${indent}> **${node.title}**  \n${renderContentItems(node.items, indent + "> ")}  \n`;
}

export function renderDialog(node, indent) {
  return `${indent}- **${node.speaker}**：` + ` ${node.content}  \n`;
}

export function renderUl(node, indent) {
  return renderContentItems(node.items, indent);
}
