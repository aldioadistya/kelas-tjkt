(function(){
  function getHistoryState(){
    try{
      if(typeof state !== 'object' || !state) return false;
      return state.kasHistoryMinimized === true;
    }catch(e){ return false; }
  }

  window.toggleKasHistory = function(){
    try{
      if(typeof state === 'object' && state){
        state.kasHistoryMinimized = !getHistoryState();
        if(typeof saveState === 'function') saveState();
      }
    }catch(e){ console.warn('Kas history toggle:', e); }

    const body=document.getElementById('kas-history-body');
    const btn=document.querySelector('#view-kas .kas-history-toggle');
    const text=btn && btn.querySelector('.kas-history-toggle-text');
    const minimized=getHistoryState();

    if(body) body.classList.toggle('collapsed', minimized);
    if(btn) btn.setAttribute('aria-expanded', minimized ? 'false' : 'true');
    if(text) text.textContent=minimized ? 'Buka' : 'Minimalkan';
  };

  window.syncKasHistoryState = function(){
    const body=document.getElementById('kas-history-body');
    const btn=document.querySelector('#view-kas .kas-history-toggle');
    if(!body || !btn) return;
    const minimized=getHistoryState();
    body.classList.toggle('collapsed', minimized);
    btn.setAttribute('aria-expanded', minimized ? 'false' : 'true');
    const text=btn.querySelector('.kas-history-toggle-text');
    if(text) text.textContent=minimized ? 'Buka' : 'Minimalkan';
  };
})();
