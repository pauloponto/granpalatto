/* Vídeos do YouTube: ao clicar, o player abre e toca dentro da própria página.
   Se o ambiente bloquear o player (como a prévia do Claude), o card volta e oferece abrir no YouTube. */
(function(){
  document.querySelectorAll('.video[data-yt]').forEach(function(a){
    a.addEventListener('click', function(e){
      if (a.classList.contains('v-blocked')) return;   // segue o link e abre no YouTube
      e.preventDefault();
      var box = document.createElement('div');
      box.className = a.className.replace(/\bphoto\b/, '') + ' v-playing';
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + a.dataset.yt + '?autoplay=1&rel=0&playsinline=1';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      f.title = a.getAttribute('aria-label') || 'Vídeo';
      f.className = 'v-frame';
      box.appendChild(f);
      var blocked = false;
      function onBlock(ev){
        if (blocked || !/youtube/.test(ev.blockedURI || '')) return;
        blocked = true;
        document.removeEventListener('securitypolicyviolation', onBlock);
        box.replaceWith(a);
        a.classList.add('v-blocked');
        var t = a.querySelector('.v-src');
        if (t) t.textContent = 'Toque de novo para abrir no YouTube';
      }
      document.addEventListener('securitypolicyviolation', onBlock);
      a.replaceWith(box);
    });
  });
})();
