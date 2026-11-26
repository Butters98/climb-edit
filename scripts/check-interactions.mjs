import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const section = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
const elements = new Map();
const context = {
  model: { pipes: [{ id: "P001", a: [0, 0, 0], b: [1, 0, 0] }], joints: [] },
  selectedId: "P001", connectorChoices: {}, showAccessories: false,
  partsById: new Map(), pendingPipe: null, pendingResize: null, gl: null,
  $: id => {
    if (!elements.has(id)) elements.set(id, { value: "", addEventListener(type, handler) { this[type] = handler; } });
    return elements.get(id);
  },
  selectedAnchor: () => [0, 0, 0],
  sub: (a, b) => a.map((v, i) => v - b[i]),
  normalize: a => a.map(v => v / Math.hypot(...a)),
  pipeLength: p => Math.round(Math.hypot(...p.b.map((v, i) => v - p.a[i])) * 35), nextPipeId: () => "P002",
  add: (a, b) => a.map((v, i) => v + b[i]), mul: (a, s) => a.map(v => v * s),
  portVector: key => key === "+Z" ? [0, 0, 1] : [1, 0, 0],
  constructModel: pipes => {
    if (context.invalid) throw new Error("方向冲突");
    return { pipes, joints: [] };
  },
  report: message => { context.message = message; },
  safely: action => { try { action(); } catch (error) { context.message = error.message; } },
  refreshEditor() {}, selectPart() {}, syncChoices() {}, requestRender() {},
  positionKey: p => p.join(",")
};
runInNewContext(
  section("      function snapshot()", "      function findConnector") +
  section("      function applyState(", "      function commit(") +
  section("      function newPipeCandidate(", "      let directionCache") +
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
context.model.joints = [{ id: "J001", p: [0, 0, 0] }];
context.partsById.set("J001", context.model.joints[0]);
context.selectedId = "J001";
const jointSnapshot = context.actions.snapshot();
const originalConstruct = context.constructModel;
context.constructModel = pipes => ({ pipes, joints: [{ id: "J999", p: [0, 0, 0] }] });
context.actions.applyState(jointSnapshot);
assert.equal(context.selectedId, "J999", "接头编号改变后按坐标恢复选择");
context.constructModel = originalConstruct;
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

context.invalid = false;
context.selectedId = "P001";
context.partsById.set("P001", context.model.pipes[0]);
context.commit = (pipes, choices, selection, accessories) => {
  context.committed = { pipes, accessories };
  context.model.pipes = pipes;
  context.pendingResize = null;
};
runInNewContext(section('      $("resize-pipe").addEventListener', '      $("delete-part").addEventListener') +
  section('      $("accessories").addEventListener', '      $("fit-model").addEventListener'), context);
context.$("anchor").value = "start";
context.$("resize-length").value = "15";
context.$("resize-pipe").click();
assert.equal(context.model.pipes[0].b[0], 1, "修改长度预览不能改动模型");
assert.equal(context.pendingResize.b[0], 15 / 35);
context.$("cancel-resize").click();
assert.equal(context.pendingResize, null);
context.$("resize-pipe").click();
context.$("confirm-resize").click();
assert.equal(context.model.pipes[0].b[0], 15 / 35);
context.$("accessories").checked = true;
context.$("accessories").change();
assert.equal(context.committed.accessories, true, "附件切换须进入统一提交流程");
console.log("检查通过：改长预览、取消、确认及附件历史提交。");

// Exercise continuous addition with the real geometry checks and direction controls.
const controls = new Map();
const adding = {
  model: { pipes: [], joints: [] }, partsById: new Map(), selectedId: "", pendingPipe: null,
  $: id => {
    if (!controls.has(id)) controls.set(id, { value: "", options: [], setAttribute() {}, addEventListener(type, handler) { this[type] = handler; } });
    return controls.get(id);
  },
  document: { querySelectorAll: () => [] }, requestRender() {}, safely: action => action(), report() {},
  commit(pipes, choices, selection) {
    adding.model = adding.construct(pipes, choices);
    adding.partsById = new Map([...adding.model.pipes, ...adding.model.joints].map(p => [p.id, p]));
    adding.selectedId = selection;
    adding.pendingPipe = null;
    adding.sync(); // The editor refreshes selection during commit, before switching anchor.
  }
};
runInNewContext(
  section("      const add =", "      function matrixMultiply") +
  section("      const jointCatalog =", "      let connectorChoices =") +
  "let connectorChoices = {};\n" +
  section("      function findConnector(", "      function report(") +
  section("      function selectedAnchor(", "      function fitModel(") +
  section("      function newPipeCandidate(", "      function previewNewPipe(") +
  section("      function syncChoices()", '      for (const id of ["direction", "new-length"])') +
  section('      $("confirm-add").addEventListener', '      $("cancel-add").addEventListener') +
  "this.construct = constructModel; this.sync = syncChoices;", adding);
adding.$("anchor").value = "start";
adding.$("new-length").value = "35";
adding.$("direction").value = "+Z";
adding.$("direction").options = [{ value: "+Z" }, { value: "-Z" }];
adding.pendingPipe = { id: "P001", a: [0, 0, 0], b: [0, 0, 1] };
adding.$("confirm-add").click();
assert.equal(adding.$("anchor").value, "end");
assert.equal(adding.$("direction").options[0].disabled, false, "确认添加后末端向上应可立即继续接管");
assert.equal(adding.$("direction").options[1].disabled, true, "末端反向重叠必须禁用");
assert.equal(adding.$("add-pipe").disabled, false);
assert.match(adding.$("add-origin").textContent, /P001 的终点 B.*35 cm/, "添加位置应展示新管末端坐标");
adding.pendingPipe = { id: "P002", a: [0, 0, 1], b: [0, 0, 2] };
adding.$("confirm-add").click();
assert.equal(adding.model.pipes.length, 2);
assert.equal(adding.$("add-pipe").disabled, false, "第二次确认后仍可继续向上");
assert.match(adding.$("add-origin").textContent, /P002 的终点 B.*70 cm/);
console.log("检查通过：连续接管的端点、方向可用性与添加位置提示同步。");

adding.confirm = () => false;
adding.setView = view => { adding.lastView = view; };
adding.switchEditorTab = tab => { adding.lastTab = tab; };
runInNewContext(section('      $("new-design").addEventListener', '      $("restore-reference").addEventListener'), adding);
adding.$("new-design").click();
assert.equal(adding.model.pipes.length, 2, "取消新建应保留当前方案");
adding.confirm = () => true;
adding.$("new-design").click();
assert.equal(adding.model.pipes.length, 0);
assert.equal(adding.lastTab, "add", "空白方案应直接进入添加管子");
assert.equal(adding.lastView, "perspective", "新建空白须重置到原点取景");
assert.match(adding.$("add-origin").textContent, /原点添加第一根管/);
console.log("检查通过：隔离状态下的新建确认、取消、添加入口与视角复位。");
