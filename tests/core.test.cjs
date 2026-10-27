"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const C=require("../core.js"),readZip=require("./zip-reader.cjs"),makeAdapter=require("../panel-adapter.js");
function file(name,body,path){const f=new File([body],name,{lastModified:Date.UTC(2026,9,20)});if(path)Object.defineProperty(f,"webkitRelativePath",{value:path});return f;}
test("path validation rejects traversal, shell separators and dangerous cleanup targets",()=>{
  assert.equal(C.targetPath(" /www//wwwroot/demo/ "),"/www/wwwroot/demo");
  for(const path of ["/","/tmp/../etc","/tmp/./x","/tmp/x;id","/tmp/x'","/tmp/x\n","C:\\demo"] )assert.throws(()=>C.targetPath(path));
  for(const path of ["../a","a/../../b","/index.html","a\\b","C:/a","a//b","a\nb"] )assert.throws(()=>C.relativePath(path));
  for(const path of ["/tmp","/www/wwwroot/demo","/tmp/bt-upload-enhancer-x","/tmp/bt-upload-enhancer-123/../etc"])assert.throws(()=>C.assertStage(path));
  assert.equal(C.assertStage("/tmp/bt-upload-enhancer-12345678-1234-1234-1234-123456789abc"),"/tmp/bt-upload-enhancer-12345678-1234-1234-1234-123456789abc");
});
test("folder selection preserves nested paths and optionally the root",()=>{
  const files=[file("a.js","a","dist/assets/a.js"),file("index.html","b","dist/index.html")];
  assert.deepEqual(C.entriesFromFiles(files,{folder:true}).entries.map(e=>e.name),["assets/a.js","index.html"]);
  assert.deepEqual(C.entriesFromFiles(files,{folder:true,keepRoot:true}).entries.map(e=>e.name),["dist/assets/a.js","dist/index.html"]);
  assert.throws(()=>C.entriesFromFiles([file("a","x"),file("a","y")]));
  assert.throws(()=>C.entriesFromFiles([file("a","x","one/a"),file("b","y","two/b")],{folder:true}));
});
test("folder upload plan keeps Chinese, accented, emoji and non-ASCII parent paths out of ZIP",()=>{
  const entries=["assets/main.js","resource/标书.docx","资料/readme.txt","é.txt","😀.txt"].map(name=>({name}));
  const plan=C.folderUploadPlan(entries);assert.deepEqual(plan.archiveEntries.map(e=>e.name),["assets/main.js"]);assert.deepEqual(plan.directEntries,entries.slice(1));
  assert.throws(()=>C.folderUploadPlan([{name:"../中文.docx"}]));
});
test("ZIP supports over 1000 files, UTF-8 names and zero-byte entries with independently verified CRC",async()=>{
  const files=Array.from({length:1203},(_,i)=>file(`${i}.js`,`export default ${i};`, `dist/assets/${i}.js`));
  files.push(file("说明.txt","中文 & UTF-8","dist/说明.txt"),file("empty","","dist/empty"));
  const {entries}=C.entriesFromFiles(files,{folder:true});const zip=await C.buildZip(entries);const actual=readZip(await zip.blob.arrayBuffer());
  assert.equal(actual.length,1205);assert.equal(actual[1203].name,"说明.txt");assert.equal(actual[1203].body.toString(),"中文 & UTF-8");assert.equal(actual[1204].body.length,0);
  for(let i=0;i<1203;i++)assert.equal(actual[i].body.toString(),`export default ${i};`);
});
test("uncompressed ZIP fallback also has valid records and content",async()=>{
  const {entries}=C.entriesFromFiles([file("bundle.jar","binary\x00data")]);const zip=await C.buildZip(entries,{compress:false});const actual=readZip(await zip.blob.arrayBuffer());
  assert.equal(zip.compressed,false);assert.equal(actual[0].method,0);assert.equal(actual[0].body.toString(),"binary\x00data");
});
test("chunk uploader follows server resume offsets and always verifies final files",async()=>{
  const blob=new Blob(["0123456789"]);const sent=[];let verified=0;
  await C.uploadInChunks(blob,{chunkBytes:4,send:async(part,start)=>{sent.push(start);return start===0?6:{status:true};},verify:async()=>verified++});
  assert.deepEqual(sent,[0,6]);assert.equal(verified,1);
});
test("lost reply after a committed chunk is retried at the same offset",async()=>{
  const blob=new Blob(["abcdefghij"]);let bytes=0,first=true;const calls=[];
  await C.uploadInChunks(blob,{chunkBytes:4,send:async(part,start)=>{calls.push(start);if(first){first=false;bytes=4;throw new C.UploadError("network",true);}if(start!==bytes)return bytes;bytes+=part.size;return bytes===blob.size?{status:true}:bytes;},verify:async()=>assert.equal(bytes,10)});
  assert.deepEqual(calls,[0,0,4,8]);
});
test("zero-byte file is sent once and checked",async()=>{let sends=0,checks=0;await C.uploadInChunks(new Blob([]),{send:async p=>{sends++;assert.equal(p.size,0);return{status:true};},verify:async()=>checks++});assert.equal(sends,1);assert.equal(checks,1);});
test("business errors and ambiguous successes cannot masquerade as completed upload",async()=>{
  let sends=0;await assert.rejects(C.uploadInChunks(new Blob(["a"]),{send:async()=>{sends++;return{status:false,msg:"权限不足"};},verify:async()=>assert.fail()}),/权限不足/);assert.equal(sends,1);
  await assert.rejects(C.uploadInChunks(new Blob(["a"]),{send:async()=>({status:true}),verify:async()=>{throw new Error("wrong size");}}),/wrong size/);
  assert.throws(()=>C.uploadReply({status:"true"},1));assert.throws(()=>C.uploadReply(-1,1));assert.throws(()=>C.uploadReply(2,1));
});
test("stalled uploads stop and cancellation sends no request",async()=>{
  let attempts=0;await assert.rejects(C.uploadInChunks(new Blob(["abc"]),{send:async()=>{attempts++;return 0;},verify:async()=>assert.fail()}),/未前进/);assert.equal(attempts,2);
  const controller=new AbortController();controller.abort();await assert.rejects(C.uploadInChunks(new Blob(["abc"]),{signal:controller.signal,send:async()=>assert.fail(),verify:async()=>assert.fail()}),{name:"AbortError"});
});
test("non-JSON login pages are rejected without echoing page contents",()=>{assert.throws(()=>C.parseResponse("<html>secret password page</html>"),error=>/非 JSON/.test(error.message)&&!error.message.includes("secret"));});
test("UUID generation works without secure-context randomUUID",()=>{const cryptoApi={getRandomValues:array=>{array.fill(255);return array;}};const value=C.uuid(cryptoApi);assert.match(value,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);C.assertStage(`/tmp/bt-upload-enhancer-${value}`);});
function environment(fetch,{panelVersion="11.7.0",rootSelector="#app"}={}){
  const store={fileTabActiveData:{param:{path:"/www/wwwroot/demo"}}};
  const app={__vue_app__:{_context:{provides:{[Symbol("pinia")]:{_s:new Map([["FILES-STORE",store]])}}}}};
  return{vite_public_version:panelVersion,vite_public_request_token:"fake-session-token-for-tests-only",location:{origin:"https://panel.example.test:18888",host:"panel.example.test:18888"},document:{querySelector:s=>s===rootSelector?app:null,querySelectorAll:()=>[]},fetch};
}
test("adapter reuses the page token but never exports it in context",async()=>{
  let seen;const win=environment(async(url,options)=>{seen={url,options};return{ok:true,text:async()=>JSON.stringify({path:"/www/wwwroot/demo",dir:[],files:[]})};});const adapter=makeAdapter(win,C);
  assert.equal(adapter.context().path,"/www/wwwroot/demo");assert.equal(adapter.context().supported,true);assert(!JSON.stringify(adapter.context()).includes(win.vite_public_request_token));
  assert(!adapter.safeMessage(`bad: ${win.vite_public_request_token}`).includes(win.vite_public_request_token));
  assert.equal(await adapter.validateDirectory("/www/wwwroot/demo"),"/www/wwwroot/demo");
  assert.equal(seen.options.credentials,"same-origin");assert.equal(seen.options.headers["x-http-token"],win.vite_public_request_token);assert(!seen.options.body.has("request_token"));assert.equal(new URL(seen.url).origin,win.location.origin);
  win.vite_public_version="11.3.0";assert.equal(adapter.context().supported,true);win.vite_public_version="unknown";assert.equal(adapter.context().supported,false);
});

test("audited panel versions detect both Vue mount points and retain session, proxy and unknown-version restrictions",()=>{
  const versions=["9.3.0","9.4.0","9.5.0","9.6.0","11.0.0","11.1.0","11.2.0","11.3.0","11.4.0","11.4.1","11.5.0","11.6.0","11.7.0","11.8.0","11.8.1","13.0.0","13.1.0"];
  for(const panelVersion of versions)for(const rootSelector of ["#app","#root"]){
    const win=environment(async()=>assert.fail("context detection must not send requests"),{panelVersion,rootSelector});
    const adapter=makeAdapter(win,C),context=adapter.context();
    assert.deepEqual(adapter.supportedPanelVersions,versions);assert(Object.isFrozen(adapter.supportedPanelVersions));
    assert.equal(context.version,panelVersion);assert.equal(context.path,"/www/wwwroot/demo");assert.equal(context.supported,true);assert.equal(context.reason,"");
    let refreshed=0;const app=win.document.querySelector(rootSelector);app.__vue_app__._context.provides[Reflect.ownKeys(app.__vue_app__._context.provides)[0]]._s.get("FILES-STORE").refreshFilesList=()=>refreshed++;
    adapter.refresh();assert.equal(refreshed,1);
    win.vite_public_request_token="";assert.equal(adapter.context().supported,false);assert.match(adapter.context().reason,/登录/);
    win.vite_public_request_token="session-token";win.vite_public_proxy_key="managed-entry";assert.equal(adapter.context().supported,false);assert.match(adapter.context().reason,/代理/);
    win.vite_public_proxy_key="";
    for(const unknown of ["9.2.0","11.3.1","11.7.1","12.0.0","13.2.0","unknown"]){win.vite_public_version=unknown;assert.equal(adapter.context().supported,false);assert.match(adapter.context().reason,/暂不开放/);}
  }
});

test("read-only preflight requires an exact directory and a usable verification response",async()=>{
  let reply;const win=environment(async()=>({ok:true,text:async()=>JSON.stringify(reply)})),adapter=makeAdapter(win,C);
  reply=[{filename:"/www/wwwroot/demo",exists:true,isfile:false,size:4096}];assert.equal(await adapter.preflight("/www/wwwroot/demo"),true);
  for(const invalid of [[],[{filename:"/other",exists:true,isfile:false,size:0}],[{filename:"/www/wwwroot/demo",exists:false,isfile:false,size:0}],[{filename:"/www/wwwroot/demo",exists:true,isfile:true,size:0}],[{filename:"/www/wwwroot/demo",exists:true,isfile:false}],{status:false}]){
    reply=invalid;await assert.rejects(adapter.preflight("/www/wwwroot/demo"),/接口不兼容/);
  }
});

test("root mount lookup continues past an unrelated app element without guessing a directory",()=>{
  const win=environment(async()=>{}, {panelVersion:"11.3.0",rootSelector:"#root"}),query=win.document.querySelector;
  win.document.querySelector=selector=>selector==="#app"?{__vue_app__:{_context:{provides:{unrelated:{}}}}}:query(selector);
  assert.equal(makeAdapter(win,C).detectPath(),"/www/wwwroot/demo");
  win.document.querySelector=()=>null;assert.equal(makeAdapter(win,C).detectPath(),"");
});
test("directory fallback and mismatching file sizes fail closed",async()=>{
  const win=environment(async()=>({ok:true,text:async()=>JSON.stringify({path:"/www/wwwroot"})}));await assert.rejects(makeAdapter(win,C).validateDirectory("/not-found"),/目录.*不同/);
  win.fetch=async()=>({ok:true,text:async()=>JSON.stringify([{filename:"/www/wwwroot/demo/a.js",exists:true,isfile:true,size:3}])});await assert.rejects(makeAdapter(win,C).verifyFiles([{name:"a.js",size:4}],"/www/wwwroot/demo"),/未通过/);
});
test("verification checks every entry across batches; cleanup cannot escape staging",async()=>{
  let requests=0;const entries=Array.from({length:405},(_,i)=>({name:`assets/${i}.js`,size:17}));
  const win=environment(async(url,options)=>{requests++;assert.equal(new URL(url).searchParams.get("action"),"upload_files_exists");return{ok:true,text:async()=>JSON.stringify(options.body.get("files").split("\n").map(filename=>({filename,exists:true,isfile:true,size:17})))};});
  const adapter=makeAdapter(win,C);await adapter.verifyFiles(entries,"/www/wwwroot/demo");assert.equal(requests,3);
  await assert.rejects(adapter.cleanup("/www/wwwroot/demo"),/拒绝清理/);assert.equal(requests,3);
});
test("verification reports missing paths, missing files, field types and exact size differences separately",async()=>{
  const entries=[{name:"resource/clear-guide/templates/标书编制说明.docx",size:835690},{name:"missing.txt",size:12},{name:"wrong-size.txt",size:18},{name:"folder.txt",size:0},{name:"bad-type.txt",size:10},{name:"empty-size.txt",size:0},{name:"ok.txt",size:2}];
  const data=[
    {filename:"/www/wwwroot/demo/other-name.docx",exists:true,isfile:true,size:835690},
    {filename:"/www/wwwroot/demo/missing.txt",exists:false,isfile:false,size:0},
    {filename:"/www/wwwroot/demo/wrong-size.txt",exists:true,isfile:true,size:17},
    {filename:"/www/wwwroot/demo/folder.txt",exists:true,isfile:false,size:0},
    {filename:"/www/wwwroot/demo/bad-type.txt",exists:true,isfile:"true",size:10},
    {filename:"/www/wwwroot/demo/empty-size.txt",exists:true,isfile:true,size:""},
    {filename:"/www/wwwroot/demo/ok.txt",exists:true,isfile:true,size:"2"}
  ];
  const win=environment(async()=>({ok:true,text:async()=>JSON.stringify(data)}));
  await assert.rejects(makeAdapter(win,C).verifyFiles(entries,"/www/wwwroot/demo"),error=>{
    const report=error.verification;assert.equal(report.complete,true);assert.equal(report.checked,7);assert.equal(report.matched,1);assert.equal(report.mismatched,6);
    assert.deepEqual(report.failures.map(f=>f.reason),["missing_response","missing_file","size_mismatch","not_file","invalid_isfile","invalid_size"]);
    assert.equal(report.failures[0].expectedBytes,835690);assert.equal(report.failures[0].server,null);assert.equal(report.failures[0].returnedFilenameAtIndex,"/www/wwwroot/demo/other-name.docx");
    assert.equal(report.failures[2].server.size,17);assert.equal(report.failures[4].server.isfile,"true");return true;
  });
});
test("verification inspects all files after failures and caps diagnostic details",async()=>{
  const entries=Array.from({length:405},(_,i)=>({name:`assets/${i}.js`,size:17}));let requests=0;
  const win=environment(async(url,options)=>{requests++;return{ok:true,text:async()=>JSON.stringify(options.body.get("files").split("\n").map(filename=>({filename,exists:false,isfile:false,size:0})))};});
  await assert.rejects(makeAdapter(win,C).verifyFiles(entries,"/www/wwwroot/demo"),error=>{
    assert.equal(error.verification.checked,405);assert.equal(error.verification.mismatched,405);assert.equal(error.verification.failures.length,20);assert.equal(error.verification.complete,true);return true;
  });assert.equal(requests,3);
});
test("verification attaches incomplete reports on network or schema errors and accepts matching Chinese paths",async()=>{
  const entry={name:"resource/clear-guide/templates/标书编制说明.docx",size:835690};
  const win=environment(async(url,options)=>({ok:true,text:async()=>JSON.stringify([{filename:options.body.get("files"),exists:true,isfile:true,size:835690}])}));
  const adapter=makeAdapter(win,C);const success=await adapter.verifyFiles([entry],"/www/wwwroot/demo");assert.equal(success.matched,1);assert.equal(success.mismatched,0);
  win.fetch=async()=>({ok:true,text:async()=>"{}"});await assert.rejects(adapter.verifyFiles([entry],"/www/wwwroot/demo"),error=>error.verification?.complete===false && error.verification.checked===0);
});
