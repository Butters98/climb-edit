import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const serialization = source.slice(source.indexOf("      function serializedDesign()"), source.indexOf('      $("edit-toggle").addEventListener'));
const drafts = source.slice(source.indexOf("      const draftStorageKey"), source.indexOf('      document.addEventListener("keydown"'));
const referenceContext = {};
runInNewContext(source.slice(source.indexOf("      let model ="), source.indexOf("      const canvas =")) + "this.pipes = model.pipes;", referenceContext);
const plain = value => JSON.parse(JSON.stringify(value));
const referencePipes = plain(referenceContext.pipes);
const previousReferencePipes = JSON.parse(await readFile(new URL("./fixtures/reference-4x2-trampoline-3x2.json", import.meta.url), "utf8")).pipes;
const storage = new Map();
const legacyKey = "climbing-frame-draft-v1:/index.html";
const previousKey = "climbing-frame-draft-v2:reference-4x2:/index.html";
const currentKey = "climbing-frame-draft-v3:reference-4x2-trampoline-2x2:/index.html";
const cmDesign = pipes => ({ version: 1, units: "cm", connectors: {}, showAccessories: true,
  pipes: pipes.map(p => ({ id: p.id, group: p.group, a: p.a.map(v => v * 35), b: p.b.map(v => v * 35) })) });
const previousDefault = cmDesign(previousReferencePipes);
const legacy = cmDesign(previousReferencePipes.filter(p => Number(p.id.slice(1)) <= 79).map(p => ({ ...p,
  a: p.a.map((v, axis) => axis === 0 && v === 4 ? 3 : v),
  b: p.b.map((v, axis) => axis === 0 && v === 4 ? 3 : v)
})));
const internalState = design => ({ pipes: design.pipes.map(p => ({ ...p, a: p.a.map(v => v / 35), b: p.b.map(v => v / 35) })),
  connectors: design.connectors, showAccessories: design.showAccessories });
const put = (key, design, extra = {}) => {
  const raw = JSON.stringify({ savedAt: "2026-11-13T00:00:00.000Z", design, ...extra });
  storage.set(key, raw);
  return raw;
};
function openPage({ embedded = false, identity = "", blocked = false, initialState } = {}) {
  const elements = {};
  const context = {
    location: { pathname: "/index.html" }, hasEmbeddedDesign: embedded, draftIdentity: identity,
    model: { pipes: structuredClone(initialState?.pipes || referencePipes) },
    connectorChoices: structuredClone(initialState?.connectors || {}), showAccessories: initialState?.showAccessories ?? true,
    cmPosition: p => p.map(v => v * 35), jointCatalog: [{ name: "一字接头" }],
    constructModel() {}, fitModel() {}, confirm: () => true, safely: action => action(),
    report: message => { context.message = message; },
    applyState: state => {
      context.restored = state;
      context.model = { pipes: plain(state.pipes) };
      context.connectorChoices = plain(state.connectors || {});
      context.showAccessories = state.showAccessories;
    },
    commit(pipes, connectors, selection, showAccessories) {
      context.applyState({ pipes, connectors, showAccessories });
      context.actions.saveLocalDraft();
    },
    $: id => elements[id] ??= { events: {}, addEventListener(type, handler) { this.events[type] = handler; } },
    localStorage: {
      getItem: key => { if (blocked) throw new Error("denied"); return storage.get(key) ?? null; },
      setItem: (key, value) => { if (blocked) throw new Error("denied"); storage.set(key, value); },
      removeItem: key => { if (blocked) throw new Error("denied"); storage.delete(key); }
    }
  };
  runInNewContext(serialization + drafts + '\nthis.actions = { saveLocalDraft, readLocalDraft, getRecoverableDraft: () => recoverableDraft, getRecoverableDraftKey: () => recoverableDraftKey };', context);
  return { context, elements, ...context.actions, click: id => elements[id].events.click() };
}
const assertCurrentDefault = page => {
  assert.equal(page.context.model.pipes.length, 108, "旧版草稿不能覆盖新版108管默认模型");
  const points = page.context.model.pipes.flatMap(p => [p.a, p.b]);
  assert.deepEqual([0, 1, 2].map(axis => Math.max(...points.map(p => p[axis])) - Math.min(...points.map(p => p[axis]))), [4, 2, 4]);
  const trampoline = page.context.model.pipes.filter(p => p.group === "蹦床边框").flatMap(p => [p.a, p.b]);
  assert.deepEqual([0, 1].map(axis => Math.max(...trampoline.map(p => p[axis])) - Math.min(...trampoline.map(p => p[axis]))), [2, 2], "新默认蹦床边框只能为2×2");
};

const empty = openPage();
empty.readLocalDraft();
assertCurrentDefault(empty);
assert.equal(empty.elements["draft-recovery"].hidden, true);
empty.saveLocalDraft();
assert.ok(storage.has(currentKey), "新版默认入口必须保存到独立命名空间");
assert.equal(storage.has(legacyKey), false);
assert.equal(storage.has(previousKey), false);
assert.equal(JSON.parse(storage.get(currentKey)).referenceRevision, 3);
const saved = storage.get(currentKey);
const refreshed = openPage();
refreshed.readLocalDraft();
assertCurrentDefault(refreshed);
assert.equal(storage.get(currentKey), saved, "自动恢复不应改写草稿");
console.log("检查通过：新版草稿独立保存与刷新恢复。");

for (const [key, base] of [[legacyKey, legacy], [previousKey, previousDefault]]) {
  for (const variant of [
    { design: base },
    { design: base, referenceRevision: 2 },
    { design: { ...base, pipes: base.pipes.map((p, i) => i ? p : { ...p, group: "自定义", id: "P999" }) }, referenceRevision: 2 },
    { design: { ...base, showAccessories: false, connectors: { "0.0000,0.0000,0.0000": "一字接头" } }, referenceRevision: 2 }
  ]) {
    storage.clear();
    const { design, ...extra } = variant;
    const raw = put(key, design, extra);
    const page = openPage();
    page.readLocalDraft();
    assertCurrentDefault(page);
    assert.equal(page.context.restored, undefined, "旧版只能提供恢复入口，不应自动加载");
    assert.equal(page.elements["draft-recovery"].hidden, false);
    assert.deepEqual(plain(page.getRecoverableDraft()), design);
    assert.equal(page.getRecoverableDraftKey(), key);
    assert.equal(storage.get(key), raw, "旧草稿须原值保留");
    assert.equal(storage.has(currentKey), false, "仅打开页面不应写入任何草稿");
  }
}
console.log("检查通过：旧v1与v2草稿、revision:2及自定义改动均不覆盖整体4×2、蹦床2×2默认。");

storage.clear();
const olderRaw = put(legacyKey, legacy);
const previousRaw = put(previousKey, previousDefault, { referenceRevision: 2 });
const priority = openPage();
priority.readLocalDraft();
assertCurrentDefault(priority);
assert.equal(priority.getRecoverableDraftKey(), previousKey, "旧v2工作副本应优先于更旧的v1草稿提供恢复");
assert.deepEqual(plain(priority.getRecoverableDraft()), previousDefault);
priority.click("restore-draft");
assert.equal(priority.context.model.pipes.length, 95, "用户主动选择旧v2方案应成功");
assert.equal(storage.get(previousKey), previousRaw);
assert.equal(storage.get(legacyKey), olderRaw);
const previousRestored = openPage();
previousRestored.readLocalDraft();
assert.deepEqual(plain(previousRestored.context.restored), internalState(previousDefault), "主动恢复旧v2后刷新须保留用户选择");
console.log("检查通过：旧v2优先恢复入口、旧v1保留，以及主动恢复后的同版刷新。");

storage.clear();
const oldRaw = put(legacyKey, legacy, { referenceRevision: 2 });
const custom = { ...legacy, pipes: [legacy.pipes[0]], showAccessories: false };
put(currentKey, custom);
const sameVersion = openPage();
sameVersion.readLocalDraft();
assert.deepEqual(plain(sameVersion.context.restored), internalState(custom), "同版自定义草稿应自动恢复");
assert.equal(sameVersion.elements["draft-recovery"].hidden, true);
assert.equal(storage.get(legacyKey), oldRaw);
storage.delete(currentKey);
const manual = openPage();
manual.readLocalDraft();
manual.click("restore-draft");
assert.equal(manual.context.model.pipes.length, 79, "用户主动恢复旧方案应成功");
assert.equal(storage.get(legacyKey), oldRaw, "主动恢复也不得改写旧命名空间");
assert.ok(storage.has(currentKey), "主动恢复后的工作副本应保存到新版命名空间");
const manualReloaded = openPage();
manualReloaded.readLocalDraft();
assert.deepEqual(plain(manualReloaded.context.restored), internalState(legacy), "主动恢复旧方案后刷新须保持用户选择");
console.log("检查通过：同版自定义草稿恢复、手动恢复旧方案及再次刷新。");

for (const [key, oldDesign] of [[legacyKey, legacy], [previousKey, previousDefault]]) {
  storage.clear();
  put(key, oldDesign);
  const discard = openPage();
  discard.readLocalDraft();
  const newerRaw = put(currentKey, custom);
  discard.click("discard-draft");
  assert.equal(storage.has(key), false, "删除恢复项应删除该项所在的旧键");
  assert.equal(storage.get(currentKey), newerRaw, "删除旧草稿不能误删其他标签新写入的新版草稿");
  assertCurrentDefault(discard);
  assert.equal(discard.elements["draft-recovery"].hidden, true);
}
storage.clear();
put(legacyKey, legacy);
put(previousKey, previousDefault);
const discardPrevious = openPage();
discardPrevious.readLocalDraft();
discardPrevious.click("discard-draft");
assert.equal(storage.has(previousKey), false);
assert.ok(storage.has(legacyKey), "删除选中的v2草稿不得同时删除v1草稿");
console.log("检查通过：删除恢复项按来源键执行，保留新版及其他旧版草稿和当前模型。");

storage.clear();
put(currentKey, custom);
put(previousKey, previousDefault);
put(legacyKey, custom);
const embeddedState = internalState(legacy);
const oldEmbedded = openPage({ embedded: true, initialState: embeddedState });
oldEmbedded.readLocalDraft();
assert.equal(oldEmbedded.context.restored, undefined, "无标识内嵌HTML应优先保持内嵌方案");
assert.equal(oldEmbedded.context.model.pipes.length, 79);
assert.equal(oldEmbedded.elements["draft-recovery"].hidden, false);
assert.equal(oldEmbedded.getRecoverableDraftKey(), legacyKey);
const identityKey = legacyKey + ":export-1";
put(identityKey, custom);
const identified = openPage({ embedded: true, identity: "export-1", initialState: embeddedState });
identified.readLocalDraft();
assert.deepEqual(plain(identified.context.restored), internalState(custom), "带标识导出HTML应恢复自己的草稿");
identified.saveLocalDraft();
assert.ok(storage.has(identityKey));
const unrelated = openPage({ embedded: true, identity: "export-2", initialState: embeddedState });
unrelated.readLocalDraft();
assert.equal(unrelated.context.restored, undefined, "不同导出标识不能恢复默认入口或其他导出的草稿");
assert.equal(unrelated.elements["draft-recovery"].hidden, true);
assert.equal(unrelated.context.model.pipes.length, 79);
console.log("检查通过：无标识和带标识内嵌HTML继续使用原方案隔离规则。");

storage.clear();
const denied = openPage({ blocked: true });
denied.readLocalDraft();
assertCurrentDefault(denied);
assert.match(denied.elements["draft-status"].textContent, /不可用/);
denied.saveLocalDraft();
assert.match(denied.elements["draft-status"].textContent, /保存失败/);
for (const key of [currentKey, previousKey, legacyKey]) {
  for (const raw of ["invalid json", JSON.stringify({ design: { version: 999 } }), "x".repeat(1024 * 1024 + 1)]) {
    storage.clear();
    storage.set(key, raw);
    const damaged = openPage();
    damaged.readLocalDraft();
    assertCurrentDefault(damaged);
    assert.equal(damaged.getRecoverableDraft(), null);
    assert.equal(damaged.elements["draft-recovery"].hidden, true);
    assert.equal(storage.get(key), raw, "损坏草稿也不应被打开页面的动作覆盖");
    assert.match(damaged.elements["draft-status"].textContent, /不可用/);
  }
}
console.log("检查通过：缺失、受限、损坏、格式错误和过大存储保留默认模型。");
