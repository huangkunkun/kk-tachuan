"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const makeCelebration=require("../celebration.js");
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};}
function fixture({reduced=false,createThrows=false,rejects=false}={}){
  const canvases=[],timers=new Map(),bursts=[],pending=[],instances=[];let next=0;
  const win={matchMedia:()=>({matches:reduced}),setTimeout:(callback,ms)=>{assert.equal(ms,4500);timers.set(++next,callback);return next;},clearTimeout:id=>timers.delete(id),
    document:{createElement:tag=>{assert.equal(tag,"canvas");return{style:{},attributes:{},setAttribute(name,value){this.attributes[name]=value;},remove(){this.removed=true;}};},documentElement:{append:canvas=>canvases.push(canvas)}}};
  const library={create:(canvas,options)=>{
    if(createThrows)throw new Error("no canvas");
    assert.equal(options.useWorker,false);assert.equal(options.resize,true);assert.equal(options.disableForReducedMotion,true);
    const instance={resets:0};instances.push(instance);
    const fire=options=>{bursts.push(options);if(rejects)return Promise.reject(new Error("render failed"));const value=deferred();pending.push(value);return value.promise;};
    fire.reset=()=>instance.resets++;return fire;
  }};
  return{api:makeCelebration(win,library),win,canvases,timers,bursts,pending,instances};
}
test("success burst draws two sides, never takes pointer input, and removes its canvas after completion",async()=>{
  const f=fixture(),result=f.api.fire();assert.equal(f.canvases.length,1);assert.equal(f.bursts.length,2);assert.equal(f.timers.size,1);
  assert.equal(f.canvases[0].attributes["aria-hidden"],"true");assert.match(f.canvases[0].style.cssText,/pointer-events:none/);assert.equal(f.bursts[0].angle,60);assert.equal(f.bursts[1].angle,120);
  f.pending.forEach(value=>value.resolve());assert.equal(await result,true);assert.equal(f.canvases[0].removed,true);assert.equal(f.timers.size,0);assert.equal(f.instances[0].resets,1);
});
test("reduced-motion preference skips canvas creation",async()=>{const f=fixture({reduced:true});assert.equal(await f.api.fire(),false);assert.equal(f.canvases.length,0);assert.equal(f.timers.size,0);});
test("missing or failed rendering cannot leave an overlay or reject the upload caller",async()=>{
  for(const options of [{createThrows:true},{rejects:true}]){const f=fixture(options);assert.equal(await f.api.fire(),false);assert.equal(f.canvases[0].removed,true);assert.equal(f.timers.size,0);}
  const f=fixture();assert.equal(await makeCelebration(f.win,null).fire(),false);assert.equal(f.canvases.length,0);
});
test("timeout and explicit reset remove unfinished animation resources",async()=>{
  const f=fixture(),first=f.api.fire();[...f.timers.values()][0]();assert.equal(await first,false);assert.equal(f.canvases[0].removed,true);
  const second=f.api.fire();f.api.reset();assert.equal(await second,false);assert.equal(f.canvases[1].removed,true);assert.equal(f.timers.size,0);
  f.pending.forEach(value=>value.resolve());await Promise.resolve();
});
test("a new burst replaces the previous canvas and stale completion cannot remove the new one",async()=>{
  const f=fixture(),first=f.api.fire(),second=f.api.fire();assert.equal(await first,false);assert.equal(f.canvases[0].removed,true);assert.equal(f.canvases[1].removed,undefined);
  f.pending.slice(0,2).forEach(value=>value.resolve());await Promise.resolve();await Promise.resolve();assert.equal(f.canvases[1].removed,undefined);
  f.pending.slice(2).forEach(value=>value.resolve());assert.equal(await second,true);assert.equal(f.canvases[1].removed,true);
});
