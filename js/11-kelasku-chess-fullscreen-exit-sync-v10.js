(function(){
  document.addEventListener('fullscreenchange', function(){
    var shell=document.querySelector('#view-catur .chess-shell');
    if(!shell) return;
    if(document.fullscreenElement !== shell){
      shell.classList.remove('is-fullscreen');
    }
  });
})();
