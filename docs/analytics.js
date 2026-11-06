// RIDE79 GA4. Basic consent: no Google requests until analytics is accepted.
(() => {
  'use strict';
  if (window.RIDE79Analytics) return;
  const ID = 'G-B2W1QT9XP4', KEY = 'ride79_analytics_consent_v1';
  const BACKEND = 'https://ride79-stripe-tracking.dillonheger83.workers.dev';
  const REFS = 'ride79_checkout_refs_v1';
  const UTM = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
  let accepted = false, loaded = false, lastButton = 'direct', campaign = {};
  const safe = value => /^[a-zA-Z0-9_. -]{1,100}$/.test(value || '') ? value : '';
  function read(store, key) { try { return store.getItem(key); } catch (_) { return null; } }
  function write(store, key, value) { try { store.setItem(key, value); } catch (_) {} }
  function collectCampaign() {
    try { campaign = JSON.parse(read(sessionStorage, 'ride79_campaign') || '{}'); } catch (_) { campaign = {}; }
    const query = new URLSearchParams(location.search);
    if (query.has('utm_source')) campaign = {};
    UTM.forEach(k => { const v = safe(query.get(k)); if (v) campaign[k] = v; });
    write(sessionStorage, 'ride79_campaign', JSON.stringify(campaign));
  }
  function pageLocation() {
    const url = new URL(location.origin + location.pathname);
    UTM.forEach(k => { const v = safe(new URLSearchParams(location.search).get(k)); if (v) url.searchParams.set(k,v); });
    return url.href;
  }
  function event(name, params) {
    if (!accepted || !loaded) return;
    window.gtag('event', name, Object.assign({send_to: ID, page_path: location.pathname, page_location: pageLocation()}, params));
  }
  function start() {
    accepted = true;
    collectCampaign();
    if (loaded) return;
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
    window.gtag('js',new Date());
    let referrer = ''; try { referrer = document.referrer ? new URL(document.referrer).origin : ''; } catch (_) {}
    window.gtag('config',ID,{page_location:pageLocation(),page_referrer:referrer,allow_google_signals:false,allow_ad_personalization_signals:false});
    const script = document.createElement('script');
    script.async = true; script.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
    document.head.appendChild(script);
    if (/^\/falcon-(gt|pro)(?:\.html)?$/.test(location.pathname)) {
      const model = location.pathname.includes('falcon-gt') ? 'gt' : 'pro';
      event('view_item',{currency:'GBP',value:model === 'gt' ? 3495 : 2995,items:[item(model)]});
    }
  }
  function item(model, colour) { return {item_id:model,item_name:model === 'gt' ? 'Falcon GT' : 'Falcon Pro',item_variant:colour || '',price:model === 'gt' ? 3495 : 2995,quantity:1}; }
  function revokeReference(ref) {
    return fetch(BACKEND + '/revoke', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(ref),keepalive:true}).then(r=>r.ok).catch(()=>false);
  }
  function revokeSaved() {
    let refs; try { refs=JSON.parse(read(localStorage,REFS)||'[]'); } catch (_) { refs=[]; }
    refs.forEach(ref=>{ revokeReference(ref).then(ok=>{if(ok){
      let current;try{current=JSON.parse(read(localStorage,REFS)||'[]');}catch(_){current=[];}
      write(localStorage,REFS,JSON.stringify(current.filter(r=>r.reference!==ref.reference)));
    }}); });
  }
  async function registerCheckout(model,colour,button) {
    if(!accepted || !loaded)return;
    let expired=false, timer;
    const timeout=new Promise(resolve=>{timer=setTimeout(()=>{expired=true;resolve();},1800);});
    const work=(async()=>{
      const get=field=>new Promise(resolve=>window.gtag('get',ID,field,resolve));
      const [client_id,session_id]=await Promise.all([get('client_id'),get('session_id')]);
      if(expired || !accepted || !/^\d{1,20}\.\d{1,20}$/.test(client_id||'') || !/^\d{1,20}$/.test(String(session_id||'')))return;
      const response=await fetch(BACKEND+'/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent:true,client_id,session_id,button_id:button,model,colour,campaign})});
      if(!response.ok)return;
      const ref=await response.json();
      if(!/^r79_[a-f0-9]{32}$/.test(ref.reference||'') || !/^[a-f0-9-]{36}$/.test(ref.revoke_token||''))return;
      if(expired || !accepted){revokeReference(ref);return;}
      let refs;try{refs=JSON.parse(read(localStorage,REFS)||'[]');}catch(_){refs=[];}
      refs=refs.filter(r=>r.at>Date.now()-7*86400000);
      refs.push({...ref,at:Date.now()});write(localStorage,REFS,JSON.stringify(refs));
      return ref.reference;
    })().catch(()=>undefined);
    const result=await Promise.race([work,timeout]);clearTimeout(timer);return result;
  }
  function choose(value) {
    write(localStorage,KEY,JSON.stringify({value,at:Date.now()}));
    if (value === 'accepted') start();
    else {
      accepted = false;
      revokeSaved();
      if (window.gtag && loaded) window.gtag('consent','update',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
      window['ga-disable-' + ID] = true;
      try { sessionStorage.removeItem('ride79_campaign'); } catch (_) {}
      const domains = [location.hostname,'.' + location.hostname,'.ride79.co.uk'];
      document.cookie.split(';').forEach(c => { const name = c.trim().split('=')[0]; if (/^_ga(?:_|$)/.test(name)) { document.cookie=name+'=;Max-Age=0;path=/'; domains.forEach(d=>{document.cookie=name+'=;Max-Age=0;path=/;domain='+d;}); } });
      if (loaded) location.reload();
    }
    document.getElementById('ride79-cookie-panel')?.remove();
  }
  function show() {
    if (document.getElementById('ride79-cookie-panel')) return;
    const panel = document.createElement('section');
    panel.id='ride79-cookie-panel'; panel.setAttribute('role','region'); panel.setAttribute('aria-label','Analytics cookie preferences');
    panel.style.cssText='position:fixed;bottom:12px;left:12px;right:12px;max-width:620px;max-height:80vh;overflow:auto;z-index:2147483647;background:#111;color:#f4f1e9;border:1px solid #777;padding:20px;box-shadow:0 4px 24px #0006;font:15px/1.5 system-ui,sans-serif';
    panel.innerHTML='<strong style="font-size:19px">Help us improve RIDE79</strong><p>With your permission, Google Analytics measures visits, traffic sources and shopping clicks, completed purchases and expired checkouts. Optional analytics cookies stay off until you accept. Advertising tracking stays off.</p><p><a href="/privacy#cookies" style="color:#fff">Privacy and cookie details</a></p><div style="display:flex;gap:12px;flex-wrap:wrap"><button type="button" data-choice="accepted">Accept analytics</button><button type="button" data-choice="rejected">Reject analytics</button></div>';
    panel.querySelectorAll('button').forEach(button=>{button.style.cssText='background:#f4f1e9;color:#111;border:1px solid #aaa;padding:12px 18px;font:600 15px system-ui;cursor:pointer';button.addEventListener('click',()=>choose(button.dataset.choice));});
    document.body.appendChild(panel);
  }
  window.RIDE79Analytics = {
    event, preferences:show,
    checkout(model,colour,done) {
      if (!accepted) { done(); return; }
      const registration=registerCheckout(model,colour,lastButton);
      const details={currency:'GBP',value:model==='gt'?3495:2995,button_id:lastButton,items:[item(model,colour)]};
      event('checkout_click',details);
      let sent=false; const finish=()=>{if (!sent){sent=true;registration.then(ref=>done(accepted?ref:undefined));}};
      event('begin_checkout',Object.assign({},details,{event_callback:finish,event_timeout:800}));
      setTimeout(finish,900);
    },
    decorate(url) { if (!accepted) return url; const dest=new URL(url); UTM.forEach(k=>{if(safe(campaign[k]))dest.searchParams.set(k,campaign[k]);}); return dest.href; }
  };
  document.addEventListener('click',e=>{
    const button=e.target.closest?.('a,button'); if(!button || button.closest('#ride79-cookie-panel'))return;
    const id=button.dataset.analyticsId || 'control-' + Array.from(document.querySelectorAll('a,button')).indexOf(button);
    lastButton=id;
    if(button.getAttribute('href') === '#cookie-settings'){e.preventDefault();show();return;}
    const href=button.getAttribute('href') || '';
    if (/^wa\.me$/.test((()=>{try{return new URL(href).hostname;}catch(_){return '';}})())) event('contact_click',{contact_method:'whatsapp',button_id:id});
    else if(/^tel:|^mailto:/.test(href))event('contact_click',{contact_method:href.startsWith('tel:')?'phone':'email',button_id:id});
    else if(/buy|Pay .*securely/i.test(button.textContent || '') || /#buy$/.test(href)) event('buy_button_click',{button_id:id});
  },true);
  function ready() {
    let saved; try{saved=JSON.parse(read(localStorage,KEY)||'null');}catch(_){}
    if(saved && Date.now()-saved.at < 180*86400000){if(saved.value==='accepted')start();else revokeSaved();}else show();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();
