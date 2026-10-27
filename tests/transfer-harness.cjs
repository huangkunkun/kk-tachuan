"use strict";
const C=require("../core.js"),readZip=require("./zip-reader.cjs");
module.exports=function transferHarness({base="/www/wwwroot/demo",denyCreate=false,failUploadName=""}={}){
  const files=new Map(),dirs=new Set([base]),actions=[],uploadedNames=[],archivedNames=[];
  let activeUploads=0,maxActiveUploads=0;
  function addParents(directory){
    for(let current=directory;current===base||current.startsWith(base+"/");current=current.slice(0,current.lastIndexOf("/"))){dirs.add(current);if(current===base)break;}
  }
  async function handle(url,params){
    const action=new URL(url).searchParams.get("action");actions.push(action);
    if(action==="GetDirNew")return{path:dirs.has(params.path)?params.path:base,files:[],dir:[]};
    if(action==="CreateDir"){
      if(denyCreate)return{status:false,msg:"权限不足"};
      if(params.path.startsWith("/tmp/bt-upload-enhancer-")){C.assertStage(params.path);dirs.add(params.path);}else addParents(params.path);
      return{status:true};
    }
    if(action==="upload_files_exists")return params.files.split("\n").map(filename=>({filename,exists:files.has(filename)||dirs.has(filename),isfile:files.has(filename),size:files.get(filename)?.length||0}));
    if(action==="upload"){
      if(params.f_name===failUploadName)return{status:false,msg:"磁盘写入失败"};
      const full=`${params.f_path}/${params.f_name}`,size=Number(params.f_size),offset=Number(params.f_start),temporary=`${full}.${size}.tmp`;
      const current=files.get(temporary)||Buffer.alloc(0);if(current.length!==offset)return current.length;
      if(!dirs.has(params.f_path))return{status:false,msg:"目录不存在"};
      const next=Buffer.concat([current,Buffer.from(await params.blob.arrayBuffer())]);files.set(temporary,next);
      if(next.length<size)return next.length;
      files.set(full,next);files.delete(temporary);uploadedNames.push(full);return{status:true};
    }
    if(action==="UnZip"){
      for(const entry of readZip(files.get(params.sfile))){
        archivedNames.push(entry.name);
        // Simulate a server whose unzip changes non-ASCII file-name bytes.
        const name=entry.name.replace(/[\u0080-\uffff]/g,ch=>"#U"+ch.charCodeAt(0).toString(16));
        const full=`${params.dfile}/${name}`;files.set(full,entry.body);addParents(full.slice(0,full.lastIndexOf("/")));
      }
      return{status:true};
    }
    if(action==="DeleteDir"){
      C.assertStage(params.path);dirs.delete(params.path);for(const name of files.keys())if(name.startsWith(params.path+"/"))files.delete(name);return{status:true};
    }
    throw new Error(`unexpected action ${action}`);
  }
  class XHR{
    constructor(){this.upload={};this.stopped=false;}
    open(method,url){this.url=url;}
    setRequestHeader(){}
    abort(){this.stopped=true;this.onabort?.();}
    send(form){
      (async()=>{
        activeUploads++;maxActiveUploads=Math.max(maxActiveUploads,activeUploads);
        try{
        // Serialize and parse real multipart data so UTF-8 field names traverse the wire format.
        const request=new Request(this.url,{method:"POST",body:form});const parsed=await request.formData();
        if(this.stopped)return;const result=await handle(this.url,Object.fromEntries(parsed));
        if(this.stopped)return;this.status=200;this.responseText=JSON.stringify(result);this.onload();
        }finally{activeUploads--;}
      })().catch(error=>{this.failure=error;this.onerror?.();});
    }
  }
  return{files,dirs,actions,uploadedNames,archivedNames,addParents,get maxActiveUploads(){return maxActiveUploads;},transport:{FormData,XMLHttpRequest:XHR,fetch:async(url,options)=>{
    const result=await handle(url,Object.fromEntries(options.body));return{ok:true,text:async()=>JSON.stringify(result)};
  }}};
};
