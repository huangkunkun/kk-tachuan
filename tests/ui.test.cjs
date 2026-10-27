"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const C=require("../core.js"),makeAdapter=require("../panel-adapter.js");
const transferHarness=require("./transfer-harness.cjs");

// A minimal event-driven DOM lets the real panel handlers run against request spies.
async function panelHarness(serverSize=835690,legacyPanel=false,options={}){
  const elements=new Map(),calls=[],intervals=new Map(),windowEvents=new Map(),documentEvents=new Map();let copied="",legacyRemoved=false,celebrations=0,mountedHost=null,timerId=0;
  function element(){return{style:{},events:new Map(),value:"",checked:false,files:[],textContent:"",hidden:false,disabled:false,isConnected:false,children:[],addEventListener(name,fn){this.events.set(name,fn);},setAttribute(){},append(child){this.children.push(child);},replaceChildren(){this.children=[];},remove(){this.isConnected=false;}};}
  const view={set innerHTML(value){this.html=value;},querySelector(selector){if(!elements.has(selector))elements.set(selector,element());return elements.get(selector);}};
  const oldPanel=legacyPanel?{getAttribute:()=>null,shadowRoot:{querySelector:()=>({hidden:true})},dispatchEvent(){},remove:()=>{legacyRemoved=true;}}:null;
  const panelVersion=options.panelVersion||"11.7.0",rootSelector=panelVersion==="11.7.0"?"#app":"#root";
  const pinia={_s:new Map([["FILES-STORE",{fileTabActiveData:{param:{path:"/www/wwwroot/demo"}}}]])};
  const app={__vue_app__:{_context:{provides:{pinia}}}};
  const document={visibilityState:"visible",addEventListener:(name,fn)=>documentEvents.set(name,fn),removeEventListener:name=>documentEvents.delete(name),getElementById:()=>oldPanel,querySelector:selector=>selector===rootSelector?app:null,querySelectorAll:()=>[],documentElement:{append(node){mountedHost=node;node.isConnected=true;}},createElement:()=>({...element(),attachShadow:()=>view})};
  const win={document,setInterval:fn=>{intervals.set(++timerId,fn);return timerId;},clearInterval:id=>intervals.delete(id),vite_public_version:panelVersion,vite_public_request_token:"local-test-token",location:{origin:"https://panel.example.test",host:"panel.example.test"},addEventListener:(name,fn)=>windowEvents.set(name,fn),removeEventListener:name=>windowEvents.delete(name),fetch:async(url,options)=>{
    const action=new URL(url).searchParams.get("action");calls.push(action);
    if(action==="GetDirNew")return{ok:true,text:async()=>JSON.stringify({path:options.body.get("path")})};
    assert.equal(action,"upload_files_exists","the read-only check must never upload, extract, create, or delete");
    return{ok:true,text:async()=>JSON.stringify(options.body.get("files").split("\n").map(filename=>({filename,exists:true,isfile:true,size:serverSize})))};
  },...options.transport};
  const adapter=makeAdapter(win,C);win.__BT_UPLOAD_ENHANCER_RUNTIME__={version:C.version,core:C,panel:adapter,celebration:{version:C.version,reset(){},fire(){celebrations++;if(options.celebrationThrows)throw new Error("canvas unavailable");return Promise.resolve(true);}}};
  const navigator={clipboard:{writeText:async text=>{copied=text;}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../content.js"),"utf8"),{window:win,document,navigator,AbortController,Event,console});
  await new Promise(resolve=>setImmediate(resolve));
  const file=new File([new Uint8Array(835690)],"标书编制说明.docx");Object.defineProperty(file,"webkitRelativePath",{value:"dist/resource/clear-guide/templates/标书编制说明.docx"});
  const input=view.querySelector("[data-folder-input]");input.files=options.files||[file];input.events.get("change")({target:input});
  return{elements,calls,legacyRemoved,intervals,windowEvents,documentEvents,document,get host(){return mountedHost;},get celebrations(){return celebrations;},setPagePath:path=>{pinia._s.get("FILES-STORE").fileTabActiveData.param.path=path;},poll:()=>Promise.all([...intervals.values()].map(fn=>fn())),click:selector=>view.querySelector(selector).events.get("click")(),input:value=>{const target=view.querySelector("[data-path]");target.value=value;return target.events.get("input")({target});},change:(selector,props={})=>{const target=view.querySelector(selector);Object.assign(target,props);return target.events.get("change")({target});},diagnostic:()=>JSON.parse(copied)};
}
test("read-only check follows the selected folder mapping and sends only directory/metadata requests",async()=>{
  const h=await panelHarness();assert.equal(h.elements.get("[data-check]").disabled,false);
  await h.click("[data-check]");assert.deepEqual(h.calls,["GetDirNew","GetDirNew","upload_files_exists"]);
  assert.match(h.elements.get("[data-status]").textContent,/核对完成/);
  await h.click("[data-diagnostic]");const report=h.diagnostic();assert.equal(report.verification.matched,1);assert.equal(report.lastError,"");assert.equal(report.stage,"");assert(!JSON.stringify(report).includes("local-test-token"));
  assert.deepEqual(report.components,{core:C.version,adapter:C.version});assert.equal(report.operation,"check");
  assert.equal(h.celebrations,0);
});
test("read-only mismatch displays and copies exact bytes without reporting upload success",async()=>{
  const h=await panelHarness(835689);await h.click("[data-check]");
  assert.match(h.elements.get("[data-status]").textContent,/本地 835690，服务器 835689/);assert.equal(h.elements.get("[data-status]").className,"status error");
  await h.click("[data-diagnostic]");const report=h.diagnostic().verification;assert.equal(report.failures[0].reason,"size_mismatch");assert.equal(report.failures[0].path,"/www/wwwroot/demo/resource/clear-guide/templates/标书编制说明.docx");
  assert.equal(report.failures[0].expectedBytes,835690);assert.equal(report.failures[0].server.size,835689);
});
test("an idle legacy panel is replaced and the new panel copies matching component versions",async()=>{
  const h=await panelHarness(835690,true);assert.equal(h.legacyRemoved,true);
  await h.click("[data-check]");await h.click("[data-diagnostic]");const report=h.diagnostic();
  assert.equal(report.extension,C.version);assert.equal(report.components.core,C.version);assert.equal(report.components.adapter,C.version);assert.equal(report.verification.matched,1);
});
function selectedFile(name,body){const file=new File([body],name.split("/").at(-1));Object.defineProperty(file,"webkitRelativePath",{value:`dist/${name}`});return file;}
function releaseFiles(){
  const files=Array.from({length:1709},(_,i)=>selectedFile(`assets/${i}.js`,`export default ${i};`));
  files.push(selectedFile("resource/clear-guide/templates/标书编制说明.docx",new Uint8Array(835690).fill(71)),selectedFile("resource/clear-guide/templates/清标提示修改指南.docx",new Uint8Array(1166992).fill(72)));return files;
}
for(const panelVersion of ["11.3.0","11.7.0"])test(`v${panelVersion}: full 1711-file release bypasses broken unzip names and verifies both Chinese DOCX files`,async()=>{
  const model=transferHarness(),files=releaseFiles();model.files.set("/www/wwwroot/demo/server-only.json",Buffer.from("keep"));
  const h=await panelHarness(0,false,{panelVersion,transport:model.transport,files});await h.click("[data-start]");
  assert.equal(model.archivedNames.length,1709);assert(model.archivedNames.every(name=>!/[\u0080-\uffff]/.test(name)));
  for(const file of files.slice(-2)){const name=file.webkitRelativePath.slice(5),actual=model.files.get(`/www/wwwroot/demo/${name}`);assert(actual);assert.deepEqual(actual,Buffer.from(await file.arrayBuffer()));}
  assert.equal(model.files.get("/www/wwwroot/demo/server-only.json").toString(),"keep");assert(![...model.dirs].some(dir=>dir.startsWith("/tmp/")));
  assert.equal(h.celebrations,1);
  await h.click("[data-diagnostic]");assert.equal(h.diagnostic().panelVersion,panelVersion);assert.equal(h.diagnostic().verification.matched,1711);assert.equal(h.diagnostic().lastError,"");
});
test("repair button uploads only two special-name files and rechecks all 1711 without an archive or cleanup",async()=>{
  const model=transferHarness(),files=releaseFiles();
  for(const file of files.slice(0,1709)){const name=file.webkitRelativePath.slice(5);model.files.set(`/www/wwwroot/demo/${name}`,Buffer.from(await file.arrayBuffer()));}
  model.addParents("/www/wwwroot/demo/resource/clear-guide/templates");model.files.set("/www/wwwroot/demo/resource/clear-guide/templates/old-garbled.docx",Buffer.from("keep"));
  const h=await panelHarness(0,false,{transport:model.transport,files});assert.match(h.elements.get("[data-special]").textContent,/2 个/);await h.click("[data-special]");
  assert.equal(model.uploadedNames.length,2);assert(model.uploadedNames.every(name=>name.endsWith(".docx")));
  for(const action of ["UnZip","CreateDir","DeleteDir"])assert(!model.actions.includes(action));
  assert.equal(model.files.get("/www/wwwroot/demo/resource/clear-guide/templates/old-garbled.docx").toString(),"keep");
  await h.click("[data-diagnostic]");const report=h.diagnostic();assert.equal(report.operation,"upload_special_names");assert.equal(report.verification.checked,1711);assert.equal(report.verification.matched,1711);
  assert.equal(h.celebrations,1);
});
test("all-Unicode folder creates its exact nested directory and never builds an archive",async()=>{
  const model=transferHarness(),files=[selectedFile("资料/模板/示例😀.docx","document")];
  const h=await panelHarness(0,false,{transport:model.transport,files});await h.click("[data-start]");
  assert.equal(model.files.get("/www/wwwroot/demo/资料/模板/示例😀.docx").toString(),"document");assert(model.actions.includes("CreateDir"));assert(!model.actions.includes("UnZip"));
  await h.click("[data-diagnostic]");assert.equal(h.diagnostic().verification.matched,1);
});
test("denied special-name subdirectory creation stops without uploading or reporting success",async()=>{
  const model=transferHarness({denyCreate:true}),files=[selectedFile("资料/模板/示例.docx","document")];
  const h=await panelHarness(0,false,{transport:model.transport,files});await h.click("[data-special]");
  assert.equal(model.uploadedNames.length,0);assert.equal(h.elements.get("[data-status]").className,"status error");assert.match(h.elements.get("[data-status]").textContent,/权限不足/);
});
for(const panelVersion of ["11.3.0","11.7.0"])test(`v${panelVersion}: direct mode uploads 1711 files strictly in sequence without ZIP and verifies the full manifest`,async()=>{
  const model=transferHarness(),files=releaseFiles();model.files.set("/www/wwwroot/demo/server-only.json",Buffer.from("keep"));
  const h=await panelHarness(0,false,{panelVersion,transport:model.transport,files});h.change("[data-method-direct]",{checked:true});
  assert.equal(h.elements.get("[data-special]").hidden,true);assert.match(h.elements.get("[data-mode]").textContent,/逐个|依次直接上传/);
  const running=h.click("[data-start]");assert.equal(h.elements.get("[data-method-archive]").disabled,true);assert.equal(h.elements.get("[data-method-direct]").disabled,true);await running;
  assert.equal(model.maxActiveUploads,1);assert.equal(model.uploadedNames.length,1711);assert.equal(model.archivedNames.length,0);
  assert.equal(h.celebrations,1);
  for(const action of ["UnZip","DeleteDir"])assert(!model.actions.includes(action));assert(![...model.dirs].some(dir=>dir.startsWith("/tmp/")));
  for(const file of [files[0],...files.slice(-2)])assert.deepEqual(model.files.get(`/www/wwwroot/demo/${file.webkitRelativePath.slice(5)}`),Buffer.from(await file.arrayBuffer()));
  assert.equal(model.files.get("/www/wwwroot/demo/server-only.json").toString(),"keep");
  await h.click("[data-diagnostic]");const report=h.diagnostic();assert.equal(report.panelVersion,panelVersion);assert.equal(report.uploadMethod,"direct");assert.equal(report.verification.checked,1711);assert.equal(report.verification.matched,1711);assert.equal(report.stage,"");assert.equal(report.lastError,"");
});
test("direct folder mode retains the optional root directory and empty files",async()=>{
  const model=transferHarness(),files=[selectedFile("index.html","page"),selectedFile("资料/empty.txt","")];
  const h=await panelHarness(0,false,{transport:model.transport,files});h.change("[data-method-direct]",{checked:true});h.change("[data-keep]",{checked:true});await h.click("[data-start]");
  assert.equal(model.files.get("/www/wwwroot/demo/dist/index.html").toString(),"page");assert.equal(model.files.get("/www/wwwroot/demo/dist/资料/empty.txt").length,0);assert(!model.files.has("/www/wwwroot/demo/index.html"));
  await h.click("[data-diagnostic]");assert.equal(h.diagnostic().verification.matched,2);
});
test("switching back from direct to archive uses the ZIP flow",async()=>{
  const model=transferHarness(),files=[selectedFile("index.html","page")];
  const h=await panelHarness(0,false,{transport:model.transport,files});h.change("[data-method-direct]",{checked:true});h.change("[data-method-archive]",{checked:true});await h.click("[data-start]");
  assert(model.actions.includes("UnZip"));assert.equal(model.uploadedNames.length,1);assert(model.uploadedNames[0].endsWith(".zip"));
  await h.click("[data-diagnostic]");assert.equal(h.diagnostic().uploadMethod,"archive");assert.equal(h.diagnostic().verification.matched,1);
});
test("direct upload stops at a failed file instead of continuing or displaying success",async()=>{
  const model=transferHarness({failUploadName:"b.js"}),files=["a.js","b.js","c.js"].map(name=>selectedFile(name,name));
  const h=await panelHarness(0,false,{transport:model.transport,files});h.change("[data-method-direct]",{checked:true});await h.click("[data-start]");
  assert.deepEqual(model.uploadedNames,["/www/wwwroot/demo/a.js"]);assert(!model.files.has("/www/wwwroot/demo/c.js"));assert.equal(h.elements.get("[data-status]").className,"status error");assert.match(h.elements.get("[data-status]").textContent,/磁盘写入失败/);
  assert.equal(h.celebrations,0);
});
for(const panelVersion of ["11.3.0","11.7.0"])test(`v${panelVersion}: direct mode rejects a missing file in the final full-manifest check`,async()=>{
  const model=transferHarness(),files=[selectedFile("a.js","a"),selectedFile("b.js","b")];
  const transport={...model.transport,fetch:async(url,options)=>{if(new URL(url).searchParams.get("action")==="upload_files_exists"&&options.body.get("files").includes("\n"))model.files.delete("/www/wwwroot/demo/a.js");return model.transport.fetch(url,options);}};
  const h=await panelHarness(0,false,{panelVersion,transport,files});h.change("[data-method-direct]",{checked:true});await h.click("[data-start]");
  assert.equal(model.uploadedNames.length,2);assert.equal(h.elements.get("[data-status]").className,"status error");await h.click("[data-diagnostic]");const report=h.diagnostic().verification;assert.equal(report.checked,2);assert.equal(report.mismatched,1);assert.equal(report.failures[0].name,"a.js");
  assert.equal(h.celebrations,0);
});
for(const panelVersion of ["11.3.0","11.7.0"])test(`v${panelVersion}: selecting a JAR uploads raw chunks and hides folder-only choices`,async()=>{
  const model=transferHarness(),h=await panelHarness(0,false,{panelVersion,transport:model.transport});
  const jar=new File([new Uint8Array(5*1024*1024+17).fill(74)],"app.jar");h.change("[data-files-input]",{files:[jar]});
  assert.equal(h.elements.get("[data-methods]").hidden,true);await h.click("[data-start]");assert.deepEqual(model.uploadedNames,["/www/wwwroot/demo/app.jar"]);assert.equal(model.actions.filter(action=>action==="upload").length,3);assert(!model.actions.includes("UnZip"));
  assert.deepEqual(model.files.get("/www/wwwroot/demo/app.jar"),Buffer.from(await jar.arrayBuffer()));await h.click("[data-diagnostic]");assert.equal(h.diagnostic().uploadMethod,"direct");assert.equal(h.diagnostic().verification.matched,1);
});

test("unsupported panel versions cannot start an upload through the UI handlers",async()=>{
  const model=transferHarness(),h=await panelHarness(0,false,{panelVersion:"99.0.0",transport:model.transport});
  assert.equal(h.elements.get("[data-start]").disabled,true);await h.click("[data-start]");assert.deepEqual(model.actions,[]);assert.equal(h.celebrations,0);
});

test("a failed compatibility preflight stops both upload modes before any write",async()=>{
  for(const direct of [false,true]){
    const model=transferHarness(),transport={...model.transport,fetch:async(url,options)=>{
      if(new URL(url).searchParams.get("action")==="upload_files_exists")return{ok:true,text:async()=>JSON.stringify([{filename:options.body.get("files"),exists:true,isfile:true,size:0}])};
      return model.transport.fetch(url,options);
    }};
    const h=await panelHarness(0,false,{panelVersion:"13.1.0",transport,files:[selectedFile("index.html","page")]});
    if(direct)h.change("[data-method-direct]",{checked:true});
    await h.click("[data-start]");assert.match(h.elements.get("[data-status]").textContent,/接口不兼容/);
    assert.equal(model.uploadedNames.length,0);assert(!model.actions.some(action=>["CreateDir","upload","UnZip","DeleteDir"].includes(action)));assert.equal(h.celebrations,0);
  }
});

for(const panelVersion of ["9.3.0","9.4.0","9.5.0","9.6.0","11.0.0","11.1.0","11.2.0","11.4.0","11.4.1","11.5.0","11.6.0","11.8.0","11.8.1","13.0.0","13.1.0"])test(`v${panelVersion}: archive and direct upload preserve paths and Chinese names`,async()=>{
  for(const direct of [false,true]){
    const model=transferHarness(),files=[selectedFile("assets/app.js","script"),selectedFile("资料/说明.txt","内容")];
    const h=await panelHarness(0,false,{panelVersion,transport:model.transport,files});
    if(direct)h.change("[data-method-direct]",{checked:true});
    await h.click("[data-start]");assert.equal(h.elements.get("[data-status]").className,"status success");
    assert.equal(model.files.get("/www/wwwroot/demo/assets/app.js").toString(),"script");
    assert.equal(model.files.get("/www/wwwroot/demo/资料/说明.txt").toString(),"内容");
    assert.equal(model.actions.includes("UnZip"),!direct);assert.equal(h.celebrations,1);
  }
});
test("celebration fires once per verified upload, skips standalone checks, and visual errors cannot fail a successful upload",async()=>{
  const model=transferHarness(),files=[selectedFile("index.html","page")];
  const h=await panelHarness(0,false,{transport:model.transport,files,celebrationThrows:true});
  await h.click("[data-start]");assert.equal(h.celebrations,1);assert.equal(h.elements.get("[data-status]").className,"status success");
  await h.click("[data-check]");assert.equal(h.celebrations,1);
  h.change("[data-method-direct]",{checked:true});await h.click("[data-start]");assert.equal(h.celebrations,2);assert.equal(h.elements.get("[data-status]").className,"status success");
});
test("cancelled upload never celebrates",async()=>{
  const model=transferHarness();let reads=0,release;const pending=new Promise(resolve=>{release=resolve;});
  const transport={...model.transport,fetch:async(url,options)=>{if(new URL(url).searchParams.get("action")==="GetDirNew"&&++reads===2)await pending;return model.transport.fetch(url,options);}};
  const h=await panelHarness(0,false,{transport,files:[selectedFile("a.js","a")]});h.change("[data-method-direct]",{checked:true});
  const running=h.click("[data-start]");h.click("[data-cancel]");release();await running;
  assert.equal(model.uploadedNames.length,0);assert.equal(h.celebrations,0);assert.match(h.elements.get("[data-status]").textContent,/已停止/);
});

const directoryReply=path=>({ok:true,text:async()=>JSON.stringify({path})});
for(const panelVersion of ["11.3.0","11.7.0"])test(`v${panelVersion}: idle directory following updates the target and retains the selected files without repeated requests`,async()=>{
  const h=await panelHarness(835690,false,{panelVersion}),summary=h.elements.get("[data-summary]").textContent;
  assert.equal(h.calls.length,1);await h.poll();await h.poll();assert.equal(h.calls.length,1);
  h.setPagePath("/www/wwwroot/other");await h.poll();
  assert.equal(h.elements.get("[data-path]").value,"/www/wwwroot/other");assert.match(h.elements.get("[data-path-status]").textContent,/已验证/);
  assert.equal(h.elements.get("[data-summary]").textContent,summary);assert.equal(h.elements.get("[data-start]").disabled,false);
  assert.deepEqual(h.calls,["GetDirNew","GetDirNew"]);await h.poll();assert.equal(h.calls.length,2);
  await h.click("[data-diagnostic]");assert.equal(h.diagnostic().followCurrentDirectory,true);
});

test("rapid A to B to C switches ignore a late B response even when the transport ignores abort",async()=>{
  let releaseB;
  const h=await panelHarness(0,false,{transport:{fetch:async(url,options)=>{
    const path=options.body.get("path");
    if(path==="/www/wwwroot/B")return new Promise(resolve=>{releaseB=()=>resolve(directoryReply(path));});
    return directoryReply(path);
  }}});
  h.setPagePath("/www/wwwroot/B");const first=h.poll();assert.equal(h.elements.get("[data-path]").value,"/www/wwwroot/B");assert.equal(h.elements.get("[data-start]").disabled,true);
  h.setPagePath("/www/wwwroot/C");await h.poll();releaseB();await first;
  assert.equal(h.elements.get("[data-path]").value,"/www/wwwroot/C");assert.match(h.elements.get("[data-path-status]").textContent,/已验证/);assert.equal(h.elements.get("[data-start]").disabled,false);
});

test("a path change before validation completes is detected without waiting for another poll",async()=>{
  let releaseB;const requested=[];
  const h=await panelHarness(0,false,{transport:{fetch:async(url,options)=>{
    const path=options.body.get("path");requested.push(path);
    if(path==="/www/wwwroot/B")return new Promise(resolve=>{releaseB=()=>resolve(directoryReply(path));});
    return directoryReply(path);
  }}});
  h.setPagePath("/www/wwwroot/B");const pending=h.poll();h.setPagePath("/www/wwwroot/C");releaseB();await pending;
  assert.equal(h.elements.get("[data-path]").value,"/www/wwwroot/C");assert.equal(h.elements.get("[data-start]").disabled,false);assert.deepEqual(requested,["/www/wwwroot/demo","/www/wwwroot/B","/www/wwwroot/C"]);
});

test("manual directories remain fixed until following is explicitly resumed",async()=>{
  const h=await panelHarness();h.input("/www/wwwroot/manual");await h.click("[data-verify]");
  h.setPagePath("/www/wwwroot/B");await h.poll();assert.equal(h.elements.get("[data-path]").value,"/www/wwwroot/manual");assert.match(h.elements.get("[data-follow-status]").textContent,/手动/);
  await h.click("[data-current]");assert.equal(h.elements.get("[data-path]").value,"/www/wwwroot/B");assert.equal(h.elements.get("[data-start]").disabled,false);assert.match(h.elements.get("[data-follow-status]").textContent,/自动跟随/);
});

test("missing page directories invalidate the last target and recover when the directory returns",async()=>{
  const h=await panelHarness();h.setPagePath("");await h.poll();assert.equal(h.elements.get("[data-start]").disabled,true);assert.match(h.elements.get("[data-path-status]").textContent,/无法读取/);
  await h.poll();assert.equal(h.calls.length,1);h.setPagePath("/www/wwwroot/B");await h.poll();assert.equal(h.elements.get("[data-start]").disabled,false);assert.equal(h.calls.length,2);
});

test("a failed directory validation does not trigger repeated server requests on unchanged polls",async()=>{
  let requests=0;const h=await panelHarness(0,false,{transport:{fetch:async()=>{requests++;return directoryReply("/www/wwwroot/demo");}}});
  h.setPagePath("/missing");await h.poll();await h.poll();await h.poll();assert.equal(requests,2);assert.equal(h.elements.get("[data-start]").disabled,true);assert.match(h.elements.get("[data-path-status]").textContent,/目录验证失败/);
});

test("a running job keeps A fixed and follows B only after the job has finished",async()=>{
  const model=transferHarness(),files=[selectedFile("index.html","page")];model.dirs.add("/www/wwwroot/B");let pause=false,release;
  const transport={...model.transport,fetch:async(url,options)=>{
    if(pause&&new URL(url).searchParams.get("action")==="GetDirNew"){pause=false;await new Promise(resolve=>{release=resolve;});}
    return model.transport.fetch(url,options);
  }};
  const h=await panelHarness(0,false,{transport,files});h.change("[data-method-direct]",{checked:true});pause=true;
  const running=h.click("[data-start]");h.setPagePath("/www/wwwroot/B");await h.poll();
  assert.equal(h.elements.get("[data-path]").value,"/www/wwwroot/demo");assert.match(h.elements.get("[data-follow-status]").textContent,/固定/);
  release();await running;assert.deepEqual(model.uploadedNames,["/www/wwwroot/demo/index.html"]);assert(!model.files.has("/www/wwwroot/B/index.html"));
  assert.equal(h.elements.get("[data-path]").value,"/www/wwwroot/B");assert.equal(h.elements.get("[data-start]").disabled,false);assert.equal(h.elements.get("[data-result-target]").textContent,"本次目标：/www/wwwroot/demo");
  await h.click("[data-diagnostic]");assert.equal(h.diagnostic().resultTarget,"/www/wwwroot/demo");assert.equal(h.diagnostic().target,"/www/wwwroot/B");assert.equal(h.diagnostic().verification.target,"/www/wwwroot/demo");
});

test("a click between directory switch and poll refreshes the target but does not silently upload",async()=>{
  const model=transferHarness();model.dirs.add("/www/wwwroot/B");
  const h=await panelHarness(0,false,{transport:model.transport,files:[selectedFile("index.html","page")]});h.change("[data-method-direct]",{checked:true});
  h.setPagePath("/www/wwwroot/B");await h.click("[data-start]");assert.deepEqual(model.uploadedNames,[]);assert.equal(h.elements.get("[data-path]").value,"/www/wwwroot/B");assert.match(h.elements.get("[data-path-status]").textContent,/确认目标/);
  await h.click("[data-start]");assert.deepEqual(model.uploadedNames,["/www/wwwroot/B/index.html"]);
});

test("hidden pages resume directory following on focus or visibility return",async()=>{
  const h=await panelHarness();h.document.visibilityState="hidden";h.setPagePath("/www/wwwroot/B");await h.poll();assert.equal(h.elements.get("[data-path]").value,"/www/wwwroot/demo");
  h.document.visibilityState="visible";await h.windowEvents.get("focus")();assert.equal(h.elements.get("[data-path]").value,"/www/wwwroot/B");
  h.setPagePath("/www/wwwroot/C");await h.documentEvents.get("visibilitychange")();assert.equal(h.elements.get("[data-path]").value,"/www/wwwroot/C");
});

test("closing during validation aborts the request, cleans listeners and ignores the eventual response",async()=>{
  let releaseB,signal;
  const h=await panelHarness(0,false,{transport:{fetch:async(url,options)=>{
    const path=options.body.get("path");if(path==="/www/wwwroot/B"){signal=options.signal;return new Promise(resolve=>{releaseB=()=>resolve(directoryReply(path));});}return directoryReply(path);
  }}});
  h.setPagePath("/www/wwwroot/B");const pending=h.poll();await h.click("[data-close]");
  assert.equal(signal.aborted,true);assert.equal(h.host.isConnected,false);assert.equal(h.intervals.size,0);assert.equal(h.windowEvents.size,0);assert.equal(h.documentEvents.size,0);
  const message=h.elements.get("[data-path-status]").textContent;releaseB();await pending;assert.equal(h.elements.get("[data-path-status]").textContent,message);
});

test("external removal or replacement disposes the directory monitor",async()=>{
  const h=await panelHarness();h.host.remove();await h.poll();assert.equal(h.intervals.size,0);assert.equal(h.windowEvents.size,0);
  const replacement=await panelHarness();replacement.host.events.get("btue-dispose")();assert.equal(replacement.intervals.size,0);assert.equal(replacement.documentEvents.size,0);
});
