(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    const key="__BT_UPLOAD_ENHANCER_RUNTIME__";
    let runtime=root[key];
    if(runtime?.version!==api.version) {
      runtime={version:api.version};
      Object.defineProperty(root,key,{value:runtime,configurable:true,writable:true});
    }
    runtime.core=api;
  }
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const version="1.1.0";
  const MiB = 1024 * 1024;
  const LIMITS = Object.freeze({ folderBytes: 512 * MiB, archiveBytes: 400 * MiB, entries: 60000, chunkBytes: 2 * MiB });
  const encoder = new TextEncoder();
  class UploadError extends Error {
    constructor(message, retryable = false) { super(message); this.name = "UploadError"; this.retryable = retryable; }
  }
  const abort = (signal) => { if (signal?.aborted) throw new DOMException("已取消", "AbortError"); };
  function targetPath(value) {
    const raw = String(value || "");
    if (/[\x00-\x1f\x7f]/.test(raw)) throw new UploadError("目录不能包含控制字符。");
    const path = raw.trim();
    if (!path.startsWith("/") || /[\\\x00-\x1f\x7f'"`$;&|<>]/.test(path))
      throw new UploadError("目标目录需要是完整的 Linux 路径，且不能包含控制字符或命令特殊字符。");
    const normalized = path.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    if (normalized.split("/").some((part) => part === "." || part === "..")) throw new UploadError("目录不能包含 . 或 .. 路径段。");
    if (normalized === "/") throw new UploadError("不能上传到系统根目录。");
    return normalized;
  }
  function relativePath(value) {
    const path = String(value || "");
    if (!path || path.startsWith("/") || /^[a-z]:/i.test(path) || /[\\\x00-\x1f\x7f]/.test(path)) throw new UploadError("文件包含不安全的相对路径。");
    if (path.split("/").some((part) => !part || part === "." || part === "..")) throw new UploadError("文件路径不能包含空路径段、. 或 ..。");
    if (encoder.encode(path).length > 65535) throw new UploadError("文件路径太长，无法写入 ZIP。");
    return path;
  }
  function entriesFromFiles(files, { folder = false, keepRoot = false } = {}) {
    const source = Array.from(files || []);
    if (!source.length) throw new UploadError("请先选择文件夹或文件。");
    if (source.length > LIMITS.entries) throw new UploadError(`单次最多处理 ${LIMITS.entries} 个文件。`);
    const names = new Set(); let total = 0; let rootName;
    const entries = source.map((file) => {
      if (!Number.isSafeInteger(file.size) || file.size < 0) throw new UploadError("文件大小无效。");
      let name = folder ? file.webkitRelativePath : file.name;
      name = relativePath(name);
      if (folder) {
        const parts = name.split("/");
        if (parts.length < 2) throw new UploadError("未获得文件夹的相对路径，请重新使用“选择文件夹”。");
        if (rootName === undefined) rootName = parts[0];
        if (rootName !== parts[0]) throw new UploadError("一次请选择一个文件夹。");
        if (!keepRoot) name = parts.slice(1).join("/");
      } else if (name.includes("/")) throw new UploadError("文件名不能包含目录路径。");
      if (names.has(name)) throw new UploadError(`有重复的目标文件名：${name}`);
      names.add(name); total += file.size;
      if (!Number.isSafeInteger(total)) throw new UploadError("文件总大小超出支持范围。");
      return { name, file, size: file.size };
    });
    if (folder && total > LIMITS.folderBytes) throw new UploadError("单次文件夹原始大小最多 512 MiB。大文件可使用“选择文件”直接分片上传。");
    return { entries, total, rootName: rootName || "" };
  }
  function assertSuccess(data, operation) {
    if (!data || typeof data !== "object" || data.status !== true) {
      const msg = typeof data?.msg === "string" ? data.msg.replace(/<[^>]*>/g, "").slice(0,250) : "服务器未返回明确的成功结果";
      throw new UploadError(`${operation}失败：${msg}`);
    }
    return data;
  }
  function folderUploadPlan(entries) {
    const archiveEntries=[],directEntries=[];
    for(const entry of entries) {
      const name=relativePath(entry.name);
      (/[\u0080-\uffff]/.test(name)?directEntries:archiveEntries).push(entry);
    }
    return {archiveEntries,directEntries};
  }
  function parseResponse(text) {
    try { return JSON.parse(String(text).replace(/^\uFEFF/, "")); }
    catch { throw new UploadError("面板返回了非 JSON 内容，可能登录已过期或入口不兼容。请在原页面检查登录状态。"); }
  }
  function uploadReply(data, total) {
    if (typeof data === "number" && Number.isSafeInteger(data) && data >= 0 && data <= total) return { offset: data, done: false };
    if (data?.status === true) return { offset: total, done: true };
    assertSuccess(data, "上传");
    throw new UploadError("上传响应格式不兼容。");
  }
  async function uploadInChunks(blob, { send, verify, signal, onProgress = () => {}, chunkBytes = LIMITS.chunkBytes }) {
    if (!Number.isSafeInteger(blob.size) || blob.size < 0) throw new UploadError("上传文件大小无效。");
    if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) throw new UploadError("分片大小无效。");
    let offset = 0, rounds = 0, stalls = 0, complete = false;
    const maxRounds = Math.ceil(blob.size / chunkBytes) * 3 + 12;
    while (!complete) {
      abort(signal);
      if (++rounds > maxRounds) throw new UploadError("上传偏移反复变化，已停止。请检查网络和服务器暂存文件。");
      const end = Math.min(offset + chunkBytes, blob.size);
      let response;
      for (let retry = 0; ; retry++) {
        try { response = await send(blob.slice(offset,end),offset,end); break; }
        catch (error) { abort(signal); if (!error.retryable || retry >= 2) throw error; }
      }
      const reply = uploadReply(response, blob.size);
      if (reply.done || reply.offset === blob.size) complete = true;
      else {
        if (reply.offset === offset) { if (++stalls >= 2) throw new UploadError("服务器上传进度未前进，已停止。"); }
        else stalls = 0;
        offset = reply.offset;
      }
      onProgress(complete ? blob.size : offset,blob.size);
    }
    abort(signal);
    await verify(); // Never infer success solely from a JSON message or upload progress.
  }
  const crcTable = new Uint32Array(256);
  for (let n=0;n<256;n++) { let c=n; for(let k=0;k<8;k++) c=c&1?0xedb88320^(c>>>1):c>>>1; crcTable[n]=c>>>0; }
  function crcUpdate(crc,bytes) { for(let i=0;i<bytes.length;i++) crc=crcTable[(crc^bytes[i])&255]^(crc>>>8); return crc>>>0; }
  function bytes(length) { const a=new Uint8Array(length); return [a,new DataView(a.buffer)]; }
  function dateFields(time) {
    const d=new Date(time || Date.now());
    const year=Math.max(1980,Math.min(2107,d.getFullYear()));
    return { time:(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1), date:((year-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate() };
  }
  async function buildZip(entries, { signal, onProgress = () => {}, compress = true } = {}) {
    if (!entries.length || entries.length > LIMITS.entries) throw new UploadError("ZIP 文件数量无效。");
    const parts=[], central=[]; let offset=0, processed=0; const total=entries.reduce((s,e)=>s+e.size,0); let compressed=false;
    function push(part) { parts.push(part); offset+=part.byteLength ?? part.size; if(offset>LIMITS.archiveBytes) throw new UploadError("生成的 ZIP 超过 400 MiB 上限。请改用逐个上传。"); }
    for(let index=0;index<entries.length;index++) {
      abort(signal);
      const entry=entries[index], name=encoder.encode(relativePath(entry.name)), localOffset=offset, dt=dateFields(entry.file.lastModified);
      let compressor=null;
      if(compress && typeof CompressionStream === "function") { try { compressor=new CompressionStream("deflate-raw"); } catch {} }
      const method=compressor?8:0; compressed ||= !!compressor;
      const [header,h]=bytes(30); h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0808,true);h.setUint16(8,method,true);h.setUint16(10,dt.time,true);h.setUint16(12,dt.date,true);h.setUint16(26,name.length,true);
      push(header);push(name);let crc=0xffffffff, rawSize=0, packedSize=0;
      const tap=new TransformStream({ transform(chunk,controller) { abort(signal);crc=crcUpdate(crc,chunk);rawSize+=chunk.length;processed+=chunk.length;onProgress({processed,total,index:index+1,count:entries.length,name:entry.name});controller.enqueue(chunk); } });
      let stream=entry.file.stream().pipeThrough(tap);if(compressor)stream=stream.pipeThrough(compressor);
      const reader=stream.getReader();
      try { while(true) { abort(signal);const next=await reader.read();if(next.done)break;packedSize+=next.value.length;push(next.value); } }
      catch(error) { await reader.cancel().catch(()=>{});throw error; }
      finally { reader.releaseLock(); }
      if(rawSize!==entry.size)throw new UploadError(`读取文件时大小发生变化：${entry.name}`);
      crc=(crc^0xffffffff)>>>0;
      const [descriptor,d]=bytes(16);d.setUint32(0,0x08074b50,true);d.setUint32(4,crc,true);d.setUint32(8,packedSize,true);d.setUint32(12,rawSize,true);push(descriptor);
      const [record,c]=bytes(46);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0808,true);c.setUint16(10,method,true);c.setUint16(12,dt.time,true);c.setUint16(14,dt.date,true);c.setUint32(16,crc,true);c.setUint32(20,packedSize,true);c.setUint32(24,rawSize,true);c.setUint16(28,name.length,true);c.setUint32(42,localOffset,true);central.push(record,name);
      onProgress({processed,total,index:index+1,count:entries.length,name:entry.name});
    }
    const centralOffset=offset;for(const part of central)push(part);const centralSize=offset-centralOffset;
    const [end,e]=bytes(22);e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,centralOffset,true);push(end);
    return { blob:new Blob(parts,{type:"application/zip"}), compressed };
  }
  function assertStage(path) {
    if(!/^\/tmp\/bt-upload-enhancer-[a-f0-9-]{36}$/.test(path))throw new UploadError("拒绝清理非本次插件暂存目录。");
    return path;
  }
  function uuid(cryptoApi = globalThis.crypto) {
    if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
    if (typeof cryptoApi?.getRandomValues !== "function") throw new UploadError("浏览器不支持生成随机暂存标识。");
    const data=cryptoApi.getRandomValues(new Uint8Array(16));data[6]=(data[6]&15)|64;data[8]=(data[8]&63)|128;
    const hex=Array.from(data,n=>n.toString(16).padStart(2,"0")).join("");
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  function formatBytes(n) { if(n<1024)return `${n} B`;const units=["KiB","MiB","GiB","TiB"];let i=-1;do{n/=1024;i++;}while(n>=1024&&i<units.length-1);return `${n.toFixed(n>=100?0:1)} ${units[i]}`; }
  return Object.freeze({ version,LIMITS,UploadError,abort,targetPath,relativePath,entriesFromFiles,folderUploadPlan,assertSuccess,parseResponse,uploadReply,uploadInChunks,buildZip,assertStage,uuid,formatBytes });
});
