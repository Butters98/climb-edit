import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const serialization = source.slice(source.indexOf("      function serializedDesign()"), source.indexOf('      $("edit-toggle").addEventListener'));
const drafts = source.slice(source.indexOf("      const draftStorageKey"), source.indexOf('      $("restore-draft").addEventListener'));
const referenceContext = {};
runInNewContext(source.slice(source.indexOf("      let model ="), source.indexOf("      const canvas =")) + "this.pipes = model.pipes;", referenceContext);
const referencePipes = JSON.parse(JSON.stringify(referenceContext.pipes));
const previousReferenceCheck = source.slice(source.indexOf("      function isPreviousReferenceDraft("), source.indexOf("      const jointCatalog ="));
const storage = new Map();
const design = { pipes: [{ id: "P001", a: [0, 0, 0], b: [1, 0, 0], group: "custom" }], connectors: {}, showAccessories: false };
function openPage({ embedded = false, blocked = false, identity = "" } = {}) {
  const elements = {};
  const context = {
    location: { pathname: "/index.html" },
    hasEmbeddedDesign: embedded, draftIdentity: identity,
    model: structuredClone(design), connectorChoices: {}, showAccessories: false,
    referencePipes: structuredClone(referencePipes),
    cmPosition: p => p.map(v => v * 35), jointCatalog: [{ name: "一字接头" }],
    constructModel: () => {},
    applyState: state => { context.restored = state; },
    $: id => elements[id] ??= {},
    localStorage: {
      getItem: key => { if (blocked) throw new Error("denied"); return storage.get(key) ?? null; },
      setItem: (key, value) => { if (blocked) throw new Error("denied"); storage.set(key, value); }
    }
  };
  runInNewContext(previousReferenceCheck + serialization + drafts + '\nthis.actions = { saveLocalDraft, readLocalDraft, getRecoverableDraft: () => recoverableDraft };', context);
  return { context, elements, ...context.actions };
}
const first = openPage();
first.readLocalDraft();
assert.equal(first.context.restored, undefined);
first.saveLocalDraft();
const persisted = [...storage.values()][0];
const refreshed = openPage();
refreshed.readLocalDraft();
assert.deepEqual(JSON.parse(JSON.stringify(refreshed.context.restored)), design);
assert.equal(refreshed.elements["draft-recovery"].hidden, true);
assert.equal([...storage.values()][0], persisted, "恢复不应覆盖已保存的数据");
const exported = openPage({ embedded: true });
exported.readLocalDraft();
assert.equal(exported.context.restored, undefined);
assert.equal(exported.elements["draft-recovery"].hidden, false);
const isolated = openPage({ embedded: true, identity: "export-1" });
isolated.saveLocalDraft();
const reopened = openPage({ embedded: true, identity: "export-1" });
reopened.readLocalDraft();
assert.deepEqual(JSON.parse(JSON.stringify(reopened.context.restored)), design);
const otherExport = openPage({ embedded: true, identity: "export-2" });
otherExport.readLocalDraft();
assert.equal(otherExport.context.restored, undefined);
const denied = openPage({ blocked: true });
denied.saveLocalDraft();
assert.match(denied.elements["draft-status"].textContent, /保存失败/);
denied.readLocalDraft();
assert.equal(denied.context.restored, undefined);
storage.set("climbing-frame-draft-v1:/index.html", "invalid json");
const corrupt = openPage();
corrupt.readLocalDraft();
assert.equal(corrupt.context.restored, undefined);
assert.match(corrupt.elements["draft-status"].textContent, /不可用/);
console.log("检查通过：保存后刷新恢复、内嵌方案优先、存储受限与损坏草稿。");

const legacy = {
  version: 1, units: "cm", connectors: {}, showAccessories: true,
  pipes: referencePipes.filter(pipe => Number(pipe.id.slice(1)) <= 79).map(pipe => ({
    id: pipe.id,
    a: pipe.a.map((value, axis) => (axis === 0 && value === 4 ? 3 : value) * 35),
    b: pipe.b.map((value, axis) => (axis === 0 && value === 4 ? 3 : value) * 35),
    group: pipe.group
  }))
};
const storeLegacy = (value = legacy, identity = "") => {
  const key = "climbing-frame-draft-v1:/index.html" + (identity ? ":" + identity : "");
  const raw = JSON.stringify({ savedAt: "2026-11-13T00:00:00.000Z", design: value });
  storage.set(key, raw);
  return { key, raw };
};
const oldStorage = storeLegacy();
const upgraded = openPage();
upgraded.readLocalDraft();
assert.equal(upgraded.context.restored.pipes.length, 95, "未经修改的旧默认草稿应显示新版4×2模型");
assert.equal(Math.max(...upgraded.context.restored.pipes.flatMap(p => [p.a[0], p.b[0]])), 4);
assert.equal(storage.get(oldStorage.key), oldStorage.raw, "自动升级显示不得覆盖旧草稿原值");
assert.equal(upgraded.elements["draft-recovery"].hidden, false, "旧默认草稿应保留手动恢复入口");
assert.deepEqual(JSON.parse(JSON.stringify(upgraded.getRecoverableDraft())), legacy);
assert.match(upgraded.elements["draft-status"].textContent, /新版.*旧版.*保留/);
for (const mutate of [
  draft => { draft.pipes.pop(); },
  draft => { draft.pipes[0].b[0] = 15; },
  draft => { draft.pipes[0].group = "自定义"; },
  draft => { draft.pipes[0].id = "P999"; },
  draft => { draft.showAccessories = false; },
  draft => { draft.connectors["0.0000,0.0000,0.0000"] = "一字接头"; }
]) {
  const custom = structuredClone(legacy);
  mutate(custom);
  storeLegacy(custom);
  const page = openPage();
  page.readLocalDraft();
  assert.equal(page.context.restored.pipes.length, custom.pipes.length, "任何旧方案改动都应按原草稿恢复");
  assert.deepEqual(JSON.parse(JSON.stringify(page.context.restored)), {
    pipes: custom.pipes.map(p => ({ ...p, a: p.a.map(v => v / 35), b: p.b.map(v => v / 35) })),
    connectors: custom.connectors, showAccessories: custom.showAccessories
  });
  assert.equal(page.elements["draft-recovery"].hidden, true);
}
storeLegacy();
const oldEmbedded = openPage({ embedded: true });
oldEmbedded.readLocalDraft();
assert.equal(oldEmbedded.context.restored, undefined, "旧版无标识内嵌HTML不得自动替换模型");
assert.equal(oldEmbedded.elements["draft-recovery"].hidden, false);
storeLegacy(legacy, "legacy-export");
const embeddedLegacyDraft = openPage({ embedded: true, identity: "legacy-export" });
embeddedLegacyDraft.readLocalDraft();
assert.equal(embeddedLegacyDraft.context.restored.pipes.length, 79, "带标识导出HTML仍应恢复自己原来的草稿");
assert.equal(embeddedLegacyDraft.elements["draft-recovery"].hidden, true);
console.log("检查通过：旧默认草稿升级、新旧草稿恢复入口、自定义改动与导出HTML保持原样。");

const explicitlyKeptLegacy = openPage();
explicitlyKeptLegacy.context.model = {
  pipes: legacy.pipes.map(p => ({ ...p, a: p.a.map(v => v / 35), b: p.b.map(v => v / 35) }))
};
explicitlyKeptLegacy.context.showAccessories = true;
explicitlyKeptLegacy.saveLocalDraft();
assert.equal(JSON.parse(storage.get("climbing-frame-draft-v1:/index.html")).referenceRevision, 2, "新版保存需标记已处理的默认版本");
const intentionallyRestored = openPage();
intentionallyRestored.readLocalDraft();
assert.equal(intentionallyRestored.context.restored.pipes.length, 79, "用户明确恢复或导入旧方案后再次刷新不得反复升级");
assert.equal(intentionallyRestored.elements["draft-recovery"].hidden, true);
console.log("检查通过：明确保留的旧方案不会在下次刷新时再次升级。");
