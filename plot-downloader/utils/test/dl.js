import { load } from "cheerio";
import { parseDl } from "../md/parser.js";
import { renderDl } from "../md/render";

const html = `<dl id="1"><dd><dl><dd><span style="color:#ba7920">在诗人的颂唱下，你们了解了「天空之龙」的故事…</span></dd>
<dd>我要说的故事开始于太古<br></dd>
<dd>那时众神还行走于大地<br></dd>
<dd>天空之龙自天空降下<br></dd>
<dd>对世间的一切都充满好奇<br></dd>
<dd>龙寻求着自己的答案<br></dd>
<dd>却无法理解尘世的芜杂<br></dd>
<dd>风之歌者奏响琴弦<br></dd>
<dd>天空之琴为它一一回答<br></dd>
<dd>龙不过是好奇的孩子<br></dd>
<dd>只是忘忧地飞翔，直至时今<br></dd>
<dd>它聆听诗文，想要学会歌唱<br></dd>
<dd>为了让万物，都明白它的心<br></dd>
<dd>歌者与龙化作传说<br></dd>
<dd>黑暗的时代随即降临<br></dd>
<dd>此时狮牙朽坏，鹰旗不扬<br></dd>
<dd>另一条恶龙向蒙德迫近<br></dd>
<dd>苦难是大教堂上笼罩的阴影<br></dd>
<dd>嗟叹由诗人重新结成诗话<br></dd>
<dd>天空之龙听从呼唤而来<br></dd>
<dd>在暴风中与恶龙决死、厮杀<br></dd>
<dd>天空之龙咽下恶龙毒血，陷入沉睡<br></dd>
<dd>多年后却已无人认识复苏的它<br></dd>
<dd>“如今的人们，为何将我厌弃？”<br></dd>
<dd>天空之琴没有说话<br></dd>
<dd>愤怒与悲伤，生命与毒血一同<br></dd>
<dd>化作眼泪从龙的眼角落下<br></dd>
<dd>诗文沉默，腐化轻易生效<br></dd>
<dd>天空之琴却已没有办法说话<br></dd></dl></dd></dl>`

const $ = load(html);

console.log(renderDl(parseDl($, $("#1"))))