"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const base=path.resolve(__dirname,"..");
test("manifest requests temporary page access only and ships every injected script",()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(base,"manifest.json"),"utf8"));
  assert.equal(manifest.manifest_version,3);assert.deepEqual(manifest.permissions,["activeTab","scripting"]);
  assert.equal(manifest.host_permissions,undefined);assert.equal(manifest.content_scripts,undefined);assert.equal(manifest.externally_connectable,undefined);
  for(const name of [manifest.background.service_worker,"core.js","panel-adapter.js","vendor/canvas-confetti.js","celebration.js","content.js"])assert(fs.statSync(path.join(base,name)).isFile());
});
test("background does not inject until clicked, then injects only into the clicked tab",async()=>{
  let onClick;const injections=[];const chrome={action:{onClicked:{addListener:fn=>onClick=fn},setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{},setTitle:async()=>{}},scripting:{executeScript:async options=>injections.push(options)}};
  vm.runInNewContext(fs.readFileSync(path.join(base,"background.js"),"utf8"),{chrome});assert.equal(injections.length,0);
  await onClick({id:12,url:"chrome://extensions"});assert.equal(injections.length,0);
  await onClick({id:17,url:"https://test-panel.example.test:8888/files"});assert.equal(injections.length,1);
  assert.equal(injections[0].target.tabId,17);assert.equal(injections[0].world,"MAIN");assert.deepEqual(Array.from(injections[0].files),["core.js","panel-adapter.js","vendor/canvas-confetti.js","celebration.js","content.js"]);
});
