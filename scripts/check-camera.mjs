import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const section = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
const context = {
  model: { pipes: [], joints: [] },
  camera: { target: [1.5, 1, 1.8], distance: 8.6, azimuth: -1.03, polar: 1.11 },
  canvas: { clientWidth: 1200, clientHeight: 700 },
  showAccessories: false, explosion: 0, explodeOrigin: [0, 0, 0],
  document: { querySelectorAll: () => [] },
  requestRender() {}
};
runInNewContext(
  section("      const add =", "      function vertex(") +
  section("      function expandedPoint(", "      function buildScene(") +
  section("      function cameraEye(", "      function render(") +
  section("      function zoom(", "      function pan(") +
  section("      function project(", "      function selectPart(") +
  section("      function fitModel(", "      function downloadFile(") +
  `
    this.zoom = zoom;
    this.setView = setView;
    this.fitModel = fitModel;
    this.projectPoints = points => {
      projectionView = matrixMultiply(perspective(canvas.clientWidth / canvas.clientHeight), lookAt(cameraEye(), camera.target));
      return points.map(point => project(expandedPoint(point)));
    };
  `, context);
const viewNames = ["perspective", "front", "side", "top"];
function modelFrom(pipes) {
  context.model = { pipes, joints: pipes.flatMap(p => [p.a, p.b]).map(p => ({ p })) };
}
function assertFramed(points) {
  for (const [x, y, depth] of context.projectPoints(points)) {
    assert.ok(depth > 0 && x > 0 && x < context.canvas.clientWidth && y > 0 && y < context.canvas.clientHeight,
      `模型点应在画面内：${x}, ${y}, depth=${depth}`);
  }
}
modelFrom([{ a: [18, -18, 18], b: [19, -18, 18] }]);
for (const view of viewNames) {
  context.setView(view);
  assert.deepEqual(Array.from(context.camera.target), [18.5, -18, 18], "切视角须围绕当前模型，而非默认参考架");
  assertFramed(context.model.joints.map(j => j.p));
}
context.camera.target = [0, 0, 0];
context.camera.distance = 80;
context.setView("perspective");
assert.ok(context.camera.distance <= 4, "刷新恢复单根自定义模型时应使用合适距离");

modelFrom([{ a: [-20, -20, -20], b: [-19, -20, -20] }, { a: [19, 20, 20], b: [20, 20, 20] }]);
context.canvas.clientWidth = 360;
context.canvas.clientHeight = 600;
for (const view of viewNames) {
  context.setView(view);
  assertFramed(context.model.joints.map(j => j.p));
}
assert.ok(context.camera.distance > 80, "合法大跨度模型不应被旧距离上限截断");
context.explosion = 1;
context.fitModel();
assertFramed(context.model.joints.map(j => j.p));

context.canvas.clientHeight = 1200;
context.fitModel();
const expandedDistance = context.camera.distance;
assert.ok(expandedDistance > 600, "回归应覆盖窄屏爆炸图超过旧缩放上限的模型");
context.zoom(1.25);
assert.ok(context.camera.distance > expandedDistance, "缩小不能因硬上限反而放大模型");
assertFramed(context.model.joints.map(j => j.p));

context.explosion = 0;
context.showAccessories = true;
context.setView("perspective");
assertFramed([[0, 0, 0], [4, 2, 4]]);
modelFrom([]);
context.showAccessories = false;
context.setView("front");
assert.deepEqual(Array.from(context.camera.target), [0, 0, 0.5], "空白方案应定位到原点附近");
assert.equal(context.camera.distance, 3);
assert.equal(context.camera.azimuth, -Math.PI / 2, "空白方案切视角不应递归复位");
console.log("检查通过：自定义模型四向取景、恢复取景、窄屏大跨度、爆炸图和空白方案视角。");
