const html = `<div id="ys-collapse-3" class="ys-collapse-content collapse in" style="padding: 10px 15px;" aria-expanded="true">
<dl><dd><dl><dd><span style="color:#7F7F7F">随机对话</span></dd></dl></dd></dl>
<ul><li>那条龙随时可能回来，我们西风骑士会盯着的，请抓紧避难。</li>
<li>现在气候异常，外面很危险，一般民众请找安全的地方避难。</li>
<li>现在是紧急事态，请相信我们西风骑士团会保障大家的安全。</li></ul></div>`;

import { load } from "cheerio";
import { convertInlineTags, parseContainer } from "../md/parser.js";

const $ = load(html);

console.log(JSON.stringify(parseContainer($, $("#ys-collapse-3")), null, 2));
