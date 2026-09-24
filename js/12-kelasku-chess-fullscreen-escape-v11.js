(function(){
  document.addEventListener('keydown',function(e){
    if(e.key!=='Escape')return;
    var shell=document.querySelector('#view-catur .chess-shell');
    if(!shell || !shell.classList.contains('is-fullscreen'))return;
    shell.classList.remove('is-fullscreen');
    document.documentElement.classList.remove('chess-fullscreen-active');
    document.body.classList.remove('chess-fullscreen-active');
    if(typeof window.updateChessFullscreenButton==='function') window.updateChessFullscreenButton();
  });
})();
