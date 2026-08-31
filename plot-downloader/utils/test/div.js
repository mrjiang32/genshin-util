const html = `<div id="ys-collapse-4" class="ys-collapse-content collapse in" style="padding: 10px 15px;" aria-expanded="true">
派蒙：从这里进去就是<span style="color:rgb(69 113 236)">骑士团</span>啦，快进去看看吧。</div>`;

import { load } from "cheerio";
import { convertInlineTags, parseContainer } from "../md/parser.js";

const $ = load(html);

console.log(JSON.stringify(parseContainer($, $("#ys-collapse-4")), null, 2));
convertInlineTags($, $("#ys-collapse-4"));
console.log($.html())
console.log(JSON.stringify(parseContainer($, $("#ys-collapse-4")), null, 2));
