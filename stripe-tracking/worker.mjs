// RIDE79 Stripe outcome tracking. Secrets belong in Cloudflare Settings, never here.
const MEASUREMENT_ID = 'G-B2W1QT9XP4';
const ORIGINS = new Set(['https://ride79.co.uk', 'https://www.ride79.co.uk']);
const LINKS = {
  plink_1UQAeKAGdhH7Bh6WP8ieEagD: ['gt', 'Black / Yellow'],
  plink_1UQB9gAGdhH7Bh6W5t2bSbuS: ['gt', 'White / Yellow'],
  plink_1UQBDlAGdhH7Bh6WyIgM1zoW: ['pro', 'Black / Purple'],
  plink_1UQBFVAGdhH7Bh6W6SS7uyxj: ['pro', 'Black / Red'],
  plink_1UQBGhAGdhH7Bh6W5UMGD5G4: ['pro', 'Black / Yellow'],
  plink_1UQBHfAGdhH7Bh6WPSarwjWc: ['pro', 'Silver / Purple'],
  plink_1UQBIdAGdhH7Bh6WlgJDuop6: ['pro', 'Silver / Red'],
  plink_1UQBJcAGdhH7Bh6WPV9BNA0v: ['pro', 'Silver / Yellow']
};
const TYPES = new Set(['checkout.session.expired', 'checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed']);
const encoder = new TextEncoder();
const now = () => Math.floor(Date.now() / 1000);
function json(value, status = 200, origin) {
  const headers = {'Content-Type':'application/json', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'};
  if (origin && ORIGINS.has(origin)) Object.assign(headers, {'Access-Control-Allow-Origin':origin, 'Vary':'Origin', 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Access-Control-Allow-Headers':'Content-Type', 'Access-Control-Max-Age':'600'});
  return new Response(JSON.stringify(value), {status, headers});
}
function ready(env) { return !!(env.TRACKING_DB && env.STRIPE_WEBHOOK_SECRET && env.STRIPE_READ_KEY && env.GA4_API_SECRET); }
async function schema(db) {
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS references_v1 (reference TEXT PRIMARY KEY, revoke_token TEXT NOT NULL, client_id TEXT NOT NULL, session_id TEXT NOT NULL, button_id TEXT NOT NULL, model TEXT NOT NULL, colour TEXT NOT NULL, campaign TEXT NOT NULL, created INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0)'),
    db.prepare('CREATE TABLE IF NOT EXISTS outcomes_v1 (session_id TEXT PRIMARY KEY, payment_link TEXT NOT NULL, outcome TEXT NOT NULL, currency TEXT NOT NULL, amount INTEGER NOT NULL, updated INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS deliveries_v1 (delivery_key TEXT PRIMARY KEY, state TEXT NOT NULL, lease INTEGER NOT NULL, created INTEGER NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS refs_client ON references_v1(client_id)')
  ]);
}
export async function verifySignature(body, header, secret, clock = now()) {
  if (!header || !secret) return false;
  const pairs = header.split(',').map(p => p.trim().split('='));
  const timestamp = pairs.find(([k]) => k === 't')?.[1];
  if (!/^\d+$/.test(timestamp || '') || Math.abs(clock - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['verify']);
  for (const [type, hex] of pairs) {
    if (type !== 'v1' || !/^[a-f0-9]{64}$/i.test(hex || '')) continue;
    const bytes = Uint8Array.from(hex.match(/../g), n => parseInt(n,16));
    if (await crypto.subtle.verify('HMAC', key, bytes, encoder.encode(timestamp + '.' + body))) return true;
  }
  return false;
}
export function classify(event) {
  const s = event.data?.object;
  if (!TYPES.has(event.type) || !s || s.object !== 'checkout.session' || !LINKS[s.payment_link]) return null;
  if (event.type === 'checkout.session.expired' && s.status === 'expired' && s.payment_status === 'unpaid') return 'checkout_abandoned';
  if (['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type) && s.status === 'complete' && s.payment_status === 'paid') return 'purchase';
  if (event.type === 'checkout.session.async_payment_failed') return 'checkout_payment_failed';
  return 'payment_pending';
}
async function register(request, env, origin) {
  if (!ORIGINS.has(origin)) return json({error:'Origin not allowed'},403);
  if (!/application\/json/i.test(request.headers.get('content-type') || '')) return json({error:'JSON required'},415,origin);
  const raw = await request.text();
  if (raw.length > 4096) return json({error:'Request too large'},413,origin);
  let b; try { b=JSON.parse(raw); } catch (_) { return json({error:'Invalid JSON'},400,origin); }
  if (b.consent !== true || !/^\d{1,20}\.\d{1,20}$/.test(b.client_id || '') || !/^\d{1,20}$/.test(String(b.session_id || '')) || !/^[a-z0-9_-]{1,80}$/.test(b.button_id || '') || !Object.values(LINKS).some(([m,c])=>m===b.model && c===b.colour)) return json({error:'Invalid registration'},400,origin);
  const campaign = {};
  for (const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term']) if (/^[a-zA-Z0-9_. -]{1,100}$/.test(b.campaign?.[key] || '')) campaign[key]=b.campaign[key];
  const reference='r79_' + crypto.randomUUID().replaceAll('-','');
  const revokeToken=crypto.randomUUID();
  await env.TRACKING_DB.prepare('INSERT INTO references_v1 (reference,revoke_token,client_id,session_id,button_id,model,colour,campaign,created) VALUES (?,?,?,?,?,?,?,?,?)').bind(reference,revokeToken,b.client_id,String(b.session_id),b.button_id,b.model,b.colour,JSON.stringify(campaign),now()).run();
  return json({reference,revoke_token:revokeToken},201,origin);
}
async function revoke(request,env,origin) {
  if (!ORIGINS.has(origin)) return json({error:'Origin not allowed'},403);
  const raw=await request.text(); if(raw.length>2048)return json({error:'Request too large'},413,origin);
  let b;try{b=JSON.parse(raw);}catch(_){return json({error:'Invalid JSON'},400,origin);}
  if(!/^r79_[a-f0-9]{32}$/.test(b.reference || '') || !/^[a-f0-9-]{36}$/.test(b.revoke_token || ''))return json({error:'Invalid revocation'},400,origin);
  // One authenticated revocation suppresses outstanding references for this GA client.
  await env.TRACKING_DB.prepare('UPDATE references_v1 SET revoked=1 WHERE client_id IN (SELECT client_id FROM references_v1 WHERE reference=? AND revoke_token=?)').bind(b.reference,b.revoke_token).run();
  return json({ok:true},200,origin);
}
async function stripeItems(session,env) {
  const rows=[];let after;
  do {
    const url=new URL('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(session.id) + '/line_items');
    url.searchParams.set('limit','100');if(after)url.searchParams.set('starting_after',after);
    const r=await fetch(url,{headers:{Authorization:'Bearer '+env.STRIPE_READ_KEY,'Stripe-Version':'2026-09-30.endive'}});
    if(!r.ok)throw new Error('Stripe line items unavailable');
    const data=await r.json();rows.push(...data.data);
    after=data.has_more ? data.data.at(-1)?.id : null;
    if(data.has_more && !after)throw new Error('Invalid Stripe pagination');
  } while(after && rows.length<200);
  const [model,colour]=LINKS[session.payment_link];
  return rows.slice(0,200).map(line=>({item_id:model,item_name:model==='gt'?'Falcon GT':'Falcon Pro',item_variant:colour,quantity:line.quantity || 1,price:((line.amount_subtotal || 0)/100)/(line.quantity || 1)}));
}
async function webhook(request,env) {
  const raw=await request.text();
  if(raw.length>1000000)return json({error:'Payload too large'},413);
  if(!await verifySignature(raw,request.headers.get('stripe-signature'),env.STRIPE_WEBHOOK_SECRET))return json({error:'Invalid signature'},400);
  let event;try{event=JSON.parse(raw);}catch(_){return json({error:'Invalid JSON'},400);}
  // This installation is for the Ride79 live account only.
  if(event.livemode !== true)return json({received:true,ignored:'mode'});
  const outcome=classify(event);if(!outcome)return json({received:true,ignored:'type_or_link'});
  const s=event.data.object;
  if(!/^cs_live_[a-zA-Z0-9]+$/.test(s.id || '') || !Number.isInteger(s.amount_total) || s.amount_total<0 || !['gbp','usd','eur'].includes(s.currency))return json({error:'Unsupported session'},422);
  await env.TRACKING_DB.prepare("INSERT INTO outcomes_v1 (session_id,payment_link,outcome,currency,amount,updated) VALUES (?,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET outcome=CASE WHEN outcomes_v1.outcome='purchase' THEN 'purchase' ELSE excluded.outcome END, amount=excluded.amount, updated=excluded.updated").bind(s.id,s.payment_link,outcome,s.currency,s.amount_total,now()).run();
  if(outcome==='payment_pending')return json({received:true});
  const ref=await env.TRACKING_DB.prepare('SELECT * FROM references_v1 WHERE reference=? AND revoked=0 AND created>?').bind(s.client_reference_id || '',now()-7*86400).first();
  // Unmatched and non-consenting outcomes remain in Stripe/D1 and are never sent to GA4.
  if(!ref)return json({received:true,analytics:'not_consented_or_unmatched'});
  if(ref.model !== LINKS[s.payment_link][0] || ref.colour !== LINKS[s.payment_link][1])return json({received:true,analytics:'reference_mismatch'});
  const key=s.id+':'+outcome;
  await env.TRACKING_DB.prepare("INSERT OR IGNORE INTO deliveries_v1 (delivery_key,state,lease,created) VALUES (?,'pending',0,?)").bind(key,now()).run();
  const previous=await env.TRACKING_DB.prepare('SELECT state FROM deliveries_v1 WHERE delivery_key=?').bind(key).first();
  if(previous?.state==='sent')return json({received:true,duplicate:true});
  const claim=await env.TRACKING_DB.prepare("UPDATE deliveries_v1 SET state='sending',lease=? WHERE delivery_key=? AND (state='pending' OR (state='sending' AND lease<?))").bind(now()+60,key,now()).run();
  if(claim.meta.changes!==1)return json({error:'Delivery in progress; retry'},503);
  try {
    const items=await stripeItems(s,env);
    if((await env.TRACKING_DB.prepare('SELECT revoked FROM references_v1 WHERE reference=?').bind(ref.reference).first())?.revoked) {
      await env.TRACKING_DB.prepare("UPDATE deliveries_v1 SET state='sent' WHERE delivery_key=?").bind(key).run();return json({received:true,analytics:'revoked'});
    }
    const params={currency:s.currency.toUpperCase(),value:(s.amount_total-(s.total_details?.amount_tax || 0)-(s.total_details?.amount_shipping || 0))/100,items,button_id:ref.button_id,model:ref.model,colour:ref.colour,engagement_time_msec:1,event_id:key,...JSON.parse(ref.campaign)};
    // Expiry often occurs after GA's session-attribution window; explicit campaign fields remain available.
    if(now()-Number(ref.session_id)<23*3600)params.session_id=Number(ref.session_id);
    if(outcome==='purchase')Object.assign(params,{transaction_id:s.id,tax:(s.total_details?.amount_tax || 0)/100,shipping:(s.total_details?.amount_shipping || 0)/100});
    const endpoint=new URL('https://www.google-analytics.com/mp/collect');endpoint.searchParams.set('measurement_id',MEASUREMENT_ID);endpoint.searchParams.set('api_secret',env.GA4_API_SECRET);
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:ref.client_id,consent:{ad_user_data:'DENIED',ad_personalization:'DENIED'},events:[{name:outcome,params}]})});
    if(!response.ok)throw new Error('Analytics delivery unavailable');
    await env.TRACKING_DB.prepare("UPDATE deliveries_v1 SET state='sent',lease=0 WHERE delivery_key=?").bind(key).run();
    return json({received:true,analytics:'sent'});
  } catch (_) {
    await env.TRACKING_DB.prepare("UPDATE deliveries_v1 SET state='pending',lease=0 WHERE delivery_key=?").bind(key).run();
    return json({error:'Delivery failed; retry'},503);
  }
}
export default {
  async fetch(request,env) {
    const path=new URL(request.url).pathname, origin=request.headers.get('origin');
    if(request.method==='GET' && path==='/')return json({service:'RIDE79 Stripe tracking',configured:ready(env)});
    if(request.method==='OPTIONS' && ['/register','/revoke'].includes(path))return ORIGINS.has(origin)?json({},200,origin):json({error:'Origin not allowed'},403);
    if(request.method!=='POST')return json({error:'Not found'},404);
    if(!['/register','/revoke','/stripe-webhook'].includes(path))return json({error:'Not found'},404);
    if(!ready(env))return json({error:'Tracking is not configured'},503,origin);
    try {
      await schema(env.TRACKING_DB);
      if(path==='/register')return await register(request,env,origin);
      if(path==='/revoke')return await revoke(request,env,origin);
      return await webhook(request,env);
    } catch (_) {return json({error:'Tracking temporarily unavailable'},503,origin);}
  }
};
