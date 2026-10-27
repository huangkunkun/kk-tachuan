(function(root,factory){
  if(typeof module==="object" && module.exports)module.exports=factory;
  else {
    const runtime=root.__BT_UPLOAD_ENHANCER_RUNTIME__;
    if(runtime && runtime.celebration?.version!=="1.1.0")runtime.celebration=factory(root,runtime.confetti);
  }
})(typeof globalThis==="object"?globalThis:this,function(win,confetti){
  "use strict";
  let active=null;
  function finish(state,played){
    if(active!==state)return;
    active=null;
    try{win.clearTimeout(state.timer);}catch{}
    try{state.cannon?.reset();}catch{}
    try{state.canvas.remove();}catch{}
    state.resolve(played);
  }
  function reset(){if(active)finish(active,false);}
  function fire(){
    reset();
    try{if(win.matchMedia?.("(prefers-reduced-motion: reduce)").matches)return Promise.resolve(false);}catch{}
    if(typeof confetti?.create!=="function")return Promise.resolve(false);
    let state;
    try{
      const canvas=win.document.createElement("canvas");
      canvas.setAttribute("aria-hidden","true");canvas.setAttribute("data-btue-confetti","");
      canvas.style.cssText="position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647;";
      const result=new Promise(resolve=>{state={canvas,resolve,cannon:null,timer:null};});
      active=state;win.document.documentElement.append(canvas);
      state.timer=win.setTimeout(()=>finish(state,false),4500);
      state.cannon=confetti.create(canvas,{resize:true,useWorker:false,disableForReducedMotion:true});
      const options={particleCount:85,spread:65,startVelocity:35,decay:.94,gravity:1.1,ticks:125,scalar:.85,
        colors:["#168557","#58b98a","#f4c15d","#83c5be","#d5a6cc"],disableForReducedMotion:true};
      const left=state.cannon({...options,angle:60,origin:{x:.15,y:.74}});
      const right=state.cannon({...options,angle:120,origin:{x:.85,y:.74}});
      Promise.all([left,right]).then(()=>finish(state,true),()=>finish(state,false));
      return result;
    }catch{
      if(state)finish(state,false);
      return Promise.resolve(false);
    }
  }
  return Object.freeze({version:"1.1.0",fire,reset});
});
