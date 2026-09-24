(function(g){
  'use strict';
  const FILES='abcdefgh';
  const sqToI=s=>FILES.indexOf(s[0])+8*(+s[1]-1);
  const iToSq=i=>FILES[i%8]+(Math.floor(i/8)+1);
  const cloneBoard=b=>b.slice();
  class LocalChess{
    constructor(fen){this.load(fen||'start');}
    load(fen){
      this.board=new Array(64).fill(null);this.turnColor='w';this.castle='KQkq';this.ep=-1;this.halfmove=0;this.fullmove=1;
      if(fen==='start')fen='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const p=fen.trim().split(/\s+/), rows=p[0].split('/');
      for(let r=0;r<8;r++){let file=0;for(const ch of rows[r]){if(/[1-8]/.test(ch))file+=+ch;else{this.board[(7-r)*8+file]={type:ch.toLowerCase(),color:ch===ch.toUpperCase()?'w':'b'};file++;}}}
      this.turnColor=p[1]||'w';this.castle=p[2]&&p[2]!=='-'?p[2]:'';this.ep=p[3]&&p[3]!=='-'?sqToI(p[3]):-1;this.halfmove=+(p[4]||0);this.fullmove=+(p[5]||1);return true;
    }
    turn(){return this.turnColor;}
    get(s){const p=this.board[sqToI(s)];return p?{type:p.type,color:p.color}:null;}
    fen(){let rows=[];for(let r=7;r>=0;r--){let row='',empty=0;for(let f=0;f<8;f++){const p=this.board[r*8+f];if(!p){empty++;continue;}if(empty){row+=empty;empty=0;}row+=p.color==='w'?p.type.toUpperCase():p.type;}if(empty)row+=empty;rows.push(row);}return rows.join('/')+' '+this.turnColor+' '+(this.castle||'-')+' '+(this.ep>=0?iToSq(this.ep):'-')+' '+this.halfmove+' '+this.fullmove;}
    isSquareAttacked(i,by){const b=this.board,r=Math.floor(i/8),f=i%8;
      const pawn=by==='w'?'p':'p',pr=by==='w'?r-1:r+1; if(pr>=0&&pr<8){for(const df of [-1,1]){const ff=f+df;if(ff>=0&&ff<8){const p=b[pr*8+ff];if(p&&p.color===by&&p.type===pawn)return true;}}}
      const knights=[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];for(const [df,dr] of knights){const ff=f+df,rr=r+dr;if(ff>=0&&ff<8&&rr>=0&&rr<8){const p=b[rr*8+ff];if(p&&p.color===by&&p.type==='n')return true;}}
      const lines=(dirs,types)=>{for(const [df,dr] of dirs){let ff=f+df,rr=r+dr;while(ff>=0&&ff<8&&rr>=0&&rr<8){const p=b[rr*8+ff];if(p){if(p.color===by&&types.includes(p.type))return true;break;}ff+=df;rr+=dr;}}return false;};
      if(lines([[1,0],[-1,0],[0,1],[0,-1]],['r','q']))return true;
      if(lines([[1,1],[1,-1],[-1,1],[-1,-1]],['b','q']))return true;
      for(let df=-1;df<=1;df++)for(let dr=-1;dr<=1;dr++){if(!df&&!dr)continue;const ff=f+df,rr=r+dr;if(ff>=0&&ff<8&&rr>=0&&rr<8){const p=b[rr*8+ff];if(p&&p.color===by&&p.type==='k')return true;}}
      return false;
    }
    kingIndex(color){for(let i=0;i<64;i++){const p=this.board[i];if(p&&p.color===color&&p.type==='k')return i;}return -1;}
    isCheck(color=this.turnColor){const k=this.kingIndex(color);return k>=0&&this.isSquareAttacked(k,color==='w'?'b':'w');}
    pseudoMoves(color=this.turnColor,fromOnly=null){const out=[],b=this.board, push=(from,to,extra={})=>{const p=b[from],c=b[to];if(c&&c.color===color)return;out.push({from,to,color,piece:p.type,captured:c?c.type:null,...extra});};
      const addRay=(i,dirs)=>{const r=Math.floor(i/8),f=i%8,p=b[i];for(const [df,dr] of dirs){let ff=f+df,rr=r+dr;while(ff>=0&&ff<8&&rr>=0&&rr<8){const to=rr*8+ff;if(!b[to])push(i,to);else{if(b[to].color!==color)push(i,to);break;}ff+=df;rr+=dr;}}};
      for(let i=0;i<64;i++){const p=b[i];if(!p||p.color!==color||(fromOnly!==null&&i!==fromOnly))continue;const r=Math.floor(i/8),f=i%8;
        if(p.type==='p'){const dir=color==='w'?1:-1,start=color==='w'?1:6,prom=color==='w'?7:0,one=r+dir;if(one>=0&&one<8&&!b[one*8+f]){const to=one*8+f;if(one===prom)for(const pr of ['q','r','b','n'])push(i,to,{promotion:pr});else push(i,to);if(r===start&&!b[(r+2*dir)*8+f])push(i,(r+2*dir)*8+f,{double:true});}for(const df of [-1,1]){const ff=f+df;if(ff<0||ff>7||one<0||one>7)continue;const to=one*8+ff;if(b[to]&&b[to].color!==color){if(one===prom)for(const pr of ['q','r','b','n'])push(i,to,{promotion:pr});else push(i,to);}else if(to===this.ep)push(i,to,{enPassant:true,captured:'p'});}}
        else if(p.type==='n'){for(const [df,dr] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]){const ff=f+df,rr=r+dr;if(ff>=0&&ff<8&&rr>=0&&rr<8)push(i,rr*8+ff);}}
        else if(p.type==='b')addRay(i,[[1,1],[1,-1],[-1,1],[-1,-1]]);
        else if(p.type==='r')addRay(i,[[1,0],[-1,0],[0,1],[0,-1]]);
        else if(p.type==='q')addRay(i,[[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]]);
        else if(p.type==='k'){
          for(let df=-1;df<=1;df++)for(let dr=-1;dr<=1;dr++){if(!df&&!dr)continue;const ff=f+df,rr=r+dr;if(ff>=0&&ff<8&&rr>=0&&rr<8)push(i,rr*8+ff);}
          if(color==='w'&&i===4&&!this.isCheck('w')){if(this.castle.includes('K')&&b[7]&&b[7].color==='w'&&b[7].type==='r'&&!b[5]&&!b[6]&&!this.isSquareAttacked(5,'b')&&!this.isSquareAttacked(6,'b'))push(i,6,{castle:'K'});if(this.castle.includes('Q')&&b[0]&&b[0].color==='w'&&b[0].type==='r'&&!b[1]&&!b[2]&&!b[3]&&!this.isSquareAttacked(3,'b')&&!this.isSquareAttacked(2,'b'))push(i,2,{castle:'Q'});}
          if(color==='b'&&i===60&&!this.isCheck('b')){if(this.castle.includes('k')&&b[63]&&b[63].color==='b'&&b[63].type==='r'&&!b[61]&&!b[62]&&!this.isSquareAttacked(61,'w')&&!this.isSquareAttacked(62,'w'))push(i,62,{castle:'k'});if(this.castle.includes('q')&&b[56]&&b[56].color==='b'&&b[56].type==='r'&&!b[57]&&!b[58]&&!b[59]&&!this.isSquareAttacked(59,'w')&&!this.isSquareAttacked(58,'w'))push(i,58,{castle:'q'});}
        }
      }return out;
    }
    snapshot(){return {board:cloneBoard(this.board),turn:this.turnColor,castle:this.castle,ep:this.ep,half:this.halfmove,full:this.fullmove};}
    restore(s){this.board=s.board;this.turnColor=s.turn;this.castle=s.castle;this.ep=s.ep;this.halfmove=s.half;this.fullmove=s.full;}
    apply(m){const p=this.board[m.from];const captured=this.board[m.to];this.board[m.to]={type:m.promotion||p.type,color:p.color};this.board[m.from]=null;if(m.enPassant){const ci=m.to+(p.color==='w'?-8:8);this.board[ci]=null;}
      if(m.castle==='K'){this.board[5]=this.board[7];this.board[7]=null;}if(m.castle==='Q'){this.board[3]=this.board[0];this.board[0]=null;}if(m.castle==='k'){this.board[61]=this.board[63];this.board[63]=null;}if(m.castle==='q'){this.board[59]=this.board[56];this.board[56]=null;}
      let cr=this.castle; if(p.type==='k')cr=cr.replace(p.color==='w'?/[KQ]/g:/[kq]/g,'');if(p.type==='r'){if(m.from===0)cr=cr.replace('Q','');if(m.from===7)cr=cr.replace('K','');if(m.from===56)cr=cr.replace('q','');if(m.from===63)cr=cr.replace('k','');}if(captured&&captured.type==='r'){if(m.to===0)cr=cr.replace('Q','');if(m.to===7)cr=cr.replace('K','');if(m.to===56)cr=cr.replace('q','');if(m.to===63)cr=cr.replace('k','');}this.castle=cr;
      this.ep=-1;if(p.type==='p'&&Math.abs(m.to-m.from)===16)this.ep=(m.to+m.from)/2;this.halfmove=(p.type==='p'||captured||m.enPassant)?0:this.halfmove+1;if(this.turnColor==='b')this.fullmove++;this.turnColor=this.turnColor==='w'?'b':'w';
    }
    legalMoves(color=this.turnColor,fromOnly=null){const out=[];for(const m of this.pseudoMoves(color,fromOnly)){const snap=this.snapshot();this.apply(m);if(!this.isCheck(color))out.push(m);this.restore(snap);}return out;}
    moves(opts={}){const from=opts.square!=null?sqToI(opts.square):null;const ms=this.legalMoves(this.turnColor,from);if(opts.verbose)return ms.map(m=>({...m,from:iToSq(m.from),to:iToSq(m.to),san:this.san(m)}));return ms.map(m=>iToSq(m.to));}
    san(m){let s='';const p=this.board[m.from];if(m.castle)return m.castle.toUpperCase()==='K'?'O-O':'O-O-O';if(p.type!=='p')s+=p.type.toUpperCase();if(m.captured||m.enPassant){if(p.type==='p')s+=FILES[m.from%8];s+='x';}s+=iToSq(m.to);if(m.promotion)s+='='+m.promotion.toUpperCase();const snap=this.snapshot();this.apply(m);if(this.isCheck(this.turnColor)){s+=this.legalMoves(this.turnColor).length?'+' : '#';}this.restore(snap);return s;}
    move(input){let m;if(typeof input==='string'){m=this.moves({verbose:true}).find(x=>x.san===input||x.to===input);}else{const from=sqToI(input.from),to=sqToI(input.to),pr=input.promotion||null;m=this.legalMoves(this.turnColor,from).find(x=>x.to===to&&(!x.promotion||x.promotion===pr));}if(!m)return null;const move={...m,from:iToSq(m.from),to:iToSq(m.to),san:this.san(m)};this.apply(m);return move;}
    isCheckmate(){return this.isCheck(this.turnColor)&&this.legalMoves(this.turnColor).length===0;}
    isStalemate(){return !this.isCheck(this.turnColor)&&this.legalMoves(this.turnColor).length===0;}
    isThreefoldRepetition(){return false;}
    insufficient(){const pieces=this.board.filter(Boolean);if(pieces.some(p=>['p','r','q'].includes(p.type)))return false;const minors=pieces.filter(p=>['b','n'].includes(p.type));if(minors.length<=1)return true;if(minors.every(p=>p.type==='b')){const colors=[];for(let i=0;i<64;i++){const p=this.board[i];if(p&&p.type==='b')colors.push((Math.floor(i/8)+i%8)%2);}return colors.every(x=>x===colors[0]);}return false;}
    isGameOver(){return this.isCheckmate()||this.isStalemate()||this.halfmove>=100||this.insufficient();}
  }
  g.Chess=LocalChess;
})(window);
