import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const captureTemplate = source.slice(0, source.indexOf("      let model ="));
const exportAction = source.slice(source.indexOf('      $("export-html").addEventListener'), source.indexOf("      function cancelPreview()"));
const savedPattern = /(<script id="saved-design" type="application\/json">)[\s\S]*?(<\/script>)/;
const markup = html.slice(html.indexOf("<html"), html.lastIndexOf("</html>") + 7);

// A DOM snapshot preserves its own markup when the live document later changes.
class Snapshot {
  constructor(markup) { this.markup = markup; }
  cloneNode(deep) { assert.equal(deep, true); return new Snapshot(this.markup); }
  querySelector(selector) {
    assert.equal(selector, "#saved-design");
    const owner = this;
    return { set textContent(value) { owner.markup = owner.markup.replace(savedPattern, (_, open, close) => open + value + close); } };
  }
  get outerHTML() { return this.markup; }
}
let identity = 0;
function openEditor(markup) {
  const documentMarkup = markup.slice(markup.indexOf("<html"), markup.lastIndexOf("</html>") + 7);
  const liveDocument = new Snapshot(documentMarkup);
  let click;
  const downloads = [];
  const context = {
    document: { documentElement: liveDocument },
    $: id => {
      assert.equal(id, "export-html");
      return { addEventListener(type, handler) { assert.equal(type, "click"); click = handler; } };
    },
    crypto: { randomUUID: () => `export-${++identity}` },
    serializedDesign: () => context.design,
    downloadFile: (name, content, type) => downloads.push({ name, content, type }),
    report() {}
  };
  runInNewContext(captureTemplate + exportAction, context);
  return { context, liveDocument, downloads, export: () => click() };
}
const design = { version: 1, units: "cm", pipes: [{ id: "P001", a: [0, 0, 0], b: [0, 0, 35], group: "自定义" }], connectors: {}, showAccessories: false };
const editor = openEditor(markup);
editor.context.design = design;
editor.liveDocument.markup = markup
  .replace('<div id="length-buttons" class="choice-grid"></div>', '<div id="length-buttons" class="choice-grid"><button>运行时长度按钮</button></div>')
  .replace('<button id="add-pipe">', '<button id="add-pipe" hidden>')
  .replace('id="preview-actions" class="editor-row" hidden', 'id="preview-actions" class="editor-row"')
  .replace('<div id="detail"', '<div data-runtime-selection="true" id="detail"');
const liveBefore = editor.liveDocument.markup;
editor.export();
const first = editor.downloads[0];
assert.equal(first.name, "我的攀爬架编辑器.html");
assert.equal(first.type, "text/html;charset=utf-8");
const payload = JSON.parse(first.content.match(savedPattern)[0].replace(/^<script[^>]*>|<\/script>$/g, ""));
assert.deepEqual(payload, { ...design, draftId: "export-1" }, "导出须保留当前已确认的方案并分配独立草稿标识");
assert.equal(first.content.replace(savedPattern, "<saved-design />"), "<!doctype html>\r\n" + markup.replace(savedPattern, "<saved-design />"), "导出必须使用初始界面，排除生成控件、选中状态与未确认预览");
assert.equal(editor.liveDocument.markup, liveBefore, "导出不能改变正在编辑的页面");

editor.context.design = { ...design, pipes: [] };
editor.export();
assert.match(editor.downloads[1].content, /"draftId":"export-2"/);
assert.match(editor.downloads[1].content, /"pipes":\[\]/, "再次导出应写入最新已确认方案");
const reopened = openEditor(first.content);
reopened.context.design = { ...design, note: "</script><script>" };
reopened.export();
const reexported = reopened.downloads[0].content;
assert.equal(reexported.replace(savedPattern, "<saved-design />"), first.content.replace(savedPattern, "<saved-design />"), "重开后再导出不应累积运行时控件");
assert.ok(reexported.includes('"note":"\\u003c/script>\\u003cscript>"'), "内嵌数据必须转义脚本闭合标签");
console.log("检查通过：HTML导出界面隔离、重复导出、草稿标识与内嵌数据转义。");
