(function(){
  'use strict';
  var scoreParent=null, scoreNext=null, leaderboardParent=null, leaderboardNext=null;

  function getEls(){
    return {
      modal:document.getElementById('chess-score-modal'),
      body:document.getElementById('chess-score-modal-body'),
      side:document.querySelector('#view-catur .chess-side'),
      score:document.querySelector('#view-catur .chess-score-card'),
      leaderboard:document.querySelector('#view-catur .chess-leaderboard-card')
    };
  }

  window.toggleChessScorePanel=function(force){
    var e=getEls();
    if(!e.modal || !e.body) return;
    var open=(force===undefined) ? !e.modal.classList.contains('is-open') : !!force;

    if(open){
      if(!e.score || !e.leaderboard) return;
      if(!scoreParent) scoreParent=e.score.parentNode;
      if(!leaderboardParent) leaderboardParent=e.leaderboard.parentNode;
      if(!scoreNext) scoreNext=e.score.nextSibling;
      if(!leaderboardNext) leaderboardNext=e.leaderboard.nextSibling;

      e.body.appendChild(e.score);
      e.body.appendChild(e.leaderboard);
      e.modal.classList.add('is-open');
      e.modal.setAttribute('aria-hidden','false');
      document.body.classList.add('chess-score-open');
      var close=e.modal.querySelector('.chess-score-close');
      if(close) close.focus();
    }else{
      e.modal.classList.remove('is-open');
      e.modal.setAttribute('aria-hidden','true');
      document.body.classList.remove('chess-score-open');

      if(e.score && scoreParent){
        if(scoreNext && scoreNext.parentNode===scoreParent) scoreParent.insertBefore(e.score,scoreNext);
        else scoreParent.appendChild(e.score);
      }
      if(e.leaderboard && leaderboardParent){
        if(leaderboardNext && leaderboardNext.parentNode===leaderboardParent) leaderboardParent.insertBefore(e.leaderboard,leaderboardNext);
        else leaderboardParent.appendChild(e.leaderboard);
      }
    }
  };

  document.addEventListener('keydown',function(ev){
    if(ev.key==='Escape'){
      var modal=document.getElementById('chess-score-modal');
      if(modal && modal.classList.contains('is-open')) window.toggleChessScorePanel(false);
    }
  });
})();
