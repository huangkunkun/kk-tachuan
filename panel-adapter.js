(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;
  else {
    const runtime=root.__BT_UPLOAD_ENHANCER_RUNTIME__;
    if(runtime?.version!=="1.1.0" || runtime.core?.version!=="1.1.0")throw new Error("插件组件版本不一致，请重新加载插件并刷新宝塔页面。");
    runtime.panel=factory(root,runtime.core);
  }
})(typeof globalThis === "object" ? globalThis : this, function (win,C) {
  "use strict";
  // Only versions whose published archives were independently reviewed.
  const supportedPanelVersions=Object.freeze(["9.3.0","9.4.0","9.5.0","9.6.0","11.0.0","11.1.0","11.2.0","11.3.0","11.4.0","11.4.1","11.5.0","11.6.0","11.7.0","11.8.0","11.8.1","13.0.0","13.1.0"]);
  function token() {
    const value=String(win.vite_public_request_token || win.document.querySelector("#request_token_head")?.value || "").trim();
    if(!value || /[\r\n]/.test(value) || value.includes("{{")) throw new C.UploadError("未找到有效的页面登录校验信息。请先登录宝塔，进入文件管理后重试。");
    return value;
  }
  function safeMessage(value) {
    let text=String(value || "");
    try {const secret=token();text=text.split(secret).join("[校验令牌已隐藏]");}catch{}
    return text.slice(0,400);
  }
  function fileStore() {
    for(const selector of ["#app","#root"]) {
      const provides=win.document.querySelector(selector)?.__vue_app__?._context?.provides;
      if(!provides)continue;
      for(const key of Reflect.ownKeys(provides)) {
        const value=provides[key];
        if(value?._s instanceof Map && value._s.has("FILES-STORE"))return value._s.get("FILES-STORE");
      }
    }
    return null;
  }
  function detectPath() {
    const store=fileStore();
    const path=store?.fileTabActiveData?.param?.path || store?.dirPath;
    if(typeof path==="string" && path.startsWith("/"))return path;
    for(const input of win.document.querySelectorAll(".nav-path .path-input input, .files-nav-path input"))if(input.value?.startsWith("/"))return input.value;
    return ""; // Never silently guess a destination directory.
  }
  function context() {
    const raw=String(win.vite_public_version || "");const version=raw.match(/\d+\.\d+\.\d+/)?.[0] || "未知";
    let hasSession=false;try {token();hasSession=true;}catch{}
    return {origin:win.location.origin,host:win.location.host,version,path:detectPath(),hasSession,
      supported:supportedPanelVersions.includes(version) && hasSession && !win.vite_public_proxy_key,
      reason:!hasSession?"请在已登录的宝塔文件管理页面打开插件。":win.vite_public_proxy_key?"此代理管理入口尚未适配，请直接打开服务器面板。":!supportedPanelVersions.includes(version)?`当前面板 v${version} 暂不开放上传。请复制诊断信息反馈版本，支持范围见兼容性说明。`:""};
  }
  function url(action) { return new URL(`/files?action=${encodeURIComponent(action)}`,win.location.origin).href; }
  async function request(action,data,{signal,timeout=60000}={}) {
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
    const onAbort=()=>controller.abort();signal?.addEventListener("abort",onAbort,{once:true});if(signal?.aborted)controller.abort();
    try {
      const response=await win.fetch(url(action),{method:"POST",credentials:"same-origin",redirect:"error",cache:"no-store",
        headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8","x-http-token":token()},body:new URLSearchParams(data),signal:controller.signal});
      if(!response.ok)throw new C.UploadError(`面板请求返回 HTTP ${response.status}。请检查登录状态和访问权限。`);
      return C.parseResponse(await response.text());
    } catch(error) {
      C.abort(signal);
      if(error.name==="AbortError")throw new C.UploadError("面板响应超时。若已开始解压，请在宝塔检查结果后再操作。");
      if(error instanceof C.UploadError)throw error;
      throw new C.UploadError("无法访问当前面板。请检查网络、登录状态或入口兼容性。");
    } finally {clearTimeout(timer);signal?.removeEventListener("abort",onAbort);}
  }
  async function validateDirectory(path,signal) {
    const requested=C.targetPath(path), reply=await request("GetDirNew",{path:requested,p:1,showRow:1},{signal});
    if(reply?.status===false)C.assertSuccess(reply,"读取目录");
    if(typeof reply?.path!=="string" || C.targetPath(reply.path)!==requested)throw new C.UploadError("面板返回的目录与所选目录不同，已停止。请检查目录是否存在。");
    return requested;
  }
  // This is a read-only protocol check. It does not prove that writes or extraction work.
  async function preflight(path,signal) {
    const directory=C.targetPath(path);
    const reply=await request("upload_files_exists",{files:directory},{signal});
    const item=Array.isArray(reply)&&reply.length===1?reply[0]:null;
    const size=typeof item?.size==="number"||(typeof item?.size==="string"&&/^\d+$/.test(item.size))?Number(item.size):NaN;
    if(!item||item.filename!==directory||item.exists!==true||item.isfile!==false||!Number.isSafeInteger(size)||size<0)
      throw new C.UploadError("面板文件核对接口不兼容或目标目录不可读取，已停止上传。请复制诊断信息反馈。");
    return true;
  }
  async function verifyFiles(entries,target,signal,onProgress=()=>{}) {
    target=C.targetPath(target);
    const report={target,total:entries.length,checked:0,matched:0,mismatched:0,complete:false,failures:[],detailsLimit:20};
    try {
      for(let i=0;i<entries.length;i+=200) {
        C.abort(signal);const batch=entries.slice(i,i+200);
        const paths=batch.map(e=>`${target}/${C.relativePath(e.name)}`);
        const data=await request("upload_files_exists",{files:paths.join("\n")},{signal});
        if(!Array.isArray(data))throw new C.UploadError("面板文件校验接口响应不兼容，不能确认上传结果。");
        const byName=new Map(data.filter(item=>item && typeof item.filename==="string").map(item=>[item.filename,item]));
        for(let j=0;j<batch.length;j++) {
          const entry=batch[j],got=byName.get(paths[j]);
          const size=typeof got?.size==="number" || (typeof got?.size==="string" && /^\d+$/.test(got.size))?Number(got.size):NaN;
          const reason=!got?"missing_response":got.exists===false?"missing_file":got.exists!==true?"invalid_exists":got.isfile===false?"not_file":got.isfile!==true?"invalid_isfile":!Number.isSafeInteger(size)||size<0?"invalid_size":size!==entry.size?"size_mismatch":"";
          report.checked++;
          if(!reason){report.matched++;continue;}
          report.mismatched++;
          if(report.failures.length<report.detailsLimit) {
            const scalar=value=>typeof value==="string"?safeMessage(value):typeof value==="number"||typeof value==="boolean"?value:null;
            const failure={name:entry.name,path:paths[j],reason,expectedBytes:entry.size,
              server:got?{filename:safeMessage(got.filename),exists:scalar(got.exists),isfile:scalar(got.isfile),size:scalar(got.size)}:null};
            if(!got)failure.returnedFilenameAtIndex=scalar(data[j]?.filename);
            report.failures.push(failure);
          }
        }
        onProgress(report.checked,entries.length);
      }
      report.complete=true;
      if(report.mismatched) {
        const first=report.failures[0];
        const reason={missing_response:"校验接口未返回这个完整路径",missing_file:"服务器报告文件不存在",invalid_exists:"接口 exists 字段格式不兼容",not_file:"服务器报告该路径不是文件",invalid_isfile:"接口 isfile 字段格式不兼容",invalid_size:"接口未返回有效的文件字节数",size_mismatch:`字节数不同（本地 ${first.expectedBytes}，服务器 ${first.server?.size}）`}[first.reason];
        throw new C.UploadError(`核对未通过：${report.mismatched}/${report.total} 个文件。${first.name}：${reason}`);
      }
      return report;
    } catch(error) {
      error.verification=report;throw error;
    }
  }
  function sendChunk(blob,name,total,directory,offset,{signal,onProgress=()=>{}}={}) {
    return new Promise((resolve,reject)=>{
      C.abort(signal);const xhr=new win.XMLHttpRequest();let settled=false;
      const cleanup=()=>signal?.removeEventListener("abort",cancel);
      const finish=(error,value)=>{if(settled)return;settled=true;cleanup();error?reject(error):resolve(value);};
      const cancel=()=>{xhr.abort();finish(new DOMException("已取消","AbortError"));};
      xhr.open("POST",url("upload"));xhr.withCredentials=true;xhr.timeout=90000;xhr.setRequestHeader("x-http-token",token());
      xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress(Math.min(total,offset+blob.size*(event.loaded/event.total)),total);};
      xhr.onload=()=>{
        if(xhr.status<200||xhr.status>=300)return finish(new C.UploadError(`上传返回 HTTP ${xhr.status}，请检查登录和网络。`,xhr.status>=500));
        try {finish(null,C.parseResponse(xhr.responseText));}catch(error){finish(error);}
      };
      xhr.onerror=()=>finish(new C.UploadError("上传连接中断，自动重试后仍失败。",true));
      xhr.ontimeout=()=>finish(new C.UploadError("分片上传超时。",true));
      xhr.onabort=()=>finish(new DOMException("已取消","AbortError"));
      const form=new win.FormData();form.append("f_path",directory);form.append("f_name",name);form.append("f_size",String(total));form.append("f_start",String(offset));form.append("blob",blob,"blob");
      signal?.addEventListener("abort",cancel,{once:true});if(signal?.aborted){cancel();return;}
      xhr.send(form);
    });
  }
  async function upload(blob,name,directory,{signal,onProgress}={}) {
    C.relativePath(name);if(name.includes("/") || /[;&<>]/.test(name))throw new C.UploadError("该文件名包含宝塔上传器不支持的字符。");
    await C.uploadInChunks(blob,{signal,onProgress,send:(part,start)=>sendChunk(part,name,blob.size,directory,start,{signal,onProgress}),
      verify:()=>verifyFiles([{name,size:blob.size}],directory,signal)});
  }
  async function ensureUploadDirectory(path,signal) {
    const requested=C.targetPath(path);
    const reply=await request("GetDirNew",{path:requested,p:1,showRow:1},{signal});
    if(reply?.status===false)C.assertSuccess(reply,"读取上传子目录");
    if(typeof reply?.path!=="string")throw new C.UploadError("面板未返回有效子目录，已停止上传。");
    if(C.targetPath(reply.path)===requested)return requested;
    const created=await request("CreateDir",{path:requested},{signal});
    if(created?.status!==true) {
      // A concurrently created directory is acceptable only after an exact path check.
      try{return await validateDirectory(requested,signal);}catch{C.abort(signal);C.assertSuccess(created,"创建上传子目录");}
    }
    return validateDirectory(requested,signal);
  }
  async function uploadEntries(entries,target,{signal,onProgress=()=>{},onFile=()=>{}}={}) {
    const base=C.targetPath(target);
    const jobs=entries.map(entry=>{
      const parts=C.relativePath(entry.name).split("/"),name=parts.pop();
      if(/[;&<>]/.test(name))throw new C.UploadError(`该文件名包含宝塔上传器不支持的字符：${entry.name}`);
      return {entry,name,directory:parts.length?C.targetPath(`${base}/${parts.join("/")}`):base};
    });
    const checked=new Set([base]),total=entries.reduce((sum,entry)=>sum+entry.size,0);let completed=0;
    for(let i=0;i<jobs.length;i++) {
      C.abort(signal);const {entry,name,directory}=jobs[i];
      if(!checked.has(directory)){await ensureUploadDirectory(directory,signal);checked.add(directory);}
      onFile(entry,i+1,jobs.length);
      await upload(entry.file,name,directory,{signal,onProgress:done=>onProgress(completed+done,total,i+1,jobs.length,entry.name)});
      completed+=entry.size;onProgress(completed,total,i+1,jobs.length,entry.name);
    }
  }
  async function createStage(id,signal) {
    const path=C.assertStage(`/tmp/bt-upload-enhancer-${id}`);
    C.assertSuccess(await request("CreateDir",{path},{signal}),"创建暂存目录");return path;
  }
  async function extract(stage,name,target) {
    C.assertStage(stage);C.targetPath(target);C.relativePath(name);
    return C.assertSuccess(await request("UnZip",{sfile:`${stage}/${name}`,dfile:target,password:""},{timeout:600000}),"解压");
  }
  async function cleanup(stage) {C.assertStage(stage);return C.assertSuccess(await request("DeleteDir",{path:stage}),"清理暂存包");}
  function refresh() {try {const store=fileStore();if(typeof store?.refreshFilesList==="function")store.refreshFilesList();}catch{}}
  return Object.freeze({version:"1.1.0",supportedPanelVersions,context,detectPath,validateDirectory,preflight,verifyFiles,upload,uploadEntries,createStage,extract,cleanup,refresh,safeMessage});
});
