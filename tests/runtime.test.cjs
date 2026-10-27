"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const base=path.resolve(__dirname,".."),version=JSON.parse(fs.readFileSync(path.join(base,"manifest.json"),"utf8")).version;
const source=name=>fs.readFileSync(path.join(base,name),"utf8");
function browserContext(){
  const sandbox={TextEncoder,URL,URLSearchParams,AbortController,DOMException,setTimeout,clearTimeout,
    vite_public_version:"11.7.0",vite_public_request_token:"fake-session-token",location:{origin:"https://panel.example.test",host:"panel.example.test"},
    document:{querySelector:()=>null,querySelectorAll:()=>[]},fetch:async(url,options)=>({ok:true,text:async()=>JSON.stringify(options.body.get("files").split("\n").map(filename=>({filename,exists:true,isfile:true,size:835690})))})};
  sandbox.window=sandbox;return vm.createContext(sandbox);
}
test("new browser scripts ignore non-configurable legacy modules and return real current verification reports",async()=>{
  const page=browserContext();let legacyCalls=0;
  const legacyCore=Object.freeze({version:"0.1.0"}),legacyPanel=Object.freeze({verifyFiles:()=>{legacyCalls++;throw new Error("文件存在或大小校验未通过");}});
  Object.defineProperty(page,"BTUploadCore",{value:legacyCore});Object.defineProperty(page,"BTUploadPanel",{value:legacyPanel});
  vm.runInContext(source("core.js"),page);vm.runInContext(source("panel-adapter.js"),page);
  const runtime=page.__BT_UPLOAD_ENHANCER_RUNTIME__;
  assert.equal(runtime.version,version);assert.equal(runtime.core.version,version);assert.equal(runtime.panel.version,version);
  assert.notEqual(runtime.core,legacyCore);assert.notEqual(runtime.panel,legacyPanel);
  const report=await runtime.panel.verifyFiles([{name:"resource/clear-guide/templates/标书编制说明.docx",size:835690}],"/www/wwwroot/demo");
  assert.equal(report.complete,true);assert.equal(report.matched,1);assert.equal(legacyCalls,0);
  assert.equal(page.BTUploadCore,legacyCore);assert.equal(page.BTUploadPanel,legacyPanel);
  vm.runInContext(source("core.js"),page);vm.runInContext(source("panel-adapter.js"),page);
  assert.equal(page.__BT_UPLOAD_ENHANCER_RUNTIME__.panel.version,version);
});
test("mixed component versions stop before page access or requests",()=>{
  const page=browserContext();page.__BT_UPLOAD_ENHANCER_RUNTIME__={version,core:{version:"0.1.1"}};
  assert.throws(()=>vm.runInContext(source("panel-adapter.js"),page),/版本不一致/);
  page.__BT_UPLOAD_ENHANCER_RUNTIME__={version,core:{version},panel:{version:"0.1.1",context:()=>assert.fail("must not read panel")}};
  assert.throws(()=>vm.runInContext(source("content.js"),page),/版本不一致/);
});
test("reopening an active legacy panel keeps its running task and shows an update notice",()=>{
  const page=browserContext(),notice={textContent:"",hidden:true};let expanded=0;
  page.Event=Event;
  const existing={getAttribute:()=>null,shadowRoot:{querySelector:selector=>selector==="[data-cancel]"?{hidden:false}:notice},dispatchEvent:()=>expanded++,remove:()=>assert.fail("active panel must remain")};
  page.document.getElementById=()=>existing;page.document.createElement=()=>assert.fail("must not create another active panel");
  page.__BT_UPLOAD_ENHANCER_RUNTIME__={version,core:{version},panel:{version,context:()=>assert.fail("must keep the running task")}};
  vm.runInContext(source("content.js"),page);assert.equal(expanded,1);assert.equal(notice.hidden,false);assert.match(notice.textContent,/旧版插件任务仍在运行/);
});
test("vendored confetti remains private and the celebration module matches the extension version",async()=>{
  const page=browserContext(),existing=()=>{};Object.defineProperty(page,"confetti",{value:existing});
  vm.runInContext(source("core.js"),page);vm.runInContext(source("vendor/canvas-confetti.js"),page);vm.runInContext(source("celebration.js"),page);
  const runtime=page.__BT_UPLOAD_ENHANCER_RUNTIME__;assert.equal(page.confetti,existing);assert.equal(runtime.confettiLibraryVersion,"1.9.4");assert.equal(typeof runtime.confetti.create,"function");assert.equal(runtime.celebration.version,version);
  page.matchMedia=()=>({matches:true});assert.equal(await runtime.celebration.fire(),false);
});
