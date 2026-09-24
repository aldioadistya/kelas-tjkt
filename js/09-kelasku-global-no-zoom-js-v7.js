(function(){
  'use strict';

  // Prevent pinch zoom while keeping ordinary one-finger scrolling/tapping.
  document.addEventListener('touchstart', function(e){
    if (e.touches && e.touches.length > 1) {
      e.preventDefault();
    }
  }, {passive:false});

  document.addEventListener('touchmove', function(e){
    if (e.touches && e.touches.length > 1) {
      e.preventDefault();
    }
  }, {passive:false});

  // Prevent Safari/iOS gesture zoom.
  document.addEventListener('gesturestart', function(e){
    e.preventDefault();
  }, {passive:false});

  document.addEventListener('gesturechange', function(e){
    e.preventDefault();
  }, {passive:false});

  document.addEventListener('gestureend', function(e){
    e.preventDefault();
  }, {passive:false});

  // Prevent double-tap zoom, but leave normal taps intact.
  var lastTouchEnd = 0;
  document.addEventListener('touchend', function(e){
    var now = Date.now();
    if (now - lastTouchEnd <= 300) {
      e.preventDefault();
    }
    lastTouchEnd = now;
  }, {passive:false});

  // Prevent Ctrl/Cmd + wheel zoom; ordinary wheel scrolling remains.
  document.addEventListener('wheel', function(e){
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
    }
  }, {passive:false});
})();
