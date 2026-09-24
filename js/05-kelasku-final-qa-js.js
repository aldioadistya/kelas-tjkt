(function(){
  'use strict';
  function closeTransientUi(){
    try{
      document.querySelectorAll('.modal.open,.modal.show,[aria-modal="true"]').forEach(function(el){
        if(el.classList.contains('modal')) return;
      });
      document.querySelectorAll('.month-picker.open').forEach(function(el){el.classList.remove('open');});
    }catch(e){}
  }
  function resetViewScroll(){
    try{
      document.querySelectorAll('.view').forEach(function(v){
        if(v.classList.contains('active')){
          v.scrollTop=0;
          v.querySelectorAll('.scroll-area,.report-list,.activity-list').forEach(function(el){el.scrollTop=0;});
        }
      });
    }catch(e){}
  }
  window.addEventListener('hashchange',resetViewScroll,{passive:true});
  document.addEventListener('click',function(e){
    var nav=e.target.closest && e.target.closest('[data-view],.nav-item,.tabbar-item');
    if(nav) setTimeout(resetViewScroll,0);
  },true);
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape') closeTransientUi();
  });
  window.addEventListener('resize',function(){
    document.documentElement.style.setProperty('--viewport-w',window.innerWidth+'px');
  },{passive:true});
  try{ document.documentElement.style.setProperty('--viewport-w',window.innerWidth+'px'); }catch(e){}
})();
