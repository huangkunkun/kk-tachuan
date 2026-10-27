"use strict";
const zlib=require("node:zlib");
// Independent ZIP central-directory reader used by the test server and assertions.
module.exports=function readZip(input){
  const data=Buffer.from(input);const end=data.length-22;
  if(end<0||data.readUInt32LE(end)!==0x06054b50)throw new Error("Missing ZIP end record");
  const count=data.readUInt16LE(end+10);let offset=data.readUInt32LE(end+16);const entries=[];
  for(let i=0;i<count;i++){
    if(data.readUInt32LE(offset)!==0x02014b50)throw new Error("Bad central record");
    const flags=data.readUInt16LE(offset+8),method=data.readUInt16LE(offset+10),crc=data.readUInt32LE(offset+16),packed=data.readUInt32LE(offset+20),size=data.readUInt32LE(offset+24);
    const nameLength=data.readUInt16LE(offset+28),extra=data.readUInt16LE(offset+30),comment=data.readUInt16LE(offset+32),local=data.readUInt32LE(offset+42);
    const name=data.subarray(offset+46,offset+46+nameLength).toString("utf8");
    if(data.readUInt32LE(local)!==0x04034b50)throw new Error("Bad local record");
    const start=local+30+data.readUInt16LE(local+26)+data.readUInt16LE(local+28);
    const raw=data.subarray(start,start+packed);const body=method===8?zlib.inflateRawSync(raw):method===0?raw:null;
    if(!body||body.length!==size||zlib.crc32(body)!==crc)throw new Error("Invalid ZIP size or CRC");
    if(!(flags&0x800))throw new Error("UTF-8 flag missing");
    entries.push({name,body,method});offset+=46+nameLength+extra+comment;
  }
  if(offset!==end)throw new Error("Wrong central-directory size");return entries;
};
