// RIDE79 video rescue: if a video hasn't loaded after ~2.5s (some hosts/phones won't stream it),
// download it whole and play it from memory instead. No effect when videos load normally.
(function () {
  var t0 = Date.now();
  function rescue(v) {
    if (v._r79 || v.readyState >= 2) return;
    var src = v.currentSrc || v.getAttribute('src');
    if (!src || src.indexOf('blob:') === 0) return;
    v._r79 = 1;
    fetch(src).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (b) {
      var wasMuted = v.muted;
      v.src = URL.createObjectURL(b.type ? b : new Blob([b], { type: 'video/mp4' }));
      v.muted = wasMuted; v.setAttribute('playsinline', ''); v.load();
      if (v.autoplay || v.hasAttribute('data-autoloop')) { var p = v.play(); p && p.catch(function () {}); }
    }).catch(function () { v._r79 = 0; });
  }
  var iv = setInterval(function () {
    if (Date.now() - t0 > 2500) document.querySelectorAll('video').forEach(rescue);
    if (Date.now() - t0 > 20000) clearInterval(iv);
  }, 1000);
  document.addEventListener('touchstart', function () { document.querySelectorAll('video').forEach(rescue); }, { once: true, passive: true });
})();
