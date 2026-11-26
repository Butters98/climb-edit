import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const section = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
function validator() {
  const context = { model: { pipes: [], joints: [] }, pairChecks: 0 };
  runInNewContext(
    section("      const add =", "      function matrixMultiply") +
    section("      const jointCatalog =", "      let connectorChoices =") +
    section("      function findConnector(", "      function report(") +
    `
      const originalPairCheck = validateSegmentPair;
      validateSegmentPair = (...args) => { this.pairChecks++; return originalPairCheck(...args); };
      this.construct = constructModel;
      this.directions = directions;
    `,
    context
  );
  return context;
}
const pipe = (id, a, b) => ({ id, a, b, group: "自定义" });
const context = validator();
const pipes = [
  pipe("P001", [0, 0, 0], [1, 0, 0]),
  pipe("P002", [0, 2, 0], [1, 2, 0]),
  pipe("P003", [0, 4, 0], [1, 4, 0])
];
context.construct(pipes);
assert.equal(context.pairChecks, 3, "初次输入必须验证所有管对");
context.construct(structuredClone(pipes));
assert.equal(context.pairChecks, 3, "坐标相同的独立对象可复用几何验证");
const extra = pipe("P004", [0, 6, 0], [1, 6, 0]);
pipes.push(extra);
context.construct(pipes);
assert.equal(context.pairChecks, 6, "添加管子仅校验与原有管子的关系");
extra.a = [0.5, 0, 0];
extra.b = [1.5, 0, 0];
assert.throws(() => context.construct(pipes), /重叠/, "原地改动已验证对象仍须检查重叠");
assert.throws(() => context.construct(structuredClone(pipes)), /重叠/, "失败不能将非法几何加入缓存");
extra.a = [0.5, -0.5, 0];
extra.b = [0.5, 0.5, 0];
assert.throws(() => context.construct(pipes), /管身相交/, "改动管子必须保留交叉检查");
extra.a = [1, 0, 0];
extra.b = [1, 1, 0];
const connected = context.construct(pipes);
assert.equal(connected.joints.find(j => j.p[0] === 1 && j.p[1] === 0).pipes.length, 2, "端点连接应保持有效");
assert.throws(() => context.construct(pipes, { "35.0000,0.0000,0.0000": "一字接头" }), /无法匹配/, "几何缓存不得跳过接头兼容检查");
extra.b[1] = 0.5;
assert.throws(() => context.construct(pipes), /只支持15cm或35cm/, "缓存不得跳过管长检查");

const large = validator();
const base = Array.from({ length: 499 }, (_, i) => {
  const a = [(i % 10) * 2 - 9, (Math.floor(i / 10) % 10) * 2 - 9, Math.floor(i / 100) * 2];
  return pipe("P" + String(i + 1).padStart(3, "0"), a, [a[0] + 1, a[1], a[2]]);
});
large.construct(base);
assert.equal(large.pairChecks, 499 * 498 / 2);
const before = large.pairChecks;
const started = performance.now();
for (const direction of large.directions) {
  const a = [-15, -15, 0];
  large.construct([...base, pipe("P500", a, a.map((v, i) => v + direction.vector[i]))]);
}
assert.equal(large.pairChecks - before, 499 * large.directions.length, "18个候选方向应只检查新增管对，避免重复验证旧管对");
assert.throws(() => large.construct([...base, base[0], base[1]]), /最多支持500/);
console.log(`检查通过：几何缓存、原地坐标变更、交叉与重叠、失败重试、接头兼容；499根管的18方向校验 ${Math.round(performance.now() - started)}ms。`);
