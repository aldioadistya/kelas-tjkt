(function(){
    const esc = v => (typeof escapeHtml==='function' ? escapeHtml(v) : String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])));
    const icon = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"></path></svg>`;
    const money = v => typeof rupiah==='function' ? rupiah(v) : 'Rp'+Number(v||0).toLocaleString('id-ID');

    function ensureKasEnhancements(){
      const v=document.getElementById('view-kas'); if(!v || v.dataset.proReady) return;
      const oldBalance=v.querySelector('.balance-card');
      const metrics=document.createElement('div'); metrics.className='kas-pro-metrics'; metrics.id='kas-pro-metrics';
      metrics.innerHTML=`<div class="kas-pro-metric kpm-in"><div class="kpm-top"><div class="kpm-label">Total Kas Masuk</div><div class="kpm-icon">${icon('M12 5v14M7 10l5-5 5 5')}</div></div><div class="kpm-value" id="kas-pro-in">Rp 0</div><div class="kpm-note">Pemasukan tercatat</div></div><div class="kas-pro-metric kpm-out"><div class="kpm-top"><div class="kpm-label">Total Pengeluaran</div><div class="kpm-icon">${icon('M12 19V5M7 14l5 5 5-5')}</div></div><div class="kpm-value" id="kas-pro-out">Rp 0</div><div class="kpm-note">Pengeluaran tercatat</div></div><div class="kas-pro-metric kpm-bal"><div class="kpm-top"><div class="kpm-label">Sisa Saldo</div><div class="kpm-icon">${icon('M4 7h16v10H4zM7 11h4')}</div></div><div class="kpm-value" id="kas-pro-bal">Rp 0</div><div class="kpm-note">Saldo berjalan</div></div>`;
      if(oldBalance) oldBalance.replaceWith(metrics); else v.insertBefore(metrics,v.firstChild.nextSibling);
      const txSection=[...v.querySelectorAll('.section')].find(x=>x.querySelector('#kas-list'));
      if(txSection && !document.getElementById('kas-pro-toolbar')){
        const head=txSection.querySelector('.section-head');
        if(head){
          const toolbar=document.createElement('div'); toolbar.className='kas-pro-toolbar'; toolbar.id='kas-pro-toolbar';
          toolbar.innerHTML=`<div class="kas-pro-filters"><input id="kas-pro-search" type="search" placeholder="Cari transaksi..." oninput="renderKas()"><select id="kas-pro-filter"><option value="all">Semua jenis</option><option value="masuk">Pemasukan</option><option value="keluar">Pengeluaran</option></select><select id="kas-pro-period"><option value="all">Semua waktu</option><option value="week">Minggu ini</option><option value="month">Bulan ini</option></select></div>`;
          head.insertAdjacentElement('afterend',toolbar);
        }
      }
      v.dataset.proReady='1';
    }

    function parseKasDate(dateStr){
      if(!dateStr) return null;
      const raw=String(dateStr).trim();
      let d=null;
      if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) d=new Date(raw+'T00:00:00');
      else {
        const m=raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
        if(m) d=new Date(Number(m[3]),Number(m[2])-1,Number(m[1]));
        else d=new Date(raw);
      }
      return d && !Number.isNaN(d.getTime()) ? d : null;
    }
    function kasDateOk(dateStr, period){
      if(period==='all' || !dateStr) return true;
      const d=parseKasDate(dateStr); if(!d) return true;
      const now=new Date();
      if(period==='month') return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth();
      const day=(now.getDay()+6)%7; const monday=new Date(now); monday.setHours(0,0,0,0); monday.setDate(now.getDate()-day); const sunday=new Date(monday); sunday.setDate(monday.getDate()+7); return d>=monday && d<sunday;
    }

    function professionalRenderKas(){
      ensureKasEnhancements();
      const data=Array.isArray(state.kas)?state.kas:[];
      const masuk=data.filter(t=>t.jenis==='masuk').reduce((a,t)=>a+Number(t.jumlah||0),0);
      const keluar=data.filter(t=>t.jenis==='keluar').reduce((a,t)=>a+Number(t.jumlah||0),0);
      const set=(id,val)=>{const e=document.getElementById(id);if(e)e.textContent=money(val)};
      set('kas-pro-in',masuk); set('kas-pro-out',keluar); set('kas-pro-bal',masuk-keluar);
      const q=(document.getElementById('kas-pro-search')?.value||'').trim().toLowerCase(); const filter=document.getElementById('kas-pro-filter')?.value||'all'; const period=document.getElementById('kas-pro-period')?.value||'all';
      let list=data.filter(t=>(filter==='all'||t.jenis===filter)&&kasDateOk(t.tanggal,period)&&(!q||[t.ket,t.tanggal,t.jenis,t.jumlah].join(' ').toLowerCase().includes(q))).slice().sort((a,b)=>(parseKasDate(b.tanggal)?.getTime()||0)-(parseKasDate(a.tanggal)?.getTime()||0));
      const wrap=document.getElementById('kas-list'); if(!wrap)return;
      wrap.className='kas-pro-table';
      wrap.innerHTML=list.length?`<table><thead><tr><th>Tanggal</th><th>Keterangan</th><th>Jenis</th><th>Jumlah</th><th></th></tr></thead><tbody>${list.map(t=>`<tr ${isAdmin()?`onclick=\"openKasEditModal(${Number(t.id)})\"`:''} style="${isAdmin()?'cursor:pointer':''}"><td>${esc(t.tanggal||'-')}</td><td><strong>${esc(t.ket||'Tanpa keterangan')}</strong>${t.file?`<div style="font-size:9px;color:var(--ui-muted);margin-top:3px">Lampiran: ${esc(t.file)}</div>`:''}</td><td><span class="kas-type-badge ${t.jenis==='masuk'?'kas-type-in':'kas-type-out'}">${t.jenis==='masuk'?'Pemasukan':'Pengeluaran'}</span></td><td class="${t.jenis==='masuk'?'kas-amt-in':'kas-amt-out'}">${t.jenis==='masuk'?'+':'-'}${money(t.jumlah)}</td><td class="kas-pro-action"><button type="button" class="kas-edit-btn admin-only" onclick="event.stopPropagation();openKasEditModal(${Number(t.id)})" aria-label="Edit transaksi">Edit</button></td></tr>`).join('')}</tbody></table>`:`<div class="empty" style="padding:36px 18px;text-align:center"><div style="font-weight:800;margin-bottom:4px">Belum ada transaksi</div><div style="font-size:11px;color:var(--ui-muted)">Catat pemasukan atau pengeluaran pertama untuk memulai rekap kas.</div></div>`;
      const oldIn=document.getElementById('kas-in'), oldOut=document.getElementById('kas-out'), oldSaldo=document.getElementById('kas-saldo'); if(oldIn)oldIn.textContent=money(masuk); if(oldOut)oldOut.textContent=money(keluar); if(oldSaldo)oldSaldo.textContent=money(masuk-keluar);
      if(typeof window.syncKasHistoryState==='function') window.syncKasHistoryState();
    }

    let hpSummaryFilter = 'all';
    function setHpSummaryFilter(filter){
      hpSummaryFilter = hpSummaryFilter === filter ? 'all' : filter;
      professionalRenderHp();
      const target = hpSummaryFilter === 'collected' ? document.querySelector('#view-hp .hp-status-section.is-collected') : hpSummaryFilter === 'remaining' ? document.querySelector('#view-hp .hp-status-section.is-remaining') : null;
      if(target) target.scrollIntoView({behavior:'smooth', block:'start'});
    }
    // Dipanggil dari onclick pada HTML, jadi harus tersedia di window.
    window.setHpSummaryFilter = setHpSummaryFilter;

    function professionalRenderHp(){
      const date=state.hpSelectedDate||todayKey();
      const rec=ensureRecord(state.hp,date);
      const names=Array.isArray(state.students)?state.students:[];
      const collectedNames=names.filter(n=>rosterIsSudah(rec[n]));
      const remainingNames=names.filter(n=>!rosterIsSudah(rec[n]));
      const collected=collectedNames.length;
      const remaining=remainingNames.length;
      const pe=document.getElementById('hp-collected'), re=document.getElementById('hp-remaining');
      if(pe)pe.textContent=collected; if(re)re.textContent=remaining;
      const sumCollected=document.getElementById('hp-summary-collected'), sumRemaining=document.getElementById('hp-summary-remaining');
      if(sumCollected){sumCollected.setAttribute('aria-pressed',hpSummaryFilter==='collected'?'true':'false');sumCollected.classList.toggle('is-active',hpSummaryFilter==='collected');}
      if(sumRemaining){sumRemaining.setAttribute('aria-pressed',hpSummaryFilter==='remaining'?'true':'false');sumRemaining.classList.toggle('is-active',hpSummaryFilter==='remaining');}

      const list=document.getElementById('hp-list'); if(!list)return;
      const query=(rosterUI.hp.search||'').trim().toLowerCase();
      const matches=n=>!query||String(n).toLowerCase().includes(query);
      const shownCollected=collectedNames.filter(matches);
      const shownRemaining=remainingNames.filter(matches);

      const renderPerson=(n,isDone,index)=>{
        const st=rosterStatusOf(rec[n]);
        const safeName=JSON.stringify(String(n)).replace(/"/g,'&quot;');
        const initials=esc(String(n).split(/\s+/).map(x=>x[0]||'').slice(0,2).join('').toUpperCase());
        if(isDone){
          return `<div class="hp-slot hp-status-card hp-collected-card">
            <div class="hp-slot-head"><span>${index+1}</span><span>Sudah dikumpulkan</span></div>
            <div class="hp-person-row"><div class="hp-avatar">${initials}</div><div class="hp-person-main"><button type="button" class="hp-slot-name hp-slot-name-button" ${isAdmin()?`onclick="event.stopPropagation();openHpEditModal(${safeName})"`:''} title="${isAdmin()?'Klik untuk mengedit nama':''}">${esc(n)}</button><div class="hp-slot-time">${st?.waktu?esc(st.waktu):'Hari ini'}</div></div></div>
            <div class="hp-card-footer"><span class="hp-slot-status done">Sudah Titip</span>${isAdmin()?`<label class="hp-done-check"><input type="checkbox" checked onchange="toggleRosterStudent('hp',${safeName},this.checked)"> selesai</label>`:''}</div>
          </div>`;
        }
        return `<div class="hp-slot hp-status-card hp-remaining-card">
          <div class="hp-slot-head"><span>${index+1}</span><span>Belum dikumpulkan</span></div>
          <div class="hp-person-row"><div class="hp-avatar hp-avatar-muted">${initials}</div><div class="hp-person-main"><div class="hp-slot-name">${esc(n)}</div><div class="hp-slot-time">Belum dititipkan</div></div></div>
          <div class="hp-card-footer"><span class="hp-slot-status todo">Belum Titip</span>${isAdmin()?`<button class="hp-empty-add" type="button" onclick="openRosterStatusModal('hp',${safeName})">+ Titip</button>`:''}</div>
        </div>`;
      };

      const sectionHtml=(title,count,items,done)=>{
        const empty=done?'Belum ada siswa yang mengumpulkan HP.':'Semua siswa sudah mengumpulkan HP.';
        const activeFilter=done ? hpSummaryFilter==='collected' : hpSummaryFilter==='remaining';
        const hidden=hpSummaryFilter!=='all' && !activeFilter ? ' is-filtered-out' : '';
        return `<section class="hp-status-section ${done?'is-collected':'is-remaining'}${hidden}">
          <div class="hp-status-section-head"><div><div class="hp-status-section-title">${title}</div><div class="hp-status-section-sub">${done?'Siswa yang sudah menitipkan HP':'Siswa yang belum menitipkan HP'}</div></div><span class="hp-status-count">${count}</span></div>
          <div class="hp-status-grid">${items.length?items.map((n,i)=>renderPerson(n,done,i)).join(''):`<div class="hp-status-empty">${empty}</div>`}</div>
        </section>`;
      };

      list.className='hp-status-board';
      list.innerHTML=sectionHtml('Sudah Kumpul',collected,shownCollected,true)+sectionHtml('Belum Kumpul',remaining,shownRemaining,false);

      const section=document.getElementById('hp-list')?.closest('.section');
      if(section && !document.getElementById('hp-pro-summary')){
        const s=document.createElement('div'); s.id='hp-pro-summary'; s.className='hp-pro-summary';
        s.innerHTML='<div class="hp-progress-wrap"><div class="hp-progress-meta"><span id="hp-pro-progress-text">0/0 HP Terkumpul</span><span id="hp-pro-progress-pct">0%</span></div><div class="hp-progress"><span id="hp-pro-progress-bar" style="width:0%"></span></div></div><div style="font-size:10px;color:var(--ui-muted)">Maksimal 36 slot</div>';
        const sb=section.querySelector('.search-box'); if(sb)sb.before(s); else section.prepend(s);
      }
      const pct=names.length?Math.round(collected/names.length*100):0;
      const pt=document.getElementById('hp-pro-progress-text'),pp=document.getElementById('hp-pro-progress-pct'),pb=document.getElementById('hp-pro-progress-bar');
      if(pt)pt.textContent=`${collected}/${names.length} HP Terkumpul`; if(pp)pp.textContent=pct+'%'; if(pb)pb.style.width=pct+'%';
    }

    function professionalRenderJadwalList(){
      const wrap=document.getElementById('jadwal-list'); if(!wrap)return; const items=Array.isArray(state.jadwal?.[state.selectedDay])?state.jadwal[state.selectedDay].slice().sort((a,b)=>String(a.jam).localeCompare(String(b.jam))):[]; const readOnly=isReadOnly(); wrap.innerHTML=items.length?`<div class="timeline">${items.map(j=>`<div class="timeline-item" ${readOnly?'':'onclick="openJadwalModal('+Number(j.id)+')"'} style="${readOnly?'':'cursor:pointer'}"><div class="timeline-time">${esc(j.jam||'-')}</div><div class="timeline-card"><div style="font-size:13px;font-weight:800">${esc(j.mapel||'-')}</div><div class="timeline-sub">${esc(j.guru||'Tanpa keterangan')}</div></div></div>`).join('')}</div>`:'<div class="empty" style="padding:35px">Tidak ada jadwal pelajaran untuk hari ini.</div>';
    }

    function professionalRenderPiket(){
      renderPiketWeeklyRotation();
      const date=state.piketSelectedDate||todayKey(), day=dayNameOf(date), assigned=Array.isArray(state.piketJadwal?.[day])?state.piketJadwal[day]:[], rec=ensureRecord(state.piket,date); const list=document.getElementById('piket-list'); if(!list)return;
      const query=(rosterUI.piket.search||'').trim().toLowerCase(); const people=query?assigned.filter(n=>n.toLowerCase().includes(query)):assigned;
      list.className='piket-pro-list card'; list.innerHTML=people.length?people.map(n=>{const done=rosterIsSudah(rec[n]);return `<div class="piket-person"><div class="mini-avatar">${esc(n.split(/\s+/).map(x=>x[0]||'').slice(0,2).join('').toUpperCase())}</div><div style="flex:1;min-width:0"><div class="mini-name">${esc(n)}</div><div style="font-size:9px;color:var(--ui-muted)">${done?'Tugas piket selesai':'Belum selesai'}</div></div>${isAdmin()?`<input type="checkbox" ${done?'checked':''} onchange="toggleRosterStudent('piket',${JSON.stringify(n).replace(/"/g,'&quot;')},this.checked)">`:''}</div>`}).join(''):'<div class="empty" style="width:100%;padding:28px">Belum ada siswa yang ditugaskan untuk piket.</div>';
      const pe=document.getElementById('piket-collected'),re=document.getElementById('piket-remaining');const done=assigned.filter(n=>rosterIsSudah(rec[n])).length;if(pe)pe.textContent=done;if(re)re.textContent=assigned.length-done;
    }

    let taskFilter='all';
    function injectTaskFilters(){const v=document.getElementById('view-tugas');if(!v||document.getElementById('task-filter-tabs'))return;const head=v.querySelector('.pagehead');const tabs=document.createElement('div');tabs.id='task-filter-tabs';tabs.className='task-filter-tabs';tabs.innerHTML=[['all','Semua'],['active','Aktif'],['soon','Mendekati Deadline'],['done','Selesai']].map(x=>`<button class="task-filter-tab ${x[0]==='all'?'active':''}" data-task-filter="${x[0]}">${x[1]}</button>`).join('');head.after(tabs);tabs.addEventListener('click',e=>{const b=e.target.closest('[data-task-filter]');if(!b)return;taskFilter=b.dataset.taskFilter;tabs.querySelectorAll('.task-filter-tab').forEach(x=>x.classList.toggle('active',x===b));professionalRenderTugas();});}
    function daysLeft(d){if(!d)return 999;const a=new Date();a.setHours(0,0,0,0);const b=new Date(d+'T00:00:00');return Math.ceil((b-a)/86400000)}
    function taskMatches(t){const left=daysLeft(t.tenggat);if(taskFilter==='done')return !!t.selesai;if(taskFilter==='active')return !t.selesai;if(taskFilter==='soon')return !t.selesai&&left<=3;return true}
    function professionalRenderTugas(){
      injectTaskFilters(); autoCleanDoneTugas(); const all=(state.tugas||[]).filter(taskMatches); const open=all.filter(t=>!t.selesai),done=all.filter(t=>t.selesai); const hint=document.getElementById('tugas-autoclean-hint');if(hint)hint.textContent='';
      const renderCard=t=>{const displayTaskName=String(t.nama||'').replace(/\bvidio\b/gi,'video');const displayTaskDesc=String(t.deskripsi||'').replace(/\bvidio\b/gi,'video');const left=daysLeft(t.tenggat);const dc=t.selesai?'deadline-safe':left<=1?'deadline-danger':left<=3?'deadline-soon':'deadline-safe';const dl=t.selesai?'Selesai':t.tenggat?(left<0?'Lewat deadline':left===0?'Hari ini':left===1?'H-1':`H-${left}`):'Tanpa deadline';const clickable=isAdmin()?` role="button" tabindex="0" title="Klik untuk membuka editor" onclick="openTugasModal(${Number(t.id)})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openTugasModal(${Number(t.id)})}"`:'';const action=isAdmin()?`<div class="task-pro-actions"><button type="button" onclick="event.stopPropagation();toggleTugas(${Number(t.id)})">${t.selesai?'Buka lagi':'Tandai selesai'}</button></div>`:'';let driveLink='';try{const raw=String(t.driveLink||'').trim();if(raw){const u=new URL(raw);const host=u.hostname.toLowerCase();if(u.protocol==='https:'&&(host==='drive.google.com'||host==='docs.google.com'))driveLink=u.href;}}catch(_){}return `<div class="task-pro-card"${clickable}><div class="task-pro-top"><div class="task-pro-title">${esc(displayTaskName)}</div><span class="task-pro-deadline ${dc}">${dl}</span></div><div class="task-pro-meta"><span class="task-pro-tag">${esc(t.mapel||'Tanpa mapel')}</span>${t.tenggat?`<span class="task-pro-tag">${esc(t.tenggat)}</span>`:''}${driveLink?'<span class="task-pro-tag task-pill-drive">☁️ Google Drive</span>':''}</div>${displayTaskDesc?`<div class="task-pro-desc">${esc(displayTaskDesc)}</div>`:''}${driveLink?`<div class="task-drive-link"><a href="${esc(driveLink)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">☁️ Buka folder Google Drive untuk mengumpulkan</a></div>`:''}${renderTaskFiles(t)}${action}</div>`};
      const a=document.getElementById('tugas-open-list'),b=document.getElementById('tugas-done-list');if(a){a.className='task-column';a.innerHTML=`<div class="task-column-title">Aktif</div>${open.length?open.map(renderCard).join(''):'<div class="empty" style="padding:28px 12px">Tidak ada tugas aktif.</div>'}`;}if(b){b.className='task-column';b.innerHTML=`<div class="task-column-title">Selesai</div>${done.length?done.map(renderCard).join(''):'<div class="empty" style="padding:28px 12px">Belum ada tugas selesai.</div>'}`;}
      const openSection=a?.closest('.section'); const doneSection=b?.closest('.section');
      if(openSection && doneSection){
        let board=document.getElementById('task-board-shell');
        if(!board){
          board=document.createElement('div'); board.id='task-board-shell'; board.className='task-board-shell';
          openSection.parentNode.insertBefore(board, openSection);
          board.appendChild(openSection); board.appendChild(doneSection);
        }
        board.classList.add('task-board');
      }
    }

    // Keep the Google Drive collection link visible in the professional task renderer too.
    function injectReportUI(){const v=document.getElementById('view-laporan');if(!v||document.getElementById('report-pro-top'))return;const first=v.querySelector('.section');const box=document.createElement('div');box.id='report-pro-top';box.className='report-pro-top';box.innerHTML='<div class="report-chart-card"><div class="section-kicker">RINGKASAN</div><div style="font-size:14px;font-weight:800">Status laporan</div><div id="report-bars" class="report-bars"></div></div><div class="report-kpi-card"><div class="report-kpi-grid"><div class="report-kpi"><div class="rk-label">Menunggu</div><div class="rk-value" id="rk-pending">0</div></div><div class="report-kpi"><div class="rk-label">Ditinjau</div><div class="rk-value" id="rk-reviewed">0</div></div><div class="report-kpi"><div class="rk-label">Selesai</div><div class="rk-value" id="rk-resolved">0</div></div><div class="report-kpi"><div class="rk-label">Ditolak</div><div class="rk-value" id="rk-rejected">0</div></div></div><div class="report-actions" style="margin-top:12px"><button class="report-action-btn primary" onclick="window.print()">Cetak / PDF</button></div></div>'; if(first)first.before(box);else v.appendChild(box);}
    function updateReportUI(list){injectReportUI();const c={pending:0,reviewed:0,resolved:0,rejected:0};(state.reports||[]).forEach(r=>{if(c[r.status]!=null)c[r.status]++});Object.keys(c).forEach(k=>{const e=document.getElementById('rk-'+k);if(e)e.textContent=c[k]});const max=Math.max(1,...Object.values(c));const bars=document.getElementById('report-bars');if(bars)bars.innerHTML=Object.entries(c).map(([k,v])=>`<div class="report-bar-col"><div class="report-bar" style="height:${Math.max(5,Math.round(v/max*72))}px"></div><div class="report-bar-label">${reportStatusLabel(k)}</div><strong style="font-size:10px">${v}</strong></div>`).join('');}

    function injectSettingsNav(){
  const v=document.getElementById('view-settings');
  if(!v||document.getElementById('settings-nav'))return;
  const head=v.querySelector('.pagehead');
  if(!head)return;

  const nav=document.createElement('div');
  nav.id='settings-nav';
  nav.className='settings-nav';
  nav.setAttribute('role','tablist');
  nav.innerHTML=
    '<button type="button" role="tab" data-cat="profile" aria-selected="true">Profil & Tampilan</button>'+
    '<button type="button" role="tab" data-cat="members" aria-selected="false">Anggota & Siswa</button>'+
    '<button type="button" role="tab" data-cat="security" aria-selected="false">Keamanan & Database</button>';
  head.after(nav);

  const profileCard=v.querySelector('.section > .card');
  const all=[...v.querySelectorAll('.settings-section')];

  // The settings card is only a visual shell. Do NOT hide the whole card:
  // every category lives inside it, so Members/Security would otherwise be blank.
  const profileItems=[];
  if(profileCard){
    [...profileCard.children].forEach(el=>{
      if(!el.classList.contains('settings-section')){
        el.dataset.settingCat='profile';
        profileItems.push(el);
      }
    });
  }

  all.forEach(el=>{
    if(el.dataset.settingCat)return;
    const label=(el.querySelector('.settings-label')?.textContent||'').trim().toLowerCase().replace(/\s+/g,' ');
    if(el.id==='account-manage-wrap' || el.classList.contains('account-management')){
      el.dataset.settingCat='members';
    }else if(/^(tugas|laporan|ruang penyimpanan|backup & pemulihan|zona berbahaya|riwayat aktivitas|keamanan hak akses|keamanan firebase)/.test(label)){
      el.dataset.settingCat='security';
    }else{
      el.dataset.settingCat='profile';
    }
  });

  function syncSettingsTabAccess(){
    const membersBtn=nav.querySelector('[data-cat="members"]');
    const securityBtn=nav.querySelector('[data-cat="security"]');
    if(membersBtn) membersBtn.style.display=isSuperAdmin()?'':'none';
    if(securityBtn) securityBtn.style.display=isAdmin()?'':'none';
  }
  function apply(cat){
    syncSettingsTabAccess();
    const allowed=['profile',isSuperAdmin()?'members':null,isAdmin()?'security':null].filter(Boolean);
    if(!allowed.includes(cat)) cat='profile';
    nav.querySelectorAll('[data-cat]').forEach(btn=>{
      const active=btn.dataset.cat===cat;
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-selected',active?'true':'false');
    });
    profileItems.forEach(el=>el.classList.toggle('hidden-by-category',cat!=='profile'));
    all.forEach(el=>el.classList.toggle('hidden-by-category',el.dataset.settingCat!==cat));
  }

  nav.addEventListener('click',e=>{
    const btn=e.target.closest('[data-cat]');
    if(btn) apply(btn.dataset.cat);
  });

  nav.addEventListener('keydown',e=>{
    const tabs=[...nav.querySelectorAll('[data-cat]')];
    const index=tabs.indexOf(e.target);
    if(index<0)return;
    let next=index;
    if(e.key==='ArrowRight') next=(index+1)%tabs.length;
    else if(e.key==='ArrowLeft') next=(index-1+tabs.length)%tabs.length;
    else return;
    e.preventDefault();
    tabs[next].focus();
    apply(tabs[next].dataset.cat);
  });

  apply('profile');
}

    const oldRenderKas=window.renderKas, oldRenderHp=window.renderHp, oldRenderPiket=window.renderPiket, oldRenderJadwal=window.renderJadwalList, oldRenderTugas=window.renderTugas, oldRenderReports=window.renderReports;
    window.renderKas=function(){ensureKasEnhancements();professionalRenderKas();if(typeof renderKasSiswa==='function')renderKasSiswa();};
    window.renderHp=function(){professionalRenderHp();};
    window.renderPiket=function(){professionalRenderPiket();};
    window.renderJadwalList=function(){professionalRenderJadwalList();};
    window.renderTugas=function(){professionalRenderTugas();};
    window.renderReports=function(){if(typeof oldRenderReports==='function')oldRenderReports();updateReportUI();};

    function boot(){
      try{ensureKasEnhancements();injectTaskFilters();injectReportUI();injectSettingsNav();}catch(e){console.warn('Module V6 UI init',e)}
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  })();
