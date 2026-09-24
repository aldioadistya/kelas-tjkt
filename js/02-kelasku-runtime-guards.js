(function(){
    // Jadwal: pastikan klik hari tetap terhubung setelah render ulang.
  (function(){
    document.addEventListener('click', function(event){
      const chip = event.target.closest('#day-tabs .day-chip[data-jadwal-day]');
      if(!chip) return;
      const day = chip.getAttribute('data-jadwal-day');
      if(!day || typeof window.selectDay !== 'function') return;
      event.preventDefault();
      event.stopPropagation();
      window.selectDay(day);
    }, true);
  })();

    // Laporan: reset posisi scroll modal saat dibuka.
  (function(){
    function resetReportScroll(){
      const modal = document.querySelector('#modal-report .modal');
      if(modal) { modal.scrollTop = 0; modal.scrollLeft = 0; }
    }
    const observer = new MutationObserver(function(){
      const bg = document.getElementById('modal-report');
      const modal = bg && bg.querySelector('.modal');
      if(bg && bg.classList.contains('open') && modal && !bg.dataset.reportScrollReset){
        bg.dataset.reportScrollReset = '1';
        requestAnimationFrame(resetReportScroll);
      } else if(bg && !bg.classList.contains('open')){
        delete bg.dataset.reportScrollReset;
      }
    });
    observer.observe(document.body, {subtree:true, attributes:true, attributeFilter:['class']});
  })();

    // Desktop: sinkronkan navigasi sidebar dengan tab aktif.
  (function(){
   const sync=()=>{
     const active=document.querySelector('.tab.active');
     const key=active&&active.dataset?active.dataset.tab:null;
     document.querySelectorAll('.desktop-nav-item').forEach(b=>b.classList.toggle('active',b.dataset.tab===key));
   };
   const oldGoTo=window.goTo;
   if(typeof oldGoTo==='function'){window.goTo=function(){const r=oldGoTo.apply(this,arguments);setTimeout(sync,0);return r;};}
   setTimeout(sync,500);
  })();
  })();
