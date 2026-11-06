import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHmac} from 'node:crypto';
import worker, {classify,verifySignature} from './worker.mjs';
const db=new DatabaseSync(':memory:');
const binding={prepare(sql){return {values:[],bind(...v){this.values=v;return this;},async run(){const r=db.prepare(sql).run(...this.values);return {meta:{changes:Number(r.changes)}};},async first(){return db.prepare(sql).get(...this.values)||null;}};},async batch(stmts){return Promise.all(stmts.map(s=>s.run()));}};
const env={TRACKING_DB:binding,STRIPE_WEBHOOK_SECRET:'test-secret',STRIPE_READ_KEY:'test-read-key',GA4_API_SECRET:'test-ga-secret'};
const stamp=Math.floor(Date.now()/1000);
function event(type,payment='unpaid',status='expired'){return {id:'evt_fixture',livemode:true,type,data:{object:{id:'cs_live_fixture',object:'checkout.session',payment_link:'plink_1UQAeKAGdhH7Bh6WP8ieEagD',status,payment_status:payment,amount_total:349500,currency:'gbp'}}};}
function signed(e){const body=JSON.stringify(e);const sig=createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(stamp+'.'+body).digest('hex');return new Request('https://example.workers.dev/stripe-webhook',{method:'POST',headers:{'stripe-signature':`t=${stamp},v1=${sig}`},body});}
async function post(path,body,origin='https://ride79.co.uk'){return worker.fetch(new Request('https://example.workers.dev'+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}),env);}
assert.equal(await verifySignature('{}',null,'x'),false);
assert.equal(await verifySignature('{}',`t=${stamp-301},v1=${'a'.repeat(64)}`,'x'),false);
assert.equal(classify(event('checkout.session.expired')),'checkout_abandoned');
assert.equal(classify(event('checkout.session.completed','unpaid','complete')),'payment_pending');
assert.equal(classify(event('checkout.session.completed','paid','complete')),'purchase');
assert.equal((await worker.fetch(new Request('https://example.workers.dev/stripe-webhook',{method:'POST',body:'{}'}),env)).status,400);
assert.equal((await post('/register',{},'https://evil.example')).status,403);
assert.equal((await post('/register',{consent:false})).status,400);
const registration={consent:true,client_id:'1234.5678',session_id:String(stamp),button_id:'index-checkout-1',model:'gt',colour:'Black / Yellow',campaign:{utm_source:'tiktok',utm_campaign:'launch',email:'private@example.com'}};
const r=await post('/register',registration);assert.equal(r.status,201);const ref=await r.json();
let calls=[];
globalThis.fetch=async (url,options)=>{calls.push({url:String(url),options});if(String(url).startsWith('https://api.stripe.com/'))return Response.json({data:[{id:'li_fixture',quantity:1,amount_subtotal:349500}],has_more:false});return new Response('',{status:204});};
// A 204 Response must use a null body in Node's strict Web API implementation.
globalThis.fetch=async (url,options)=>{calls.push({url:String(url),options});if(String(url).startsWith('https://api.stripe.com/'))return Response.json({data:[{id:'li_fixture',quantity:1,amount_subtotal:349500}],has_more:false});return new Response(null,{status:204});};
const abandoned=event('checkout.session.expired');abandoned.data.object.client_reference_id=ref.reference;
assert.equal((await worker.fetch(signed(abandoned),env)).status,200);
assert.equal(calls.length,2);
const payload=JSON.parse(calls[1].options.body);assert.equal(payload.events[0].name,'checkout_abandoned');assert.equal(payload.events[0].params.button_id,'index-checkout-1');assert.equal(payload.events[0].params.utm_source,'tiktok');assert(!JSON.stringify(payload).includes('private@example.com'));assert(!JSON.stringify(payload).includes('test-'));
assert.equal((await worker.fetch(signed(abandoned),env)).status,200);assert.equal(calls.length,2);
const registration2=await (await post('/register',registration)).json();await post('/revoke',registration2);
const purchase=event('checkout.session.completed','paid','complete');purchase.data.object.id='cs_live_purchase';purchase.data.object.client_reference_id=registration2.reference;
await worker.fetch(signed(purchase),env);assert.equal(calls.length,2);
const registration3=await (await post('/register',{...registration,client_id:'222.333'})).json();purchase.data.object.client_reference_id=registration3.reference;
await worker.fetch(signed(purchase),env);assert.equal(calls.length,4);assert.equal(JSON.parse(calls[3].options.body).events[0].name,'purchase');
await worker.fetch(signed(purchase),env);assert.equal(calls.length,4);
const pending=event('checkout.session.completed','unpaid','complete');pending.data.object.id='cs_live_pending';pending.data.object.client_reference_id=registration3.reference;
await worker.fetch(signed(pending),env);assert.equal(calls.length,4);
const untracked=event('checkout.session.expired');untracked.data.object.id='cs_live_unmatched';await worker.fetch(signed(untracked),env);assert.equal(calls.length,4);
const wrong=event('checkout.session.expired');wrong.data.object.id='cs_live_wronglink';wrong.data.object.client_reference_id=registration3.reference;wrong.data.object.payment_link='plink_1UQB9gAGdhH7Bh6W5t2bSbuS';await worker.fetch(signed(wrong),env);assert.equal(calls.length,4);
console.log('PASS: signed events; tampered/old/missing signatures rejected; origin and consent validation; pending/unmatched sessions excluded; paid and expired outcomes; real SQLite schema and deduplication; consent revocation; link/reference mismatch; safe GA payload.');
