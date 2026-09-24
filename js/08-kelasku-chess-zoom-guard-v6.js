(function(){
  // Keep the app from being pinch/double-tap zoomed while preserving normal page scrolling.
  function isChessTarget(e){return !!(e.target && e.target.closest && e.target.closest('#view-catur'));}
  ['gesturestart','gesturechange','gestureend'].forEach(function(type){
    document.addEventListener(type,function(e){if(isChessTarget(e))e.preventDefault();},{passive:false});
  });
  document.addEventListener('wheel',function(e){
    if(isChessTarget(e) && (e.ctrlKey || e.metaKey)) e.preventDefault();
  },{passive:false});
  let lastTouchEnd=0;
  document.addEventListener('touchend',function(e){
    if(!isChessTarget(e))return;
    const now=Date.now();
    if(now-lastTouchEnd<=300)e.preventDefault();
    lastTouchEnd=now;
  },{passive:false});
})();
