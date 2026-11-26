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

const referenceContext = {};
runInNewContext(section("      let model =", "      const canvas =") + "this.reference = model;", referenceContext);
const reference = referenceContext.reference;
const referenceValidator = validator();
const validated = referenceValidator.construct(reference.pipes);
const endpoints = reference.pipes.flatMap(p => [p.a, p.b]);
assert.deepEqual([0, 1, 2].map(axis => Math.max(...endpoints.map(p => p[axis])) - Math.min(...endpoints.map(p => p[axis]))), [4, 2, 4], "默认方案必须长4根、宽2根、高4根");
assert.ok(reference.pipes.every(p => Math.abs(Math.hypot(...p.b.map((v, i) => v - p.a[i])) - 1) < 0.000001), "延长模型须增加35cm管，不能拉伸现有管子");
for (const y of [0, 2]) {
  const base = reference.pipes.filter(p => p.group === "底座" && p.a[1] === y && p.b[1] === y && p.a[2] === 0 && p.b[2] === 0);
  assert.deepEqual(Array.from(base, p => Math.min(p.a[0], p.b[0])).sort((a, b) => a - b), [0, 1, 2, 3], "底座长边必须由4根管连续连接");
  for (let z = 0; z < 4; z++) assert.ok(reference.pipes.some(p => p.group === "立柱" && p.a.join() === [3, y, z].join() && p.b.join() === [3, y, z + 1].join()), "新增跨度须保留中间立柱连接");
}
assert.equal(reference.joints.length, validated.joints.length, "默认接头数据应与管子连接一致");
const byId = new Map(reference.pipes.map(p => [p.id, p]));
for (const joint of reference.joints) {
  for (const id of joint.pipes) assert.ok([byId.get(id).a, byId.get(id).b].some(p => p.join() === joint.p.join()), "接头引用的管子必须实际连接到该位置");
}
const visited = new Set([reference.pipes[0].id]);
let changed = true;
while (changed) {
  changed = false;
  for (const joint of reference.joints) if (joint.pipes.some(id => visited.has(id))) for (const id of joint.pipes) if (!visited.has(id)) { visited.add(id); changed = true; }
}
assert.equal(visited.size, reference.pipes.length, "默认模型的新增跨度必须与原架连通");
console.log("检查通过：默认4×2×4管跨度、35cm分段、底座连续连接、中间立柱和接头连通。");
