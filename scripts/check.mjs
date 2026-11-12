import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length, 1, "必须包含完整的单文件运行脚本");
new Script(scripts[0][1], { filename: "index.html" });
const saved = html.match(/<script id="saved-design" type="application\/json">([\s\S]*?)<\/script>/);
assert.ok(saved, "缺少方案嵌入位置");
assert.equal(JSON.parse(saved[1]), null, "仓库默认页面不应携带个人编辑数据");
const markup = html.slice(0, scripts[0].index);
const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, "页面元素ID不能重复");
console.log("检查通过：脚本语法、默认数据及元素ID。");
