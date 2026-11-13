import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const serialization = source.slice(source.indexOf("      function serializedDesign()"), source.indexOf('      $("edit-toggle").addEventListener'));
const drafts = source.slice(source.indexOf("      const draftStorageKey"), source.indexOf('      $("restore-draft").addEventListener'));
const storage = new Map();
const design = { pipes: [{ id: "P001", a: [0, 0, 0], b: [1, 0, 0], group: "custom" }], connectors: {}, showAccessories: false };
function openPage({ embedded = false, blocked = false, identity = "" } = {}) {
  const elements = {};
  const context = {
    location: { pathname: "/index.html" },
    hasEmbeddedDesign: embedded, draftIdentity: identity,
    model: structuredClone(design), connectorChoices: {}, showAccessories: false,
    cmPosition: p => p.map(v => v * 35), jointCatalog: [],
    constructModel: () => {},
    applyState: state => { context.restored = state; },
    $: id => elements[id] ??= {},
    localStorage: {
      getItem: key => { if (blocked) throw new Error("denied"); return storage.get(key) ?? null; },
      setItem: (key, value) => { if (blocked) throw new Error("denied"); storage.set(key, value); }
    }
  };
  runInNewContext(serialization + drafts + '\nthis.actions = { saveLocalDraft, readLocalDraft };', context);
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
