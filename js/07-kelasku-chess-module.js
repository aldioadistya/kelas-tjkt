(function(){
  'use strict';
  let chessGame=null,chessMode='ai',chessSelected=null,chessFlipped=false;
  let chessRoomId=null,chessRoomUnsub=null,chessOnlineColor=null,chessOnlineMoveCount=0,chessOnlinePlayerName='Teman',chessOnlineBusy=false;
  let chessStatsCache={};
  function pieceSvg(color,type){
    const white=color==='w';
    const fill=white?'#f8fafc':'#111827';
    const stroke=white?'#0f172a':'#cbd5e1';
    const common=`fill="${fill}" stroke="${stroke}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"`;
    const head=`<svg class="chess-piece ${white?'piece-white':'piece-black'}" viewBox="0 0 64 64" aria-hidden="true">`;
    const tail='</svg>';
    const shapes={
      p:`<circle cx="32" cy="15" r="6" ${common}/><path d="M25 24h14l-2 15 7 9H20l7-9-2-15Z" ${common}/><path d="M18 52h28" ${common}/>`,
      r:`<path d="M18 12h7v7h5v-7h4v7h5v-7h7v13l-6 5 3 14H21l3-14-6-5V12Z" ${common}/><path d="M18 51h28" ${common}/>`,
      n:`<path d="M22 51h25l-4-8c-3-6-7-8-12-10 2-4 7-7 6-13-1-5-5-8-11-8l-3 8 5 3-7 8c-4 5-5 11 1 20Z" ${common}/><circle cx="36" cy="17" r="1.8" fill="${stroke}" stroke="none"/><path d="M18 51h30" ${common}/>`,
      b:`<path d="M32 10c-6 5-8 10-4 16l-5 10 6 7-8 8h22l-8-8 6-7-5-10c4-6 2-11-4-16Z" ${common}/><path d="M29 20l6 6" ${common}/><path d="M18 51h28" ${common}/>`,
      q:`<path d="M17 18l7 7 8-13 8 13 7-7-3 20H20l-3-20Z" ${common}/><path d="M21 43h22l5 8H16l5-8Z" ${common}/><circle cx="17" cy="18" r="2.5" ${common}/><circle cx="32" cy="12" r="2.5" ${common}/><circle cx="47" cy="18" r="2.5" ${common}/>`,
      k:`<path d="M28 9h8v7h6v7h-7v7l6 8-3 7H26l-3-7 6-8v-7h-7v-7h6V9Z" ${common}/><path d="M18 51h28" ${common}/><path d="M25 43h14" ${common}/>`
    };
    return head+(shapes[type]||shapes.p)+tail;
  }
  const roomRef=()=>chessRoomId?db.collection('kelasku_chess_rooms').doc(chessRoomId):null;
  const userName=()=>String((currentUser&&(currentUser.username||currentUser.displayName||currentUser.name))||'Siswa');
  function setOnlineState(text,state='idle'){
    const e=document.getElementById('chess-online-state-text');if(e)e.textContent=text;
    const dot=document.querySelector('.chess-online-dot');if(dot)dot.dataset.state=state;
  }
  function setOnlineInfo(text){const e=document.getElementById('chess-online-info');if(e)e.textContent=text;}
  function setRoomTools(show){const e=document.getElementById('chess-online-room-tools');if(e)e.style.display=show?'flex':'none';}
  function updateOnlinePlayers(d){
    const chips=document.querySelectorAll('.chess-player-chip');
    if(chips[0]){const n=chessMode==='online'?(d&&d.whiteUid===currentUser?.uid?userName():(d&&d.whiteUid?'Lawan':'Kamu')):'Kamu';const strong=chips[0].querySelector('strong');if(strong)strong.textContent=n;}
    if(chips[1]){const n=chessMode==='online'?(d&&d.blackUid===currentUser?.uid?userName():(d&&d.blackUid?'Lawan':'Menunggu teman…')):'Komputer';const strong=chips[1].querySelector('strong');if(strong)strong.textContent=n;}
  }
  async function loadChessStats(){
    if(!currentUser||typeof db==='undefined')return;
    try{const snap=await db.collection('kelasku_chess_stats').get();chessStatsCache={};snap.forEach(doc=>{const d=doc.data()||{};chessStatsCache[doc.id]={wins:Number(d.wins)||0,draws:Number(d.draws)||0,losses:Number(d.losses)||0,score:Number(d.score)||0,name:String(d.username||'Siswa')};});}
    catch(e){console.warn('Chess stats load failed',e);}
    renderChessStats();
  }
  function myChessStat(){const uid=currentUser&&currentUser.uid;return uid?(chessStatsCache[uid]||{wins:0,draws:0,losses:0,score:0,name:userName()}):{wins:0,draws:0,losses:0,score:0,name:'Saya'};}
  function renderChessStats(){
    const st=myChessStat();['wins','draws','losses','score'].forEach(k=>{const e=document.getElementById('chess-my-'+k);if(e)e.textContent=st[k]||0});
    const wrap=document.getElementById('chess-leaderboard');if(!wrap)return;
    const rows=Object.entries(chessStatsCache).map(([uid,v])=>({uid,...v})).sort((a,b)=>(b.score||0)-(a.score||0));
    if(!rows.length){wrap.innerHTML='<div class="empty">Belum ada skor pertandingan.</div>';return;}
    wrap.innerHTML=rows.slice(0,30).map((r,i)=>`<div class="chess-rank-row"><b>${i+1}</b><div><b>${escapeHtml(r.name||'Siswa')}</b><div class="chess-rank-meta">${r.wins||0} menang · ${r.draws||0} seri · ${r.losses||0} kalah</div></div><span class="chess-rank-score">${r.score||0}</span></div>`).join('');
  }
  async function addChessResult(result,roomId){
    // Skor kompetitif HANYA diberikan untuk pertandingan ONLINE.
    // Mode Komputer dan 2 Pemain tidak pernah memanggil fungsi ini.
    if(chessMode!=='online'||!currentUser||!roomId||!db)return false;
    if(!['win','draw','loss'].includes(result))return false;
    const uid=currentUser.uid,ref=db.collection('kelasku_chess_stats').doc(uid),rref=db.collection('kelasku_chess_rooms').doc(roomId);
    try{
      let claimed=false;
      await db.runTransaction(async tx=>{
        const rs=await tx.get(rref);
        if(!rs.exists)throw new Error('Room tidak ditemukan');
        const rd=rs.data()||{};
        // Hanya pemain room yang boleh menerima hasil pertandingan room tersebut.
        if(rd.whiteUid!==uid&&rd.blackUid!==uid)throw new Error('Kamu bukan pemain room ini');
        const scored=Array.isArray(rd.scoredUids)?rd.scoredUids.slice():[];
        if(scored.includes(uid)){claimed=false;return;}
        const ss=await tx.get(ref);
        const old=ss.exists?(ss.data()||{}):{};
        const st={
          wins:Number(old.wins)||0,
          draws:Number(old.draws)||0,
          losses:Number(old.losses)||0,
          score:Number(old.score)||0,
          username:String(old.username||userName())
        };
        if(result==='win'){st.wins++;st.score+=3}
        else if(result==='draw'){st.draws++;st.score+=1}
        else{st.losses++;}
        st.updatedAt=firebase.firestore.FieldValue.serverTimestamp();
        st.lastRoomId=roomId;
        scored.push(uid);
        claimed=true;
        tx.set(ref,st,{merge:true});
        tx.update(rref,{scoredUids:scored,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
        chessStatsCache[uid]=st;
      });
      await loadChessStats();
      return claimed;
    }catch(e){
      console.warn('Chess score save failed',e);
      showNotification('Skor online belum tersimpan. Periksa izin Firebase untuk kelasku_chess_stats dan kelasku_chess_rooms.','warning',5000);
      return false;
    }
  }
  let pendingChessMode=null;
  function chessGameHasProgress(){
    if(!chessGame)return false;
    if(chessMode==='online')return !!chessRoomId;
    return chessGame.fen()!==new Chess().fen();
  }
  function closeChessModeConfirm(){
    const m=document.getElementById('chess-mode-confirm');if(m){m.classList.remove('is-open');m.setAttribute('aria-hidden','true');}
    pendingChessMode=null;
  }
  function applyChessMode(mode){
    closeChessModeConfirm();
    chessMode=mode;chessSelected=null;
    document.querySelectorAll('[data-chess-mode]').forEach(b=>b.classList.toggle('active',b.dataset.chessMode===mode));
    const p=document.getElementById('chess-online-panel');if(p)p.style.display=mode==='online'?'block':'none';
    if(mode!=='online')leaveChessRoom(false);
    updateOnlinePlayers(null);newChessGame();
    if(mode==='online'){setOnlineState('Siap membuat atau bergabung ke room','idle');setOnlineInfo('Buat room lalu kirim kodenya ke teman.');}
  }
  function setChessMode(mode){
    if(mode===chessMode)return;
    if(chessGameHasProgress()){
      pendingChessMode=mode;
      const m=document.getElementById('chess-mode-confirm');
      const t=document.getElementById('chess-confirm-text');
      if(t)t.textContent=chessMode==='online'?'Pertandingan online masih berlangsung. Jika berganti mode, kamu akan keluar dari room ini dan permainan dihentikan.':'Permainan saat ini sudah dimulai. Jika berganti mode, posisi permainan akan dihapus.';
      if(m){m.classList.add('is-open');m.setAttribute('aria-hidden','false');}
      return;
    }
    applyChessMode(mode);
  }
  function confirmChessModeChange(){if(pendingChessMode)applyChessMode(pendingChessMode);else closeChessModeConfirm();}
  function bindChessModeConfirm(){
    document.querySelectorAll('[data-chess-confirm-cancel]').forEach(el=>el.addEventListener('click',closeChessModeConfirm));
    const ok=document.getElementById('chess-confirm-ok');if(ok)ok.addEventListener('click',confirmChessModeChange);
  }
  function boardSquares(){const out=[];for(let r=0;r<8;r++)for(let c=0;c<8;c++)out.push(String.fromCharCode(97+c)+(8-r));return chessFlipped?out.reverse():out}
  function renderChessBoard(){
    const b=document.getElementById('chess-board');if(!b||!chessGame)return;
    const squares=boardSquares();
    const legalMap=new Map();
    if(chessSelected){for(const m of chessGame.moves({square:chessSelected,verbose:true}))legalMap.set(m.to,!!chessGame.get(m.to));}
    const html=squares.map((sq,i)=>{const c=chessGame.get(sq),row=Math.floor(i/8),col=i%8,light=(row+col)%2===0,legal=legalMap.has(sq),capture=legalMap.get(sq)===true;return `<div class="chess-square ${light?'light':'dark'} ${chessSelected===sq?'selected':''} ${legal?'legal':''} ${capture?'capture':''}" onclick="window.__kelaskuChessClick('${sq}')">${c?pieceSvg(c.color,c.type):''}</div>`}).join('');
    if(b.innerHTML!==html)b.innerHTML=html;
    let text='Giliran '+(chessGame.turn()==='w'?'Putih':'Hitam');if(chessGame.isCheck())text+=' · Skak';
    if(chessGame.isGameOver())text=chessGame.isCheckmate()?('Skakmat · '+(chessGame.turn()==='w'?'Hitam':'Putih')+' menang'):'Permainan seri';
    const st=document.getElementById('chess-status');if(st)st.textContent=text;
  }
  function chessClick(sq){
    if(!chessGame||chessGame.isGameOver()||chessOnlineBusy)return;
    if(chessMode==='online'&&(!chessRoomId||chessOnlineColor!==chessGame.turn()))return;
    const piece=chessGame.get(sq);
    if(chessSelected){
      const legal=chessGame.moves({square:chessSelected,verbose:true}).find(m=>m.to===sq);
      if(legal){
        const move=chessGame.move({from:chessSelected,to:sq,promotion:'q'});chessSelected=null;afterChessMove(move);return;
      }
      chessSelected=null;
    }
    if(piece&&piece.color===chessGame.turn()&&(chessMode!=='online'||piece.color===chessOnlineColor))chessSelected=sq;
    renderChessBoard();
  }
  async function afterChessMove(move){
    renderChessBoard();
    if(chessMode==='online'){await publishChessMove(move);return;}
    if(chessGame.isGameOver())return finishChessGame();
    if(chessMode==='ai'&&chessGame.turn()==='b')setTimeout(chessAiMove,260);
  }
  function chessAiMove(){if(!chessGame||chessMode!=='ai'||chessGame.isGameOver()||chessGame.turn()!=='b')return;const moves=chessGame.moves({verbose:true});if(!moves.length)return;const captures=moves.filter(m=>m.captured),pool=captures.length?captures:moves,move=pool[Math.floor(Math.random()*pool.length)];chessGame.move({from:move.from,to:move.to,promotion:move.promotion||'q'});renderChessBoard();if(chessGame.isGameOver())finishChessGame();}
  async function finishChessGame(){
    renderChessBoard();
    if(chessMode!=='online'||!chessRoomId)return;
    const winner=chessGame.isCheckmate()?(chessGame.turn()==='w'?'b':'w'):null;
    const result=winner?((winner===chessOnlineColor)?'win':'loss'):'draw';
    await finalizeOnlineRoom(result,winner);
  }
  function newChessGame(){chessGame=new Chess();chessSelected=null;chessOnlineMoveCount=0;renderChessBoard();if(chessMode==='online'){setOnlineState(chessRoomId?'Menunggu sinkronisasi room':'Belum terhubung ke room','idle');}}
  function flipChessBoard(){chessFlipped=!chessFlipped;renderChessBoard();}
  function makeRoomCode(){return Math.random().toString(36).slice(2,7).toUpperCase();}
  async function createChessRoom(){
    if(!currentUser||!db){showNotification('Kamu harus login untuk bermain online.','warning');return;}
    leaveChessRoom(false);const code=makeRoomCode();chessRoomId=code;chessOnlineColor='w';chessOnlineBusy=true;
    const now=Date.now(),initial=new Chess().fen();
    try{
      await db.collection('kelasku_chess_rooms').doc(code).set({roomId:code,whiteUid:currentUser.uid,blackUid:null,status:'waiting',fen:initial,turn:'w',moveNumber:0,lastMove:null,resultType:null,winnerUid:null,createdAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp(),expiresAt:firebase.firestore.Timestamp.fromMillis(Date.now()+86400000),cleanupAt:firebase.firestore.Timestamp.fromMillis(Date.now()+86400000),scoredUids:[]});
      const input=document.getElementById('chess-room-code');if(input)input.value=code;setRoomTools(true);setOnlineState('Menunggu teman…','waiting');setOnlineInfo('Room '+code+' dibuat. Kirim kode ini ke teman.');listenChessRoom();newChessGame();
    }catch(e){chessRoomId=null;chessOnlineColor=null;setRoomTools(false);showNotification('Gagal membuat room: '+(e.message||e),'error');}
    finally{chessOnlineBusy=false;}
  }
  async function joinChessRoom(){
    if(!currentUser||!db){showNotification('Kamu harus login untuk bermain online.','warning');return;}
    const input=document.getElementById('chess-room-code'),code=(input&&input.value||'').trim().toUpperCase();
    if(!/^[A-Z0-9]{5,8}$/.test(code)){showNotification('Kode room harus 5–8 karakter.','warning');return;}
    chessOnlineBusy=true;
    try{
      const ref=db.collection('kelasku_chess_rooms').doc(code);
      await db.runTransaction(async tx=>{
        const snap=await tx.get(ref);if(!snap.exists)throw new Error('Room tidak ditemukan');
        const d=snap.data()||{};if(d.expiresAt&&(d.expiresAt && d.expiresAt.toMillis ? Date.now()>d.expiresAt.toMillis() : Date.now()>Number(d.expiresAt)))throw new Error('Room sudah kedaluwarsa');
        if(d.status==='finished')throw new Error('Pertandingan sudah selesai');
        if(d.whiteUid===currentUser.uid){chessOnlineColor='w';return;}
        if(d.blackUid===currentUser.uid){chessOnlineColor='b';return;}
        if(d.blackUid)throw new Error('Room sudah penuh');
        chessOnlineColor='b';tx.update(ref,{blackUid:currentUser.uid,status:'playing',updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
      });
      chessRoomId=code;setRoomTools(true);setOnlineState('Terhubung · menunggu giliran','connected');setOnlineInfo('Room '+code+' aktif. Kamu bermain sebagai '+(chessOnlineColor==='w'?'Putih':'Hitam')+'.');listenChessRoom();
    }catch(e){showNotification(e.message||'Gagal bergabung ke room.','error');}
    finally{chessOnlineBusy=false;}
  }
  function listenChessRoom(){
    if(!chessRoomId)return;if(chessRoomUnsub)chessRoomUnsub();
    chessRoomUnsub=roomRef().onSnapshot(async s=>{
      if(!s.exists){setOnlineState('Room tidak ditemukan','error');setOnlineInfo('Room mungkin sudah dibersihkan.');leaveChessRoom(false);return;}
      const d=s.data()||{};
      if(d.expiresAt&&(d.expiresAt && d.expiresAt.toMillis ? Date.now()>d.expiresAt.toMillis() : Date.now()>Number(d.expiresAt))&&d.status!=='finished'){
        setOnlineState('Room kedaluwarsa','error');setOnlineInfo('Room ini sudah tidak aktif.');return;
      }
      updateOnlinePlayers(d);
      if(d.fen&&(!chessGame||chessGame.fen()!==d.fen)){chessGame=new Chess(d.fen);chessSelected=null;renderChessBoard();}
      chessOnlineMoveCount=Number(d.moveNumber)||0;
      const input=document.getElementById('chess-room-code');if(input)input.value=chessRoomId;
      setRoomTools(true);
      if(d.status==='waiting'){
        setOnlineState('Menunggu teman…','waiting');setOnlineInfo('Kirim kode '+chessRoomId+' ke teman.');
      }else if(d.status==='playing'){
        const myTurn=d.turn===chessOnlineColor;setOnlineState(myTurn?'Giliran kamu':'Giliran lawan',myTurn?'your-turn':'connected');setOnlineInfo('Room '+chessRoomId+' · '+(chessOnlineColor==='w'?'Putih':'Hitam')+' · langkah '+(d.moveNumber||0));
      }else if(d.status==='finished'){
        setOnlineState('Pertandingan selesai','finished');
        const resultText=(d.lastMove&&d.lastMove.resultText)||(d.resultType==='draw'?'Permainan seri':'Pertandingan telah selesai.');setOnlineInfo(resultText);
        const winner=d.winnerUid ? (d.winnerUid===d.whiteUid?'w':(d.winnerUid===d.blackUid?'b':null)) : ((d.lastMove&&d.lastMove.winner)||null);
        if(currentUser&&winner){
          const mine=winner===chessOnlineColor?'win':'loss';
          await addChessResult(mine,chessRoomId);
          setOnlineInfo(mine==='win'?'Kamu menang! +3 skor': 'Kamu kalah. +0 skor');
        }else if(currentUser){
          await addChessResult('draw',chessRoomId);setOnlineInfo('Seri. +1 skor');
        }
      }
    },e=>{console.error(e);setOnlineState('Koneksi Firebase bermasalah','error');setOnlineInfo('Periksa koneksi internet dan Firestore Rules.');});
  }
  async function publishChessMove(move){
    if(!chessRoomId||!currentUser||chessOnlineBusy)return;
    chessOnlineBusy=true;const ref=roomRef();const localFen=chessGame.fen(),nextTurn=chessGame.turn(),expected=chessOnlineMoveCount;
    try{
      await db.runTransaction(async tx=>{
        const snap=await tx.get(ref);if(!snap.exists)throw new Error('Room tidak ditemukan');const d=snap.data()||{};
        if(d.status!=='playing')throw new Error('Pertandingan belum aktif atau sudah selesai');
        if(d.whiteUid!==currentUser.uid&&d.blackUid!==currentUser.uid)throw new Error('Kamu bukan pemain room ini');
        if(d.turn!==chessOnlineColor)throw new Error('Bukan giliran kamu');
        if(Number(d.moveNumber||0)!==expected)throw new Error('Posisi permainan berubah. Sinkronisasi ulang…');
        tx.update(ref,{fen:localFen,turn:nextTurn,lastMove:{from:move.from,to:move.to,san:move.san||'',by:currentUser.uid,at:Date.now()},moveNumber:expected+1,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
      });
      chessOnlineMoveCount=expected+1;
      if(chessGame.isGameOver())await finalizeOnlineRoom(null,chessGame.isCheckmate()?(chessGame.turn()==='w'?'b':'w'):null);
    }catch(e){showNotification(e.message||'Gerakan belum tersinkron.','error');}
    finally{chessOnlineBusy=false;}
  }
  async function finalizeOnlineRoom(resultForMe,winnerColor){
    if(!chessRoomId||!currentUser||!db)return;
    const ref=roomRef();
    try{
      await db.runTransaction(async tx=>{
        const snap=await tx.get(ref);if(!snap.exists)return;const d=snap.data()||{};
        if(d.status==='finished')return;
        if(d.whiteUid!==currentUser.uid&&d.blackUid!==currentUser.uid)return;
        const resultText=winnerColor?(winnerColor==='w'?'Putih menang':'Hitam menang'):'Permainan seri';
        tx.update(ref,{status:'finished',resultType:winnerColor?'checkmate':'draw',winnerUid:winnerColor?(winnerColor==='w'?d.whiteUid:d.blackUid):null,lastMove:{...(d.lastMove||{}),resultText,winner:winnerColor||null},updatedAt:firebase.firestore.FieldValue.serverTimestamp(),cleanupAt:firebase.firestore.Timestamp.fromMillis(Date.now()+3600000)});
      });
      const claimed=await addChessResult(resultForMe||'draw',chessRoomId);
      setOnlineState('Pertandingan selesai','finished');setOnlineInfo(resultForMe==='win'?'Kamu menang! +3 skor':resultForMe==='loss'?'Kamu kalah. +0 skor':'Seri. +1 skor');
      if(claimed)renderChessStats();
    }catch(e){console.warn('Finalize room failed',e);}
  }
  async function copyChessRoomCode(){
    const input=document.getElementById('chess-room-code');if(!input||!input.value)return;
    try{await navigator.clipboard.writeText(input.value);showNotification('Kode room disalin.','success');}
    catch(e){input.select();showNotification('Kode room: '+input.value,'info',4000);}
  }
  function leaveChessRoom(manual){
    if(chessRoomUnsub){chessRoomUnsub();chessRoomUnsub=null;}
    chessRoomId=null;chessOnlineColor=null;chessOnlineMoveCount=0;chessOnlineBusy=false;setRoomTools(false);
    if(manual){setOnlineState('Keluar dari room','idle');setOnlineInfo('Kamu bisa membuat atau bergabung ke room baru.');newChessGame();}
  }
  function toggleChessFullscreen(){
    const shell=document.querySelector('#view-catur .chess-shell');
    if(!shell)return;

    const entering=!shell.classList.contains('is-fullscreen');

    if(entering){
      shell.classList.remove('is-minimized');
      shell.classList.add('is-fullscreen');
      document.documentElement.classList.add('chess-fullscreen-active');
      document.body.classList.add('chess-fullscreen-active');
    }else{
      shell.classList.remove('is-fullscreen');
      document.documentElement.classList.remove('chess-fullscreen-active');
      document.body.classList.remove('chess-fullscreen-active');
    }

    updateChessFullscreenButton();
    requestAnimationFrame(function(){
      window.dispatchEvent(new Event('resize'));
    });
  }
  function updateChessFullscreenButton(){
    const shell=document.querySelector('#view-catur .chess-shell');
    const b=document.getElementById('chess-fullscreen-btn');
    if(!b)return;
    const on=document.fullscreenElement===shell||shell?.classList.contains('is-fullscreen');
    b.title=on?'Keluar dari layar penuh':'Layar penuh';
    b.innerHTML=on?'⛶ <span>Keluar penuh</span>':'⛶ <span>Layar penuh</span>';
  }
  document.addEventListener('fullscreenchange',updateChessFullscreenButton);
  window.toggleChessFullscreen=toggleChessFullscreen;window.__kelaskuChessClick=chessClick;window.setChessMode=setChessMode;window.newChessGame=newChessGame;window.flipChessBoard=flipChessBoard;window.createChessRoom=createChessRoom;window.joinChessRoom=joinChessRoom;window.copyChessRoomCode=copyChessRoomCode;window.leaveChessRoom=leaveChessRoom;window.renderChessStats=renderChessStats;window.__kelaskuChessInit=()=>{bindChessModeConfirm();loadChessStats();newChessGame();};
})();
