import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const section = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
const elements = new Map();
const context = {
  model: { pipes: [{ id: "P001", a: [0, 0, 0], b: [1, 0, 0] }], joints: [] },
  selectedId: "P001", connectorChoices: {}, showAccessories: false,
  partsById: new Map(), pendingPipe: null, gl: null,
  $: id => {
    if (!elements.has(id)) elements.set(id, { value: "", addEventListener(type, handler) { this[type] = handler; } });
    return elements.get(id);
  },
  selectedAnchor: () => [0, 0, 0], nextPipeId: () => "P002",
  add: (a, b) => a.map((v, i) => v + b[i]), mul: (a, s) => a.map(v => v * s),
  portVector: key => key === "+Z" ? [0, 0, 1] : [1, 0, 0],
  constructModel: pipes => {
    if (context.invalid) throw new Error("方向冲突");
    return { pipes, joints: [] };
  },
  report: message => { context.message = message; },
  safely: action => { try { action(); } catch (error) { context.message = error.message; } },
  refreshEditor() {}, selectPart() {}
};
runInNewContext(
  section("      function snapshot()", "      function findConnector") +
  section("      function applyState(", "      function commit(") +
  section("      function previewNewPipe()", '      $("resize-pipe").addEventListener') +
  section("      function cancelPreview()", "      function switchEditorTab(") +
  section('      for (const id of ["direction", "new-length", "anchor"])', '      $("focus-part").addEventListener') +
  '\nthis.actions = { snapshot, applyState };', context);
const before = context.actions.snapshot();
context.selectedId = "";
context.actions.applyState(before);
assert.equal(context.selectedId, "P001", "撤销应恢复选中部件");
context.actions.applyState({ pipes: [], connectors: {}, selectedId: "P001" });
assert.equal(context.selectedId, "", "不存在的部件不应保持选中");
context.actions.applyState(before);
context.$("new-length").value = "35";
context.$("direction").value = "+Z";
context.$("add-pipe").click();
assert.equal(context.pendingPipe.b[2], 1);
context.$("new-length").value = "15";
context.$("new-length").change();
assert.equal(context.pendingPipe.b[2], 15 / 35);
context.$("direction").value = "+X";
context.$("direction").change();
assert.equal(context.pendingPipe.b[0], 15 / 35);
assert.equal(context.pendingPipe.b[2], 0);
assert.equal(context.model.pipes.length, 1, "预览不能提交到模型");
context.invalid = true;
context.$("direction").change();
assert.equal(context.pendingPipe, null, "无效方向必须清除旧预览");
assert.equal(context.$("preview-actions").hidden, true);
assert.equal(context.$("add-pipe").hidden, false);
assert.equal(context.message, "方向冲突");
console.log("检查通过：历史选择恢复、预览参数更新、冲突清除及预览不提交。");
