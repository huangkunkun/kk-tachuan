"use strict";
const http=require("node:http"),fs=require("node:fs"),path=require("node:path"),zlib=require("node:zlib");
const readZip=require("./zip-reader.cjs");const base=path.resolve(__dirname,"..");const token="mock-token-for-local-browser-tests-only-0000000000";
const showcase=process.argv.includes("--showcase");
const panelVersion=process.argv.find(arg=>arg.startsWith("--panel="))?.slice(8)||"11.7.0",mountId=panelVersion==="11.7.0"?"app":"root";
const uploadPath=showcase?"/www/wwwroot/site-demo":"/www/wwwroot/btue-test",alternatePath=showcase?"/www/wwwroot/another-site":"/www/wwwroot/another-test";
const files=new Map([[`${uploadPath}/server-only.json`,Buffer.from("keep me")],[`${uploadPath}/index.html`,Buffer.from("old")]]);
const dirs=new Set(["/www/wwwroot",uploadPath,alternatePath]);
let expired=false;const actions=[];let chunkCount=0,extractedCount=0;
function json(res,value,status=200){res.writeHead(status,{"Content-Type":"application/json;charset=utf-8"});res.end(JSON.stringify(value));}
async function body(req){const parts=[];for await(const part of req){parts.push(part);if(parts.reduce((s,p)=>s+p.length,0)>6*1024*1024)throw new Error("body too large");}return Buffer.concat(parts);}
function multipart(data,type){
  const boundary=type.match(/boundary=(?:"([^"]+)"|([^;]+))/);if(!boundary)throw new Error("boundary missing");
  const marker=Buffer.from("--"+(boundary[1]||boundary[2]));let pos=0;const result={};
  while((pos=data.indexOf(marker,pos))>=0){pos+=marker.length;if(data.subarray(pos,pos+2).toString()==="--")break;pos+=2;const headersEnd=data.indexOf(Buffer.from("\r\n\r\n"),pos);if(headersEnd<0)break;const name=data.subarray(pos,headersEnd).toString().match(/name="([^"]+)"/)?.[1];const next=data.indexOf(marker,headersEnd+4);if(next<0)break;const value=data.subarray(headersEnd+4,next-2);if(name)result[name]=name==="blob"?value:value.toString("utf8");pos=next;}
  return result;
}
const rawFixture=()=>`<!doctype html><html lang="zh"><meta charset="utf-8"><title>宝塔 v11.7.0 · 本地模拟面板</title><style>body{font:15px/1.7 'Microsoft YaHei UI',sans-serif;margin:32px;background:#f4f7f5;color:#244431}button{padding:9px;margin:6px 9px 6px 0}code{font-family:Consolas}#app{max-width:690px}h1{font-size:22px}</style><div id="app"><h1>宝塔文件管理 · 本地测试环境</h1><p>这是本地模拟面板，所有上传都在内存中处理，不连接真实服务器。</p><p>当前目录：<code id="current-path">/www/wwwroot/btue-test</code></p><button id="folder">载入 1205 个模拟前端文件</button><button id="jar">载入 5 MiB 模拟 JAR</button><button id="switch">切换当前页面目录</button><button id="production">模拟 v11.3.0 只读拦截</button><button id="expire">模拟登录过期</button><p id="fixture-state" role="status"></p></div><script>
window.vite_public_version='11.7.0';window.vite_public_request_token=${JSON.stringify(token)};
document.getElementById('app').__vue_app__={_context:{provides:{pinia:{_s:new Map([['FILES-STORE',{fileTabActiveData:{param:{path:'/www/wwwroot/btue-test'}},refreshFilesList:()=>{document.getElementById('fixture-state').textContent='文件列表已刷新（模拟）'}}]])}}}};
function setFiles(list,folder){const input=document.getElementById('bt-upload-enhancer-root').shadowRoot.querySelector(folder?'[data-folder-input]':'[data-files-input]');const transfer=new DataTransfer();for(const file of list)transfer.items.add(file);input.files=transfer.files;input.dispatchEvent(new Event('change'));}
document.getElementById('folder').onclick=()=>{const list=[];for(let i=0;i<1202;i++){const f=new File(['export default '+i+';'],'chunk-'+i+'.js');Object.defineProperty(f,'webkitRelativePath',{value:'dist/assets/chunk-'+i+'.js'});list.push(f);}for(const [name,data]of [['index.html','<html>new release</html>'],['说明.txt','中文内容'],['empty.txt','']]){const f=new File([data],name);Object.defineProperty(f,'webkitRelativePath',{value:'dist/'+name});list.push(f);}setFiles(list,true);};
document.getElementById('jar').onclick=()=>{const data=new Uint8Array(5*1024*1024+17);data.fill(71);setFiles([new File([data],'app.jar')],false);};
document.getElementById('switch').onclick=()=>{const store=document.getElementById('app').__vue_app__._context.provides.pinia._s.get('FILES-STORE');const path=store.fileTabActiveData.param.path==='/www/wwwroot/btue-test'?'/www/wwwroot/another-test':'/www/wwwroot/btue-test';store.fileTabActiveData.param.path=path;document.getElementById('current-path').textContent=path;};
document.getElementById('production').onclick=()=>{document.getElementById('bt-upload-enhancer-root')?.remove();window.vite_public_version='99.0.0';const s=document.createElement('script');s.src='/content.js';document.body.append(s);};
document.getElementById('expire').onclick=async()=>{await fetch('/__test/expire',{method:'POST'});document.getElementById('fixture-state').textContent='服务器会话已过期（模拟）';};
</script><script src="/core.js"></script><script src="/panel-adapter.js"></script><script src="/vendor/canvas-confetti.js"></script><script src="/celebration.js"></script><script>
const motionState=document.createElement('p');motionState.id='confetti-probe';motionState.textContent='动效验证：等待上传成功';document.getElementById('app').append(motionState);
new MutationObserver(records=>{for(const record of records)for(const canvas of record.addedNodes){if(canvas.nodeType!==1||!canvas.hasAttribute('data-btue-confetti'))continue;let drawn=false;motionState.textContent='动效验证：画布已创建';requestAnimationFrame(function probe(){if(!canvas.isConnected){motionState.textContent=drawn?'动效验证：已绘制并自动清理':'动效验证：画布已清理，未绘制';return;}const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;for(let i=3;i<pixels.length;i+=4)if(pixels[i]){drawn=true;break;}if(drawn)motionState.textContent='动效验证：已绘制彩纸';requestAnimationFrame(probe);});}}).observe(document.documentElement,{childList:true});
</script><script src="/content.js"></script></html>`;
const fixture=()=>{
  const html=rawFixture().replaceAll("11.7.0",panelVersion).replaceAll('id="app"',`id="${mountId}"`).replaceAll("getElementById('app')",`getElementById('${mountId}')`).replaceAll("#app",`#${mountId}`).replace("模拟 v11.3.0 只读拦截","模拟未适配版本拦截");
  if(!showcase)return html;
  return html.replaceAll("/www/wwwroot/btue-test",uploadPath).replaceAll("/www/wwwroot/another-test",alternatePath)
    .replace(`宝塔 v${panelVersion} · 本地模拟面板`,"KK塔传 · 功能演示")
    .replace("宝塔文件管理 · 本地测试环境","KK塔传 · 功能演示")
    .replace("切换当前页面目录","切换演示目录（A / B）")
    .replace("这是本地模拟面板，所有上传都在内存中处理，不连接真实服务器。","本页为本地功能演示，文件仅存于内存。右侧为扩展的实际界面。")
    .replace("</style>",`html{scrollbar-width:none}html::-webkit-scrollbar{display:none}body{margin:0;padding:32px;min-height:800px;box-sizing:border-box}#${mountId}{max-width:min(600px,calc(100vw - 540px))}button{border:1px solid #bdd1c5;border-radius:6px;color:#275840;background:#fff}h1{font-size:26px;letter-spacing:1px}#production,#expire,#confetti-probe{display:none}.demo-note{position:absolute;top:735px;font-size:13px;color:#597064}</style>`)
    .replace(/<\/html>$/,`<p class="demo-note">本地演示 · Linux 面板 v${panelVersion} · 文件直接发送至您选择的面板服务器</p></html>`);
};
http.createServer(async(req,res)=>{
  const url=new URL(req.url,"http://localhost");
  try{
    if(url.pathname==="/"){res.writeHead(200,{"Content-Type":"text/html;charset=utf-8","Set-Cookie":"btue_mock_session=local-test-only;HttpOnly;Path=/;SameSite=Strict"});res.end(fixture());return;}
    if(["/core.js","/panel-adapter.js","/vendor/canvas-confetti.js","/celebration.js","/content.js"].includes(url.pathname)){res.writeHead(200,{"Content-Type":"text/javascript;charset=utf-8"});res.end(fs.readFileSync(path.join(base,url.pathname)));return;}
    if(url.pathname==="/__test/expire"){expired=true;json(res,{ok:true});return;}
    if(url.pathname==="/__test/status"){
      const uploaded=[...files].filter(([p])=>[uploadPath+"/",alternatePath+"/"].some(prefix=>p.startsWith(prefix))).map(([name,data])=>({name,size:data.length,crc:zlib.crc32(data)}));
      json(res,{chunkCount,extractedCount,actions,stages:[...dirs].filter(p=>p.startsWith("/tmp/")),files:uploaded,serverOnlyPreserved:files.get(uploadPath+"/server-only.json")?.toString()==="keep me"});return;
    }
    if(url.pathname!=="/files"||req.method!=="POST"){json(res,{status:false,msg:"not found"},404);return;}
    if(expired||req.headers["x-http-token"]!==token||!req.headers.cookie?.includes("btue_mock_session=local-test-only")){json(res,{status:false,msg:"登录已过期"},403);return;}
    const action=url.searchParams.get("action");actions.push(action);
    const raw=await body(req);const type=req.headers["content-type"]||"";const params=type.startsWith("multipart/")?multipart(raw,type):Object.fromEntries(new URLSearchParams(raw.toString("utf8")));
    if(action==="GetDirNew"){json(res,{path:dirs.has(params.path)?params.path:"/www/wwwroot",dir:[],files:[]});return;}
    if(action==="CreateDir"){
      const staging=/^\/tmp\/bt-upload-enhancer-[a-f0-9-]{36}$/.test(params.path);
      const target=[uploadPath+"/",alternatePath+"/"].some(prefix=>params.path.startsWith(prefix));
      if((!staging&&!target)||params.path.split("/").some(part=>part===".."||part==="."))throw new Error("bad upload directory");
      for(let directory=params.path;directory&&!dirs.has(directory);directory=directory.slice(0,directory.lastIndexOf("/"))){dirs.add(directory);if(staging)break;}
      json(res,{status:true,msg:"目录创建成功"});return;
    }
    if(action==="upload"){
      chunkCount++;if(!dirs.has(params.f_path))throw new Error("missing upload directory");
      const size=Number(params.f_size),start=Number(params.f_start),temporary=`${params.f_path}/${params.f_name}.${size}.upload.tmp`,current=files.get(temporary)||Buffer.alloc(0);
      if(current.length!==start){json(res,current.length);return;}const next=Buffer.concat([current,params.blob]);files.set(temporary,next);
      if(next.length===size){files.set(`${params.f_path}/${params.f_name}`,next);files.delete(temporary);json(res,{status:true,msg:"上传成功"});}else json(res,next.length);return;
    }
    if(action==="upload_files_exists"){json(res,params.files.split("\n").map(filename=>({filename,exists:files.has(filename)||dirs.has(filename),isfile:files.has(filename),size:files.get(filename)?.length||0})));return;}
    if(action==="UnZip"){
      if(!params.sfile.startsWith("/tmp/bt-upload-enhancer-")||!dirs.has(params.dfile)||params.password!=="")throw new Error("bad extract request");
      const entries=readZip(files.get(params.sfile));for(const entry of entries){if(entry.name.split("/").includes("..")||entry.name.startsWith("/"))throw new Error("unsafe ZIP path");const full=`${params.dfile}/${entry.name}`;files.set(full,entry.body);for(let directory=full.slice(0,full.lastIndexOf("/"));directory&&!dirs.has(directory);directory=directory.slice(0,directory.lastIndexOf("/")))dirs.add(directory);}extractedCount+=entries.length;json(res,{status:true,msg:"解压成功"});return;
    }
    if(action==="DeleteDir"){if(!/^\/tmp\/bt-upload-enhancer-[a-f0-9-]{36}$/.test(params.path))throw new Error("unsafe cleanup");for(const key of files.keys())if(key.startsWith(params.path+"/"))files.delete(key);dirs.delete(params.path);json(res,{status:true,msg:"已清理"});return;}
    json(res,{status:false,msg:"unsupported action"},400);
  }catch(error){json(res,{status:false,msg:error.message},500);}
}).listen(8773,"127.0.0.1",()=>console.log("Mock panel: http://127.0.0.1:8773 (no real server connection)"));
