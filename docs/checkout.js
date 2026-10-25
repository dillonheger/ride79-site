// RIDE79 one-click checkout. Paste one Stripe Payment Link per model + colourway (see HANDOVER.md).
window.RIDE79 = window.RIDE79 || {
  STRIPE: {
    'gt|Black / Yellow': 'https://buy.stripe.com/dRmdR80zAc760JQ12hafS00',
    'gt|White / Yellow': 'https://buy.stripe.com/dRm7sKeqqfjiakqbGVafS01',
    'pro|Black / Purple': 'https://buy.stripe.com/bJebJ01DEfjidwC6mBafS02',
    'pro|Black / Red': 'https://buy.stripe.com/28E4gydmm0oogIO7qFafS03',
    'pro|Black / Yellow': 'https://buy.stripe.com/5kQeVc6XYc76akqbGVafS04',
    'pro|Silver / Purple': 'https://buy.stripe.com/4gMaEW4PQfji0JQ3apafS05',
    'pro|Silver / Red': 'https://buy.stripe.com/5kQ14m4PQ6MMcsy9yNafS06',
    'pro|Silver / Yellow': 'https://buy.stripe.com/fZubJ01DE9YY64a7qFafS07'
  },
  NAMES: { gt: 'Falcon GT', pro: 'Falcon Pro' },
  url(model, colour) { return this.STRIPE[model + '|' + colour] || ''; },
  // Sends the buyer straight to Stripe. Until links are added, falls back to a prefilled WhatsApp order.
  go(model, colour) {
    const u = this.url(model, colour);
    if (u) {
      const ref = (model + '-' + colour).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      const dest = u + (u.includes('?') ? '&' : '?') + 'client_reference_id=' + encodeURIComponent(ref);
      // Stripe can't load inside a frame (previews, share links) — open a new tab there; same tab on the live site.
      let framed = true; try { framed = window.self !== window.top; } catch (e) {}
      if (framed) { if (!window.open(dest, '_blank', 'noopener')) window.top.location.href = dest; }
      else window.location.href = dest;
      return true;
    }
    window.open('https://wa.me/447875991471?text=' + encodeURIComponent("Hi RIDE79, I'd like to order the " + this.NAMES[model] + ' in ' + colour + '.'), '_blank', 'noopener,noreferrer');
    return false;
  }
};
