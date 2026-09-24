(function(){
  'use strict';

  function shell(){
    return document.querySelector('#view-catur .chess-shell') ||
           document.querySelector('.chess-shell');
  }

  function sync(){
    var s = shell();
    var active = !!(s && s.classList.contains('is-fullscreen'));
    document.documentElement.classList.toggle('chess-fullscreen-active', active);
    document.body.classList.toggle('chess-fullscreen-active', active);
  }

  // The normal chess UI can toggle is-fullscreen itself.
  // This observer only keeps the document state synchronized.
  var observer = new MutationObserver(sync);
  observer.observe(document.documentElement, {
    attributes:true,
    attributeFilter:['class']
  });
  observer.observe(document.body, {
    subtree:true,
    attributes:true,
    attributeFilter:['class']
  });

  sync();
})();
