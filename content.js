(() => {
  "use strict";
  const version="1.1.0";
  const runtime=window.__BT_UPLOAD_ENHANCER_RUNTIME__;
  const C=runtime?.core,P=runtime?.panel;
  const celebration=runtime?.celebration?.version===version?runtime.celebration:null;
  if(runtime?.version!==version || C?.version!==version || P?.version!==version)throw new Error("插件组件版本不一致，请重新加载插件并刷新宝塔页面。");
  const id="bt-upload-enhancer-root";
  const existing=document.getElementById(id);
  if(existing){
    if(existing.getAttribute("data-btue-version")===version){existing.scrollIntoView({block:"nearest"});existing.dispatchEvent(new Event("btue-expand"));return;}
    const oldCancel=existing.shadowRoot?.querySelector("[data-cancel]");
    if(existing.getAttribute("data-btue-busy")==="true" || oldCancel?.hidden===false){
      existing.dispatchEvent(new Event("btue-expand"));
      const notice=existing.shadowRoot?.querySelector("[data-notice]");
      if(notice){notice.textContent="旧版插件任务仍在运行，请等待结束后再点击插件图标，以加载新版。";notice.hidden=false;}
      return;
    }
    existing.dispatchEvent(new Event("btue-dispose"));existing.remove();
  }
  const host=document.createElement("div");host.id=id;host.style.cssText="position:fixed;right:20px;top:80px;z-index:2147483647;width:min(440px,calc(100vw - 32px));";
  host.setAttribute("data-btue-version",version);
  const view=host.attachShadow({mode:"open"});
  view.innerHTML=`
    <style>
      :host{all:initial;color-scheme:light}*{box-sizing:border-box}section{font:14px/1.55 "Microsoft YaHei UI","Segoe UI",sans-serif;color:#213c32;background:#fff;border:1px solid #cbded3;border-radius:10px;box-shadow:0 14px 55px #122c2933;overflow:hidden}button,input{font:inherit}button{cursor:pointer}button:disabled{cursor:default;opacity:.45}button:focus-visible,input:focus-visible{outline:2px solid #168557;outline-offset:3px}header{display:flex;align-items:center;gap:9px;padding:14px 17px;border-bottom:1px solid #dce7e0;background:#f5faf6}h2{font-size:16px;margin:0;font-weight:650}.tag{font-size:11px;color:#537363;border:1px solid #cadcd0;border-radius:4px;padding:1px 5px}.close{margin-left:auto;background:none;border:0;color:#557160;padding:3px 6px}.body{padding:16px;max-height:calc(100vh - 160px);overflow:auto}.destination{border-left:3px solid #168557;padding-left:11px;margin-bottom:15px}.label{font-size:12px;color:#64786e}.server{font:12px/1.5 Consolas,"Microsoft YaHei UI",monospace;overflow-wrap:anywhere;color:#365747;margin:4px 0 9px}.target-row{display:flex;gap:7px}.target-row button{flex:0 0 auto;white-space:nowrap}.target-row input{width:100%;min-width:0;border:1px solid #c9d8ce;border-radius:4px;padding:7px;color:#213c32;background:#fff;font:12px/1.6 Consolas,"Microsoft YaHei UI",monospace}.small{font-size:12px;color:#597064;margin:7px 0 0}.notice{color:#8e4918;background:#fff4e9;padding:9px 11px;border-radius:5px;margin-bottom:12px;font-size:12px;overflow-wrap:anywhere}.buttons{display:flex;gap:8px;flex-wrap:wrap}button.secondary{background:#fff;border:1px solid #c5d8cb;color:#2c5d43;border-radius:5px;padding:8px 11px}.summary{margin:14px 0 7px;font-weight:600}.files{margin:0 0 11px;padding:0;list-style:none;color:#597064;font:12px/1.7 Consolas,"Microsoft YaHei UI",monospace;overflow-wrap:anywhere}.option{display:flex;align-items:center;gap:7px;font-size:12px;color:#597064;margin:10px 0}.option input{accent-color:#168557}.primary{border:0;background:#168557;color:#fff;border-radius:6px;padding:11px;width:100%;font-weight:600;margin-top:11px}.overwrite{font-size:12px;color:#597064;margin:7px 0 0}.status{font-size:13px;font-weight:600;overflow-wrap:anywhere;margin-top:14px}.track{height:5px;border-radius:3px;overflow:hidden;background:#e8efeb;margin:8px 0}.bar{height:100%;width:0%;background:#168557}.logs{font-size:12px;color:#597064;max-height:125px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0 0}.footer{display:flex;justify-content:space-between;gap:10px;margin-top:10px}.text-button{background:none;border:0;color:#446a54;font-size:12px;padding:3px 0}.error{color:#a13e25}.success{color:#168557}[hidden]{display:none!important} @media(max-width:480px){.target-row{flex-wrap:wrap}.body{padding:12px}button{min-height:40px}}
      .methods{margin:0 0 14px}.choices{display:flex;gap:8px;margin-top:6px}.method{display:flex;align-items:center;gap:7px;flex:1;min-width:0;border:1px solid #c5d8cb;border-radius:5px;padding:8px 10px;font-size:13px;cursor:pointer}.method:has(input:checked){border-color:#168557;background:#f1f8f3;color:#126c46}.method input{accent-color:#168557;margin:0}.method:has(input:disabled){cursor:default;opacity:.55}
    </style>
    <section role="dialog" aria-label="KK塔传 · KK宝塔文件上传助手" aria-modal="false">
      <header><h2>KK塔传</h2><span class="tag">v${version}</span><button type="button" class="close" data-close aria-label="关闭KK塔传">关闭</button></header>
      <div class="body" data-body>
        <div class="label" style="margin:0 0 12px">KK宝塔文件上传助手</div>
        <div class="notice" data-notice hidden></div>
        <div class="destination"><div class="label">上传目标</div><div class="server" data-server></div>
          <div class="target-row"><input data-path aria-label="服务器目标目录" placeholder="读取当前目录，或填入完整路径" spellcheck="false"><button type="button" data-verify class="secondary">验证目录</button></div>
          <div class="small" data-path-status>目录尚未验证</div><div class="small" data-follow-status>自动跟随宝塔当前目录</div><button type="button" class="text-button" data-current>跟随当前目录</button>
        </div>
        <div class="buttons"><button type="button" class="secondary" data-folder>选择文件夹</button><button type="button" class="secondary" data-files>选择文件（JAR 等）</button></div>
        <input type="file" data-folder-input webkitdirectory multiple hidden><input type="file" data-files-input multiple hidden>
        <div class="summary" data-summary>尚未选择文件</div><ul class="files" data-file-list></ul>
        <div class="methods" data-methods role="radiogroup" aria-label="文件夹上传方式">
          <div class="label">上传方式</div><div class="choices">
            <label class="method"><input type="radio" name="btue-upload-method" data-method-archive value="archive" checked>打包上传</label>
            <label class="method"><input type="radio" name="btue-upload-method" data-method-direct value="direct">逐个上传</label>
          </div><div class="small">打包上传减少请求；逐个上传不压缩，文件多时通常更慢。</div>
        </div>
        <label class="option" data-keep-option hidden><input type="checkbox" data-keep>保留所选文件夹这一层目录</label>
        <div class="small" data-mode>文件夹会自动打成 ZIP，上传后解压到上方目录。</div>
        <button type="button" class="primary" data-start disabled>上传到此目录</button><p class="overwrite">同名文件将覆盖，目录中的其他文件保留。</p>
        <button type="button" class="text-button" data-check disabled style="margin-top:7px">仅核对已选文件（不上传）</button>
        <button type="button" class="text-button" data-special hidden disabled style="display:block;margin-top:5px">仅补传中文等特殊名称文件</button>
        <div data-result hidden><div class="small" data-result-target></div><div class="status" data-status role="status" aria-live="polite"></div><div class="track" data-track role="progressbar" aria-label="当前步骤进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="bar" data-bar></div></div><pre class="logs" data-logs></pre></div>
        <div class="footer"><button class="text-button" type="button" data-diagnostic>复制诊断信息</button><button class="text-button" type="button" data-cancel hidden>取消上传</button></div>
        <div class="small">使用当前宝塔登录会话。上传期间请保持本页打开。</div>
      </div>
    </section>`;
  document.documentElement.append(host);
  const $=selector=>view.querySelector(selector);
  const ctx=P.context();let selected=[],folder=false,prepared=null,uploadMethod="archive",verified="",followPage=true,busy=false,verifying=false,controller=null,stage="",cancelAllowed=true,lastError="",lastVerification=null,operation="idle",logLines=[];
  let disposed=false,directoryController=null,directoryRevision=0,followTimer=null,lastPagePath=ctx.path,resultTarget="";
  $("[data-server]").textContent=`${ctx.host} · 面板 v${ctx.version}`;
  $("[data-path]").value=ctx.path;
  if(ctx.reason){$("[data-notice]").textContent=ctx.reason;$("[data-notice]").hidden=false;}
  function updateControls(){
    if(disposed)return;
    host.setAttribute("data-btue-busy",String(busy||verifying));
    for(const selector of ["[data-folder]","[data-files]","[data-current]","[data-path]","[data-keep]","[data-method-archive]","[data-method-direct]"])$(selector).disabled=busy||verifying||!ctx.supported;
    $("[data-methods]").hidden=!!prepared&&!folder;
    $("[data-verify]").disabled=busy||verifying||!ctx.supported;
    $("[data-start]").disabled=busy||verifying||!ctx.supported||!prepared||verified!==$("[data-path]").value;
    $("[data-check]").disabled=$("[data-start]").disabled;
    const specialCount=folder&&prepared?C.folderUploadPlan(prepared.entries).directEntries.length:0;
    $("[data-special]").hidden=!specialCount||uploadMethod!=="archive";$("[data-special]").disabled=$("[data-start]").disabled;
    $("[data-special]").textContent=`仅补传中文等特殊名称文件（${specialCount} 个）`;
    $("[data-cancel]").hidden=!busy;$("[data-cancel]").disabled=!cancelAllowed;$("[data-close]").textContent=busy?"收起":"关闭";
    $("[data-follow-status]").textContent=busy?"本次任务固定使用此目录":followPage?"自动跟随宝塔当前目录":"手动指定目录 · 不随页面切换";
  }
  function status(message,kind="",percent){
    $("[data-result]").hidden=false;$("[data-status]").textContent=message;$("[data-status]").className=`status ${kind}`;
    if(percent!==undefined){const n=Math.max(0,Math.min(100,Number(percent)||0));$("[data-bar]").style.width=`${n}%`;$("[data-track]").setAttribute("aria-valuenow",String(Math.round(n)));}
  }
  function log(message){logLines.push(message);if(logLines.length>60)logLines.shift();$("[data-logs]").textContent=logLines.join("\n");$("[data-logs]").scrollTop=$("[data-logs]").scrollHeight;}
  function showError(error){if(error.verification)lastVerification=error.verification;lastError=P.safeMessage(error.message||error);status(lastError,"error");log(lastError);if(error.verification)log(`已核对 ${error.verification.checked}/${error.verification.total} 个文件，${error.verification.matched} 个通过。请复制诊断信息查看具体原因与字节数。`);}
  function cancelDirectoryValidation(){
    directoryRevision++;directoryController?.abort();directoryController=null;verifying=false;verified="";
  }
  function pageDirectory(){try {const path=P.detectPath();return path?C.targetPath(path):"";}catch{return "";}}
  async function verify(){
    if(busy||disposed||!ctx.supported)return;
    cancelDirectoryValidation();const revision=directoryRevision,requested=$("[data-path]").value;
    const aborter=new AbortController();directoryController=aborter;verifying=true;updateControls();
    $("[data-path-status]").textContent="正在核对服务器目录…";$("[data-path-status]").className="small";
    try {
      const value=await P.validateDirectory(requested,aborter.signal);
      if(disposed||revision!==directoryRevision||host.isConnected===false||$("[data-path]").value!==requested)return;
      if(followPage&&pageDirectory()!==value){await syncPageDirectory(true);return;}
      $("[data-path]").value=value;verified=value;$("[data-path-status]").textContent="已验证 · 将上传到此完整目录";$("[data-path-status]").className="small success";
    }catch(error){
      if(disposed||revision!==directoryRevision||aborter.signal.aborted)return;
      lastError=P.safeMessage(error.message||error);$("[data-path-status]").textContent=`目录验证失败：${lastError}`;$("[data-path-status]").className="small error";
    }finally{if(!disposed&&revision===directoryRevision){directoryController=null;verifying=false;updateControls();}}
  }
  async function syncPageDirectory(force=false){
    if(disposed||busy||!followPage||!ctx.supported)return;
    const path=pageDirectory();
    if(!path){
      if(force||lastPagePath||verified||verifying){lastPagePath="";cancelDirectoryValidation();$("[data-path-status]").textContent="无法读取当前页面目录，请返回文件管理或手动填写目录。";$("[data-path-status]").className="small error";updateControls();}
      return;
    }
    if(!force&&path===lastPagePath&&path===$("[data-path]").value)return;
    lastPagePath=path;$("[data-path]").value=path;await verify();
  }
  function dispose(){
    if(disposed)return;disposed=true;cancelDirectoryValidation();
    if(followTimer!==null)window.clearInterval(followTimer);followTimer=null;
    window.removeEventListener("focus",onPageActive);document.removeEventListener?.("visibilitychange",onPageActive);
  }
  function onPageActive(){if(document.visibilityState!=="hidden")return syncPageDirectory();}
  function selection(){
    try{celebration?.reset();}catch{}
    prepared=null;lastVerification=null;resultTarget="";$("[data-result-target]").textContent="";operation="idle";logLines=[];$("[data-logs]").textContent="";$("[data-bar]").style.width="0%";$("[data-track]").setAttribute("aria-valuenow","0");
    try {
      prepared=C.entriesFromFiles(selected,{folder,keepRoot:$("[data-keep]").checked});
      $("[data-summary]").textContent=`${prepared.entries.length.toLocaleString()} 个文件 · ${C.formatBytes(prepared.total)}`;
      $("[data-file-list]").replaceChildren();
      for(const entry of prepared.entries.slice(0,5)){const li=document.createElement("li");li.textContent=entry.name;$("[data-file-list]").append(li);}
      if(prepared.entries.length>5){const li=document.createElement("li");li.textContent=`… 还有 ${prepared.entries.length-5} 个文件`;$("[data-file-list]").append(li);}
      const specialCount=folder?C.folderUploadPlan(prepared.entries).directEntries.length:0;
      $("[data-mode]").textContent=folder?($("[data-keep]").checked?`将包含 ${prepared.rootName}/ 这一层目录。`:"将文件夹内容直接放入目标目录，不额外嵌套文件夹。")+(uploadMethod==="direct"?`全部 ${prepared.entries.length.toLocaleString()} 个文件依次直接上传，保留子目录结构，不生成压缩包。`:specialCount?`其中 ${specialCount} 个中文等特殊名称文件将单独上传，避免解压时文件名乱码。`:"文件将打包上传后解压。"):"所选文件按原文件名直接上传，不自动解压或重启服务。";
      $("[data-result]").hidden=true;lastError="";
    }catch(error){$("[data-summary]").textContent="未选定可上传的文件";$("[data-file-list]").replaceChildren();showError(error);}
    $("[data-keep-option]").hidden=!folder;updateControls();
  }
  const beforeUnload=event=>{if(busy){event.preventDefault();event.returnValue="";}};
  async function start(action="upload"){
    const checkOnly=action==="check",specialOnly=action==="special";
    if(disposed||busy||verifying||!prepared||!ctx.supported)return;
    const current=P.context();if(current.origin!==ctx.origin || !current.supported){showError(new Error("页面会话或面板版本已变化，请重新打开插件。"));return;}
    const destination=C.targetPath($("[data-path]").value);
    if(followPage&&pageDirectory()!==destination){await syncPageDirectory(true);if(verified)$("[data-path-status]").textContent="目录已切换并验证，请确认目标后再次操作。";return;}
    if(verified!==destination){showError(new Error("请先验证当前目标目录。"));return;}
    const job={entries:prepared.entries.slice(),total:prepared.total,folder,destination,method:folder?uploadMethod:"direct"};
    const plan=job.folder?C.folderUploadPlan(job.entries):null;
    if(specialOnly&&(!plan||!plan.directEntries.length))return;
    try{celebration?.reset();}catch{}
    busy=true;resultTarget=destination;$("[data-result-target]").textContent=`本次目标：${destination}`;operation=checkOnly?"check":specialOnly?"upload_special_names":"upload";if(!checkOnly)stage="";controller=new AbortController();cancelAllowed=true;lastError="";lastVerification=null;logLines=[];$("[data-logs]").textContent="";$("[data-cancel]").textContent=checkOnly?"取消核对":"取消上传";updateControls();window.addEventListener("beforeunload",beforeUnload);
    const signal=controller.signal;
    log(`目标：${ctx.host} ${destination}`);log(`内容：${job.entries.length} 个文件，${C.formatBytes(job.total)}`);
    if(!checkOnly)log(`方式：${specialOnly?"仅补传特殊名称文件":job.method==="direct"?"逐个上传":"打包上传"}`);
    try {
      status("正在复核目标目录…","",0);await P.validateDirectory(destination,signal);
      if(checkOnly){
        log("仅读取服务器文件元数据，不上传、解压或清理文件。");
        lastVerification=await P.verifyFiles(job.entries,destination,signal,(done,total)=>status(`核对文件与大小 · ${done}/${total}`,"",done/total*100));
        status("核对完成 · 文件存在与大小一致","success",100);log(`已核对 ${job.entries.length} 个文件。本次没有上传文件。`);return;
      }
      status("正在检查面板文件核对接口…","",0);await P.preflight(destination,signal);
      if(job.folder&&(job.method==="archive"||specialOnly)){
        if(!specialOnly&&plan.archiveEntries.length){
        status("正在打包文件夹…","",0);
        const archive=await C.buildZip(plan.archiveEntries,{signal,onProgress:p=>status(`打包 ${p.index}/${p.count} · ${C.formatBytes(p.processed)}`,"",p.total?p.processed/p.total*100:p.index/p.count*100)});
        log(`打包完成：${C.formatBytes(archive.blob.size)}${archive.compressed?"（压缩 ZIP）":"（ZIP 归档）"}`);
        const uuid=C.uuid();const name=`btue-${uuid}.zip`;stage=await P.createStage(uuid,signal);log(`暂存目录：${stage}`);
        status("正在上传压缩包…","",0);
        await P.upload(archive.blob,name,stage,{signal,onProgress:(done,total)=>status(`上传压缩包 · ${C.formatBytes(done)} / ${C.formatBytes(total)}`,"",total?done/total*100:100)});
        log("压缩包上传完成，服务器文件大小已核对。");
        C.abort(signal);cancelAllowed=false;updateControls();status("服务器正在解压，请保持本页打开…","",0);
        await P.extract(stage,name,destination);log("面板已返回解压结果。");cancelAllowed=true;updateControls();
        }
        if(plan.directEntries.length){
          log(`${specialOnly?"本次仅补传":"单独上传"} ${plan.directEntries.length} 个中文等特殊名称文件，保留原目录结构。`);
          await P.uploadEntries(plan.directEntries,destination,{signal,
            onFile:entry=>log(`单独上传：${entry.name}`),
            onProgress:(done,total,index,count,name)=>status(`上传特殊名称文件 ${index}/${count} · ${name}`,"",total?done/total*100:100)});
        }
        lastVerification=await P.verifyFiles(job.entries,destination,signal,(done,total)=>status(`核对文件与大小 · ${done}/${total}`,"",done/total*100));
        log(`已核对 ${job.entries.length} 个文件的存在与大小。`);
        if(stage)try {await P.cleanup(stage);log("本次暂存目录已清理。");stage="";}catch(error){log(`文件已核对，暂存目录清理未完成：${stage}`);}
      }else{
        await P.uploadEntries(job.entries,destination,{signal,
          onFile:entry=>log(`上传：${entry.name}`),
          onProgress:(done,total,index,count,name)=>status(`逐个上传 ${index}/${count} · ${name}`,"",total?done/total*100:index/count*100)});
        lastVerification=await P.verifyFiles(job.entries,destination,signal,(done,total)=>status(`核对文件与大小 · ${done}/${total}`,"",done/total*100));
        log(`已核对 ${job.entries.length} 个文件的存在与大小。`);
      }
      C.abort(signal);
      status(stage?"文件上传完成 · 暂存目录待清理":"上传完成 · 文件已核对","success",100);log("请刷新文件列表或检查网站。此插件不自动重启 Java 服务。");P.refresh();
      try{const animation=celebration?.fire();animation?.catch?.(()=>{});}catch{} // Decoration cannot change the upload result.
    }catch(error){
      if(error.name==="AbortError"){status("已停止。已经上传或解压的文件不会撤销。","error");log("上传已取消。");}
      else showError(error);
      if(stage)log(`本次暂存目录仍保留：${stage}`);
    }finally{busy=false;cancelAllowed=true;controller=null;window.removeEventListener("beforeunload",beforeUnload);updateControls();await syncPageDirectory();}
  }
  $("[data-folder]").addEventListener("click",()=>$("[data-folder-input]").click());
  $("[data-files]").addEventListener("click",()=>$("[data-files-input]").click());
  $("[data-folder-input]").addEventListener("change",event=>{if(busy||!event.target.files.length)return;folder=true;selected=Array.from(event.target.files);selection();event.target.value="";});
  $("[data-files-input]").addEventListener("change",event=>{if(busy||!event.target.files.length)return;folder=false;selected=Array.from(event.target.files);selection();event.target.value="";});
  $("[data-keep]").addEventListener("change",selection);
  for(const [selector,method] of [["[data-method-archive]","archive"],["[data-method-direct]","direct"]])$(selector).addEventListener("change",event=>{
    if(!event.target.checked||busy||verifying)return;
    uploadMethod=method;$("[data-method-archive]").checked=method==="archive";$("[data-method-direct]").checked=method==="direct";
    if(selected.length)selection();
    else {$("[data-mode]").textContent=method==="direct"?"文件夹中的文件会逐个上传，保留子目录结构，不生成压缩包。":"文件夹会打包上传并解压；中文等特殊名称文件单独上传。";updateControls();}
  });
  $("[data-path]").addEventListener("input",()=>{followPage=false;cancelDirectoryValidation();$("[data-path-status]").textContent="目录已修改，请重新验证";$("[data-path-status]").className="small";updateControls();});
  $("[data-verify]").addEventListener("click",verify);
  $("[data-current]").addEventListener("click",()=>{followPage=true;return syncPageDirectory(true);});
  $("[data-start]").addEventListener("click",()=>start().catch(showError));
  $("[data-check]").addEventListener("click",()=>start("check").catch(showError));
  $("[data-special]").addEventListener("click",()=>start("special").catch(showError));
  $("[data-cancel]").addEventListener("click",()=>{if(cancelAllowed)controller?.abort();});
  $("[data-close]").addEventListener("click",()=>{if(busy){$("[data-body]").hidden=!$("[data-body]").hidden;$("[data-close]").textContent=$("[data-body]").hidden?"展开":"收起";}else {dispose();try{celebration?.reset();}catch{}host.remove();}});
  host.addEventListener("btue-expand",()=>{$("[data-body]").hidden=false;syncPageDirectory();});host.addEventListener("btue-dispose",dispose);
  $("[data-diagnostic]").addEventListener("click",async()=>{
    const text=JSON.stringify({extension:version,components:{core:C.version,adapter:P.version},operation,panelVersion:ctx.version,host:ctx.host,target:$("[data-path]").value,resultTarget,followCurrentDirectory:followPage,sessionDetected:ctx.hasSession,supported:ctx.supported,selectedFiles:prepared?.entries.length||0,selectedBytes:prepared?.total||0,mode:folder?"folder":"files",uploadMethod:folder?uploadMethod:"direct",stage,lastError,verification:lastVerification},null,2);
    try {
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
      else {const area=document.createElement("textarea");area.value=text;area.style.cssText="position:fixed;left:-9999px";view.append(area);try{area.select();if(!document.execCommand("copy"))throw new Error("copy failed");}finally{area.remove();}}
      $("[data-diagnostic]").textContent="已复制（不含密码或令牌）";
    }
    catch{status("浏览器未允许复制诊断信息。","error");}
  });
  if(ctx.supported){
    followTimer=window.setInterval(()=>{if(host.isConnected===false){dispose();return;}return onPageActive();},400);
    window.addEventListener("focus",onPageActive);document.addEventListener?.("visibilitychange",onPageActive);
  }
  updateControls();if(ctx.supported&&ctx.path)verify();
})();
