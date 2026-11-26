import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const section = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
const data = {};
runInNewContext(section("      let model =", "      const canvas =") + "this.reference = model.pipes;", data);
const context = {
  model: { pipes: [], joints: [] }, explosion: 0, explodeOrigin: [0, 0, 0],
  showAccessories: true, pendingPipe: null, pendingResize: null, objects: [],
  palette: [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]],
  gl: { deleteBuffer() {} }, requestRender() {}, cylinder() {}, sphere() {}, upload() {},
  boxes: [], tubes: [],
  box(mesh, a, b) { context.boxes.push({ a: Array.from(a), b: Array.from(b) }); },
  loopTube(mesh, points) { context.tubes.push(Array.from(points, p => Array.from(p))); }
};
runInNewContext(section("      const add =", "      function matrixMultiply") +
  section("      function expandedPoint(", "      let program,") +
  "this.layout = accessoryLayout; this.build = buildScene;", context);
function draw(pipes) {
  context.model = { pipes, joints: [] };
  context.boxes = [];
  context.tubes = [];
  context.build();
  return context.layout();
}
const oldPipes = Array.from(data.reference.filter(p => Number(p.id.slice(1)) <= 79), p => ({ ...p,
  a: Array.from(p.a, (v, axis) => axis === 0 && v === 4 ? 3 : v),
  b: Array.from(p.b, (v, axis) => axis === 0 && v === 4 ? 3 : v)
}));
for (const [pipes, maxX] of [[data.reference, 4], [oldPipes, 3]]) {
  const layout = draw(pipes);
  assert.equal(layout.trampoline.max[0], maxX);
  assert.equal(layout.platforms.length, 2);
  assert.equal(layout.rings.length, 2);
  const pad = context.boxes.find(box => box.a[2] === 0.99);
  assert.deepEqual(pad, { a: [1.11, 0.11, 0.99], b: [maxX - 0.11, 1.89, 1.01] }, "实际渲染垫面必须位于当前蹦床边框内");
  const springs = context.tubes.filter(points => points.length === 3);
  assert.ok(springs.length > 0);
  assert.ok(springs.flat().every(([x, y]) => x >= 0.96 && x <= maxX + 0.04 && y >= -0.04 && y <= 2.04), "实际渲染弹簧不能超出当前长宽边界");
  assert.ok(springs.some(points => points[1][0] === maxX), "短边弹簧必须连到当前右边框");
}
const incomplete = draw(data.reference.filter(p => p.id !== "P082"));
assert.equal(incomplete.trampoline, null, "边框缺一段时不应显示悬空蹦床面");
assert.ok(context.boxes.every(box => box.a[2] !== 0.99));
assert.equal(context.tubes.filter(points => points.length === 3).length, 0);
const noBeam = draw(data.reference.filter(p => p.group !== "吊环横梁"));
assert.equal(noBeam.rings.length, 0, "缺少横梁时不应显示悬空吊环");
const custom = draw([{ id: "P001", a: [0, 0, 0], b: [1, 0, 0], group: "自定义" }]);
assert.equal(custom.platforms.length, 0);
assert.equal(custom.trampoline, null);
assert.equal(custom.bounds.length, 0, "自定义单管不能带出默认模型的附件和取景边界");
context.showAccessories = false;
draw(data.reference);
assert.equal(context.boxes.length, 1, "关闭附件后只保留地板");
context.showAccessories = true;
context.explosion = 1;
draw(data.reference);
assert.equal(context.boxes.length, 0, "爆炸图不显示附件");
console.log("检查通过：新旧模型的实际垫面与弹簧边界、断开边框、缺失横梁和附件显隐。");
