/**
 * @typedef {function($: cheerio.CheerioAPI, $el: cheerio.Cheerio<cheerio.Element>, $parent: cheerio.Cheerio<cheerio.Element>): MarkdownNode} NodeParser
 */

/** @type {Record<string, NodeParser>} */
const _parsers = {};

function genParser(type) {
  return function p($, $el, $p) {
    const children = parseAll($, $el);
    return { type, children };
  };
}

function genHeadingParser(type) {
  return function p($, $el, $p) {
    // 直接提取该标题标签下的所有纯文本（Cheerio 会自动忽略 span 等标签，只拿文字）
    const text = $el.text()?.trim();

    // 如果提取不到文字，返回 null 节点
    if (!text) return { type: "null" };

    // 直接返回一个包含纯文本的子节点，不再保留 span 的嵌套结构
    return {
      type,
      children: [{ type: "text", text }],
    };
  };
}

export function parseOne($, $el, $parent) {
  const realParent = _insureParent($el, $parent);
  const parser = _getValidParser($el);
  return parser($, $el, realParent);
}

export function parseAll($, $els) {
  const res = [];
  $els.contents().each((_, el) => {
    const astNode = parseOne($, $(el), $els);
    if (astNode.type !== "null") res.push(astNode);
  });
  return res;
}

const _baseName = (tag) => tag.split(".")[0];

const _insureParent = ($el, $parent) => $parent ?? $el;

const _genTag = ($el) => {
  const el = $el[0];
  if (el.type === "text") return "#text";
  if (el.type === "comment") return "#null";

  const tagName = el.tagName.toLowerCase();
  const cls = $el.attr("class");
  if (cls) {
    const firstCls = cls.split(" ")[0];
    return `${tagName}.${firstCls}`;
  }
  return tagName;
};

const _getValidParser = ($el) => {
  const tagKey = _genTag($el);
  const base = _baseName(tagKey);
  return _parsers[tagKey] ?? _parsers[base] ?? _parsers.div;
};

_parsers.img = ($, $el) => {
  const src = $el.attr("src")?.trim();
  if (!src) return { type: "null" };
  return { type: "img", src };
};

_parsers.a = ($, $el) => {
  const href = $el.attr("href")?.trim();
  if (!href || href.startsWith("javascript:")) return { type: "null" };
  return {
    type: "a",
    href,
    children: parseAll($, $el),
  };
};

_parsers["#text"] = ($, $el, $parent) => {
  let rawText = $el.text()?.replace(/\s+/g, " ").trim();
  if (!rawText) return { type: "null" };

  const parentTag = _genTag($parent);

  if (parentTag === "li") {
    const splited = rawText.replaceAll(":", "：").split("：");
    const speaker = splited[0];
    const text = splited.slice(1).join("：");
    return {
      type: "dialog",
      speaker,
      text,
    };
  }

  if (parentTag == "p") {
    if (rawText.includes(" ") && rawText.replaceAll(":", "：").includes("：")) {
      return {};
    }
  }

  return {
    type: "text",
    text: rawText,
  };
};
_parsers.span = genParser("bold");
_parsers.b = genParser("bold");
_parsers.strong = genParser("bold");
_parsers.em = genParser("italic");
_parsers.i = genParser("italic");
_parsers.p = genParser("node");
_parsers.li = genParser("element");
_parsers.ul = ($, $el, $parent) => {
  const children = parseAll($, $el);
  return {
    type: _genTag($parent) === "li" ? "indent" : "node",
    children,
  };
};
_parsers.div = genParser("node");
_parsers.blockquote = genParser("quote");
_parsers.h1 = genHeadingParser("h1");
_parsers.h2 = genHeadingParser("h1");
_parsers.h3 = genHeadingParser("h2");
_parsers.h4 = genHeadingParser("h3");
_parsers.null = () => ({ type: "null" });
_parsers.br = ($, $el) => ({ type: "text", text: "\n" });

_parsers["#null"] = _parsers.null;
_parsers["span.smw-highlighter"] = _parsers.null;

// TODO
_parsers["div.plotBox"] = ($, $el, $parent) => {
  console.log("Parsing div.plotBox");
  let opts = [];
  let contents = [];
  $el.children(".plotOptions").each((_, el) => {
    const $el = $(el);
    const childNodes = parseAll($, $el);
    opts.push({ type: "node", children: childNodes });
  });
  $el.children(".content").each((_, el) => {
    const $el = $(el);
    const childNodes = parseAll($, $el);
    contents.push({ type: "node", children: childNodes });
  });

  return {
    type: "node", children: opts.map((opt, index) => {
      if (opt.type !== "node") return;
      const content = contents[index];
      if (!content || content.type !== "node") return;
      return {
        type: "node",
        children: [{ type: "element", children: opt.children }, { type: "indent", children: content.children }],
      };
    }).filter((opt) => opt)
  };
}

_parsers["div.plotFrame"] = _parsers.div;
_parsers["div.plotOptions"] = _parsers.div;
_parsers["div.content"] = _parsers.div;
_parsers["div.resourceLoader"] = _parsers.null;

_parsers["dl"] = ($, $el, $parent) => {
  const children = parseAll($, $el);
  // A dl/dd/dl wrapper is only structural; avoid adding another quote level.
  const onlyDd = $el.children().length === 1 && $el.children().first().is("dd");
  const $dd = onlyDd ? $el.children().first() : null;
  const onlyDlInDd = $dd && $dd.children().length === 1 && $dd.children().first().is("dl");
  return {
    type: onlyDd && onlyDlInDd ? "node" : "quote",
    children,
  };
}

_parsers["dt"] = ($, $el, $parent) => {
  const children = parseAll($, $el);
  return {
    type: "element",
    children,
  };
}

_parsers["dd"] = _parsers["dt"];

export default Object.freeze(_parsers);