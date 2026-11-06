const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(new URL('../docs/analytics.js', 'file://'+__filename),'utf8');
function boot(accepted,fail=false){
 const cache=new Map([['ride79_analytics_consent_v1',JSON.stringify({value:accepted?'accepted':'rejected',at:Date.now()})]]),session=new Map(),listeners={},requests=[];
 const storage=m=>({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)});
 const document={readyState:'loading',referrer:'',addEventListener:(k,f)=>listeners[k]=f,createElement:()=>({}),head:{appendChild(){}},getElementById:()=>null,cookie:''};
 const window={}; const ctx={window,document,localStorage:storage(cache),sessionStorage:storage(session),location:{origin:'https://ride79.co.uk',hostname:'ride79.co.uk',pathname:'/',search:'?utm_source=tiktok&utm_campaign=launch'},URL,URLSearchParams,Date,setTimeout,clearTimeout,fetch:async(url,opts)=>{requests.push({url,body:JSON.parse(opts.body)});if(fail)throw Error('offline');return {ok:true,json:async()=>({reference:'r79_'+'a'.repeat(32),revoke_token:'a'.repeat(8)+'-aaaa-aaaa-aaaa-'+'a'.repeat(12)})};}};
 vm.runInNewContext(source,ctx);listeners.DOMContentLoaded();
 if(accepted)window.gtag=(op,id,field,cb)=>{if(op==='get')cb(field==='client_id'?'123.456':'1793980000');else if(op==='event'&&field.event_callback)field.event_callback();};
 return {window,requests,cache};
}
(async()=>{
 const no=boot(false);let called=0;no.window.RIDE79Analytics.checkout('gt','Black / Yellow',()=>called++);assert.equal(called,1);assert.equal(no.requests.length,0);
 const yes=boot(true);const ref=await new Promise(resolve=>yes.window.RIDE79Analytics.checkout('gt','Black / Yellow',resolve));assert.equal(ref,'r79_'+'a'.repeat(32));assert.equal(yes.requests.length,1);assert.equal(yes.requests[0].body.campaign.utm_source,'tiktok');assert.equal(yes.requests[0].body.button_id,'direct');assert(!JSON.stringify(yes.requests).includes('email'));assert(yes.cache.has('ride79_checkout_refs_v1'));
 const offline=boot(true,true);assert.equal(await new Promise(resolve=>offline.window.RIDE79Analytics.checkout('pro','Silver / Red',resolve)),undefined);
 const code=fs.readFileSync(new URL('../docs/checkout.js','file://'+__filename),'utf8');
 const w={self:1,top:1,location:{},RIDE79Analytics:{decorate:u=>u,checkout:(m,c,done)=>done(ref)}};vm.runInNewContext(code,{window:w,URL,encodeURIComponent});
 for(const key of Object.keys(w.RIDE79.STRIPE)){const [m,c]=key.split('|');assert(w.RIDE79.go(m,c));const dest=new URL(w.location.href);assert.equal(dest.searchParams.get('client_reference_id'),ref);assert(w.location.href.startsWith(w.RIDE79.STRIPE[key]));}
 console.log('PASS: rejected consent makes no registration request; consented registration links GA and campaign; offline fallback; all eight Stripe redirects use opaque references.');
})();
