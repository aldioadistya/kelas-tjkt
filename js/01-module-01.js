function clientSafeError(fallback) { return String(fallback || 'Terjadi kendala. Coba lagi.'); }
  // Application behavior

  // Toast notification
  // ============================================================
  function showNotification(message, type = 'success', duration = 2800) {
      const container = document.getElementById('toast-container');
      if (!container) return;
      const icons = {
          success: '✅',
          error: '❌',
          warning: '⚠️',
          info: 'ℹ️'
      };
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      toast.innerHTML = `<span class="toast-icon">${escapeHtml(icons[type] || 'ℹ️')}</span><span class="toast-msg">${escapeHtml(message)}</span><button class="toast-close" onclick="this.parentElement.remove()">✕</button>`;
      container.appendChild(toast);
      const timer = setTimeout(() => {
          toast.classList.add('hiding');
          setTimeout(() => {
              if (toast.parentElement) toast.remove();
          }, 300);
      }, duration);
      toast.addEventListener('click', () => {
          clearTimeout(timer);
          toast.classList.add('hiding');
          setTimeout(() => {
              if (toast.parentElement) toast.remove();
          }, 300);
      });
  }
  // ============================================================
  // FIREBASE
  // ============================================================
  // Prefer kelasku-env.js when tersedia.
  // Fallback ini menjaga aplikasi tetap jalan pada hosting statis
  // jika file environment belum ikut ter-upload. Konfigurasi Firebase
  // Web adalah client config, bukan server secret.
  const runtimeEnv = (window.KELASKU_ENV && typeof window.KELASKU_ENV === 'object')
      ? window.KELASKU_ENV
      : {
          firebaseConfig: {
              apiKey: 'AIzaSyAhrh00F2N07_Lx-QT6sHi_ygsvWfds1eQ',
              authDomain: 'apps-kelas.firebaseapp.com',
              projectId: 'apps-kelas',
              storageBucket: 'apps-kelas.firebasestorage.app',
              messagingSenderId: '24953961039',
              appId: '1:24953961039:web:4ad80d05e9f4be771c083a'
          },
          driveApiUrl: 'https://script.google.com/macros/s/AKfycbxkCOpaqCYnQ7HOgK61t189lvHap3wCjP9jj9ks73XbQJdWgHFnGUdye0hxjoh8Z1mveQ/exec'
      };
  const firebaseConfig = runtimeEnv.firebaseConfig || {};
  if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId || !firebaseConfig.appId) {
      document.documentElement.classList.add('kelasku-config-missing');
      throw new Error('Konfigurasi Firebase belum lengkap. Periksa kelasku-env.js atau konfigurasi bawaan aplikasi.');
  }
  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();
  const VALID_ROLES = ['siswa', 'admin', 'superadmin'];
  const FS_COLLECTION = 'kelasku'; // legacy collection, admin-only migration source
  const FS_PROFILES = 'kelasku_profiles';
  const FS_PUBLIC = 'kelasku_public';
  const FS_ADMIN = 'kelasku_admin';
  const FS_META = 'kelasku_meta';
  const FS_REPORTS = 'kelasku_reports';
  const FS_NOTIFICATIONS = 'kelasku_notifications';
  // Google Drive bridge URL comes from deployment environment.
  const KELASKU_DRIVE_API_URL = String(runtimeEnv.driveApiUrl || '').trim();
  const KELASKU_DRIVE_ALLOWED_ACTIONS = new Set(['storage','upload','delete','cleanup-all']);
  const SECURITY_DATA_VERSION = 2;
  const PUBLIC_STATE_DOC = 'kelasku-state';
  const ADMIN_STATE_DOC = 'admin-state';
  let separatedSyncUnsubs = [];
  let reportSyncUnsub = null;
  let notificationSyncUnsub = null;
  let _loadedReportIds = new Set();
  let _separatedMigrationDone = false;
  const secondaryApp = firebase.initializeApp(firebaseConfig, 'Secondary');
  const secondaryAuth = secondaryApp.auth();
  secondaryAuth.setPersistence(firebase.auth.Auth.Persistence.NONE).catch(() => {});
  // ============================================================
  // GLOBAL STATE
  // ============================================================
  let currentUser = null;
  let authReady = false;
  let pendingRegisterName = '';
  let state = {
      kas: [],
      kasFolders: [],
      autoCleanTugasDays: 7,
      autoCleanReportDays: 7,
      students: ["Aldio Adistya", "Bagas Saputra", "Citra Ramadhani", "Dwi Lestari", "Eka Prasetyo", "Fajar Nugraha", "Gita Anggraini", "Hendra Wijaya"],
      hp: {},
      piket: {},
      piketJadwal: {},
      piketTaskList: ['Bersihkan lantai', 'Buang sampah', 'Tutup jendela', 'Rapikan meja dan kursi', 'Rapikan papan tulis', 'Matikan lampu', 'Susun kursi dengan rapi', 'Periksa kebersihan kelas'],
      piketRotationMode: 'auto',
      piketWeeklyAssignments: {},
      tugas: [],
      chessStats: {},
      jadwal: {
          Senin: [{ jam: "07:15-08:45", mapel: "Matematika", guru: "Bu Rina" }],
          Selasa: [{ jam: "07:15-08:45", mapel: "Administrasi Jaringan", guru: "Pak Budi" }],
          Rabu: [{ jam: "07:15-07:45", mapel: "Projek IPAS", guru: "Bu Hanadi" }],
          Kamis: [{ jam: "07:15-08:45", mapel: "Pemrograman Web", guru: "Pak Reza" }],
          Jumat: [{ jam: "07:15-08:45", mapel: "Pendidikan Agama", guru: "Pak Yusuf" }]
      },
      pengumuman: [],
      reports: [],
      notifications: [],
      activityLog: [],
      jadwalMode: 'pelajaran',
      selectedDay: 'Senin',
      calMinimized: { hp: true, piket: true },
      kasFolderMinimized: {},
      hpSelectedDate: null,
      piketSelectedDate: null,
      nameChangeLog: []
  };
  let localSettings = { session: null };
  const DAY_NAMES = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"];
  const SCHOOL_DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"];
  const FULL_DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const MONTH_LABEL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const DOW_LABEL = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  let darkMode = localStorage.getItem('kelasku-theme') === 'dark';
  const KELASKU_PASSWORD_MIN_LENGTH = 8;
  const KELASKU_PASSWORD_REQUIRE_SPECIAL = true;
  let reauthResolver = null;

  function passwordPolicyMissing(password) {
      const missing = [];
      if (password.length < KELASKU_PASSWORD_MIN_LENGTH) missing.push('minimal 8 karakter');
      if (!/[a-z]/.test(password)) missing.push('huruf kecil');
      if (!/[A-Z]/.test(password)) missing.push('huruf besar');
      if (!/[0-9]/.test(password)) missing.push('angka');
      if (KELASKU_PASSWORD_REQUIRE_SPECIAL && !/[^A-Za-z0-9]/.test(password)) missing.push('simbol');
      return missing;
  }

  async function validateKelaskuPassword(password) {
      const localMissing = passwordPolicyMissing(password);
      if (localMissing.length) {
          return {
              valid: false,
              message: 'Password harus memenuhi: ' + localMissing.join(', ') + '.'
          };
      }

      if (typeof auth.validatePassword === 'function') {
          try {
              const status = await auth.validatePassword(password);
              if (status && status.isValid === false) {
                  return {
                      valid: false,
                      message: 'Password belum memenuhi kebijakan keamanan Firebase.'
                  };
              }
          } catch (e) {
              // Local policy remains the minimum safety net.
              console.warn('Firebase password policy validation unavailable:', e);
          }
      }

      return { valid: true, message: '' };
  }

  function clearEmailVerificationBox() {}

  // ============================================================
  // AUTH STATE
  // ============================================================
  auth.onAuthStateChanged(async (user) => {
      if (user) {
          authReady = true;
          await loadUserProfile(user);
      } else {
          authReady = false;
          currentUser = null;
          clearEmailVerificationBox();
          document.getElementById('auth-status').textContent = '⏳ Belum login';
          document.getElementById('auth-status').style.color = 'var(--amber)';
          showLogin();
          if (typeof stopSeparatedSync === 'function') stopSeparatedSync();
      }
  });

  async function loadUserProfile(user) {
      // Authentication sukses harus segera membuka aplikasi.
      // Sinkronisasi/rendering data adalah proses lanjutan dan tidak boleh
      // membuat pengguna terpental kembali ke halaman login.
      try {
          const ref = db.collection(FS_PROFILES).doc(user.uid);
          let snap;

          try {
              snap = await ref.get();
          } catch (profileReadError) {
              console.error('Profile read failed:', profileReadError);
              const code = String(profileReadError && profileReadError.code || '');
              if (code.includes('permission-denied')) {
                  throw new Error('Profil akun tidak dapat dibaca oleh Firestore. Pastikan Rules kelasku_profiles mengizinkan akun membaca profilnya sendiri.');
              }
              throw profileReadError;
          }

          // Pengguna baru selalu dibuat sebagai siswa.
          // Hanya Super Admin yang boleh mengubah role setelah profile dibuat.
          if (!snap.exists) {
              const profile = {
                  email: user.email,
                  username: pendingRegisterName || user.displayName || (user.email ? user.email.split('@')[0] : 'Pengguna'),
                  role: 'siswa',
                  active: true,
                  createdAt: firebase.firestore.FieldValue.serverTimestamp()
              };
              pendingRegisterName = '';
              await ref.set(profile);
              snap = await ref.get();
          }

          const profile = snap.data() || {};

          if (profile.active === false) {
              document.getElementById('login-error').textContent = 'Akun ini telah dinonaktifkan. Hubungi Super Admin.';
              document.getElementById('login-error').style.display = 'block';
              currentUser = null;
              await auth.signOut();
              return;
          }

          const role = VALID_ROLES.includes(profile.role) ? profile.role : 'siswa';

          currentUser = {
              uid: user.uid,
              email: profile.email || user.email,
              username: profile.username || (user.email ? user.email.split('@')[0] : 'Pengguna'),
              role,
              avatar: ''
          };

          currentUser.avatar = getStoredAvatar();
          refreshAvatarUI();

          // Simpan role terakhir sebagai fallback UI saja. Otorisasi tetap
          // ditentukan oleh Firestore Rules, bukan oleh localStorage.
          try {
              localStorage.setItem('kelasku-last-role-' + user.uid, role);
          } catch (_) {}

          clearEmailVerificationBox();
          document.getElementById('auth-status').textContent = '✅ Login (' + user.email + ')';
          document.getElementById('auth-status').style.color = 'var(--teal)';
          applyRole(currentUser.role);

          // Auth + profile sudah valid: tampilkan aplikasi sekarang.
          // Proses Firestore/Drive berikutnya tidak boleh mengunci halaman login.
          hideLogin();
          applyTheme();
          document.body.classList.add('kelasku-authenticated');

          // Render awal harus selalu jalan walaupun Firestore sedang bermasalah.
          try {
              renderAll();
          } catch (renderError) {
              console.error('Initial render error:', renderError);
          }

          // Data server hanya inisialisasi tambahan. Error di sini tidak boleh
          // dianggap sebagai kegagalan login.
          try {
              await loadState();
          } catch (stateError) {
              console.warn('Initial state load skipped:', stateError);
              notifyFirestorePermissionOnce();
          }

          try {
              renderAll();
          } catch (renderError2) {
              console.error('Post-load render error:', renderError2);
          }

          try {
              watchLiveSync();
          } catch (syncError) {
              console.warn('Live sync startup skipped:', syncError);
          }
      } catch (e) {
          console.error('Load user profile error:', e);
          const errorText = String(e && e.message ? e.message : e || 'Gagal memuat profil pengguna.');
          document.getElementById('login-error').textContent = errorText;
          document.getElementById('login-error').style.display = 'block';
          currentUser = null;
          try { await auth.signOut(); } catch (_) {}
          showLogin();
      }
  }
  function showLogin() { document.getElementById('login-overlay').style.display = 'flex'; }
  function hideLogin() { document.getElementById('login-overlay').style.display = 'none'; }
  // ============================================================
  // SECURE SEPARATED STORAGE
  // ============================================================
  // Public state is intentionally limited to class information that
  // students are allowed to see. Sensitive/admin-only data is stored
  // separately. Reports are stored one document per report so a student
  // can never read another student's report through the shared state.

  const PUBLIC_STATE_KEYS = [
      'kas',
      'kasFolders',
      'autoCleanTugasDays',
      'students',
      'hp',
      'piket',
      'piketJadwal',
      'piketTaskList',
      'piketTaskConfig',
      'piketRotationMode',
      'piketWeeklyAssignments',
      'tugas',
      'jadwal',
      'pengumuman',
      'notifications',
      '__kelaskuRevision'
  ];

  const ADMIN_STATE_KEYS = [
      'autoCleanReportDays',
      'activityLog',
      'nameChangeLog',
      '__kelaskuRevision'
  ];

  function pickStateKeys(source, keys) {
      const out = {};
      keys.forEach(key => {
          if (source && Object.prototype.hasOwnProperty.call(source, key)) {
              out[key] = source[key];
          }
      });
      return out;
  }

  function buildPublicState(source = state) {
      const out = pickStateKeys(source, PUBLIC_STATE_KEYS);

      // Staff and per-user notifications are never placed in the public
      // state. Student/global notifications are okay for all verified users.
      out.notifications = Array.isArray(source.notifications)
          ? source.notifications.filter(n => !n.targetUid && n.targetRole !== 'staff')
          : [];

      return out;
  }

  function buildAdminState(source = state) {
      const out = pickStateKeys(source, ADMIN_STATE_KEYS);
      return out;
  }

  function hydrateLocalUiState() {
      if (!state.reports) state.reports = [];
      if (state.autoCleanReportDays === undefined || state.autoCleanReportDays === null) {
          state.autoCleanReportDays = 7;
      }
      if (!state.piketJadwal || typeof state.piketJadwal !== 'object' || Array.isArray(state.piketJadwal)) {
          state.piketJadwal = {};
      }
      if (!Array.isArray(state.piketTaskList)) state.piketTaskList = [...DEFAULT_PIKET_TASKS];
      state.piketTaskList = state.piketTaskList.map(v => String(v || '').trim()).filter(Boolean).slice(0, 30);
      normalizePiketTaskList();
      normalizePiketTaskConfig();
      if (!['auto', 'manual'].includes(state.piketRotationMode)) state.piketRotationMode = 'auto';
      if (!state.piketWeeklyAssignments || typeof state.piketWeeklyAssignments !== 'object' || Array.isArray(state.piketWeeklyAssignments)) state.piketWeeklyAssignments = {};
      if (!state.jadwal || typeof state.jadwal !== 'object' || Array.isArray(state.jadwal)) {
          state.jadwal = {};
      }
      if (!state.calMinimized) state.calMinimized = { hp: false, piket: false };
      if (!state.kasFolderMinimized || typeof state.kasFolderMinimized !== 'object') {
          state.kasFolderMinimized = {};
      }
      if (!state.nameChangeLog) state.nameChangeLog = [];
      if (!Array.isArray(state.notifications)) state.notifications = [];
      if (!Array.isArray(state.activityLog)) state.activityLog = [];

      DAY_NAMES.forEach(day => {
          if (!Array.isArray(state.jadwal[day])) state.jadwal[day] = [];
          if (!Array.isArray(state.piketJadwal[day])) state.piketJadwal[day] = [];
      });

      if (!state.hpSelectedDate) state.hpSelectedDate = todayKey();
      if (!state.piketSelectedDate) state.piketSelectedDate = todayKey();
      ensureRecord(state.hp, state.hpSelectedDate);
      ensureRecord(state.piket, state.piketSelectedDate);
      ensureAppFeatures();
  }

  async function readStateDocument(collectionName, docId, fallbackLocalKey = null) {
      try {
          const snap = await db.collection(collectionName).doc(docId).get();
          if (snap.exists && typeof snap.data().value === 'string') {
              const parsed = JSON.parse(snap.data().value);
              if (fallbackLocalKey) {
                  localStorage.setItem(fallbackLocalKey, snap.data().value);
              }
              return parsed || {};
          }
          return null;
      } catch (e) {
          handleFirestoreSyncError(e, 'Firestore state read: ' + collectionName);
          if (fallbackLocalKey) {
              try {
                  const cached = localStorage.getItem(fallbackLocalKey);
                  return cached ? JSON.parse(cached) : null;
              } catch (_) {}
          }
          return null;
      }
  }

  async function writeStateDocument(collectionName, docId, value, localKey = null) {
      const payload = JSON.stringify(value);
      if (payload.length > 880000) {
          throw new Error('Data utama terlalu besar untuk Firestore (' + Math.round(payload.length / 1024) + ' KB). Lampiran harus sudah dipindahkan ke Google Drive.');
      }
      await db.collection(collectionName).doc(docId).set({
          value: payload,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      if (localKey) {
          localStorage.setItem(localKey, payload);
      }
      return { synced: true, collection: collectionName, bytes: payload.length };
  }

  async function migrateLegacyStateOnce() {
      if (!currentUser || !isAdmin() || _separatedMigrationDone) return;

      const metaRef = db.collection(FS_META).doc('security-v2');
      let meta = {};
      try {
          const metaSnap = await metaRef.get();
          meta = metaSnap.exists ? (metaSnap.data() || {}) : {};
      } catch (e) {
          if (isFirestorePermissionError(e)) {
              handleFirestoreSyncError(e, 'Security migration metadata read');
              _separatedMigrationDone = true;
              return;
          }
          throw e;
      }

      // Once the migration has been completed successfully, do not rerun it on
      // every page load. Re-running against the legacy document is unnecessary
      // and can fail when the old state still contains large Base64 attachments.
      if (meta.migrated === true && Number(meta.version || 0) >= SECURITY_DATA_VERSION) {
          _separatedMigrationDone = true;
          return;
      }

      // Always verify that the separated documents actually exist before
      // trusting the migration marker. A previous failed migration could have
      // written the marker while leaving empty/default data behind.
      let separatedPublic = null;
      let separatedAdmin = null;
      try {
          const [publicSnap, adminSnap] = await Promise.all([
              db.collection(FS_PUBLIC).doc(PUBLIC_STATE_DOC).get(),
              db.collection(FS_ADMIN).doc(ADMIN_STATE_DOC).get()
          ]);
          if (publicSnap.exists && typeof publicSnap.data().value === 'string') {
              separatedPublic = JSON.parse(publicSnap.data().value);
          }
          if (adminSnap.exists && typeof adminSnap.data().value === 'string') {
              separatedAdmin = JSON.parse(adminSnap.data().value);
          }
      } catch (e) {
          console.warn('Separated state verification failed:', e);
      }

      // Do not trust the migration marker by itself. A previous migration can
      // have produced an empty separated document while still marking itself
      // complete. We therefore continue to inspect the legacy document and
      // recover richer values when necessary.
      let legacy = null;
      try {
          const legacySnap = await db.collection(FS_COLLECTION).doc(PUBLIC_STATE_DOC).get();
          if (legacySnap.exists && typeof legacySnap.data().value === 'string' && legacySnap.data().value) {
              legacy = JSON.parse(legacySnap.data().value);
          }
      } catch (e) {
          console.warn('Legacy state migration read failed:', e);
          // IMPORTANT: never replace the missing legacy source with the local
          // default state and mark migration complete. That was the cause of
          // the app appearing empty until an Import was performed.
          if (!separatedPublic) return;
      }

      // If legacy data is unavailable, keep whatever separated data already
      // exists. Never overwrite server data with the small default state.
      if (!legacy || typeof legacy !== 'object') {
          if (separatedPublic) {
              _separatedMigrationDone = true;
              return;
          }
          return;
      }

      // Preserve all existing public class data.
      const publicState = buildPublicState(legacy);
      if (!Array.isArray(publicState.students)) publicState.students = [];
      if (!publicState.jadwal || typeof publicState.jadwal !== 'object') publicState.jadwal = {};
      if (!Array.isArray(publicState.tugas)) publicState.tugas = [];
      if (!Array.isArray(publicState.pengumuman)) publicState.pengumuman = [];

      // Preserve admin-only settings/logs separately.
      const adminState = buildAdminState(legacy);
      if (!Array.isArray(adminState.activityLog)) adminState.activityLog = [];
      if (!Array.isArray(adminState.nameChangeLog)) adminState.nameChangeLog = [];

      // Merge carefully so a previously-created empty/default separated state
      // can never overwrite richer legacy data. For arrays/objects, prefer the
      // non-empty separated value; otherwise recover the legacy value.
      function mergeRecoveredState(baseState, existingState) {
          const merged = Object.assign({}, baseState || {});
          if (!existingState || typeof existingState !== 'object') return merged;

          Object.keys(merged).forEach(key => {
              const incoming = existingState[key];
              const legacyValue = merged[key];
              if (Array.isArray(legacyValue)) {
                  if (Array.isArray(incoming) && incoming.length > 0) merged[key] = incoming;
                  else if (!Array.isArray(incoming)) merged[key] = legacyValue;
              } else if (legacyValue && typeof legacyValue === 'object') {
                  const incomingObj = incoming && typeof incoming === 'object' ? incoming : null;
                  const incomingKeys = incomingObj ? Object.keys(incomingObj).length : 0;
                  const legacyKeys = Object.keys(legacyValue).length;
                  merged[key] = incomingKeys > 0 || legacyKeys === 0 ? (incomingObj || legacyValue) : legacyValue;
              } else if (incoming !== undefined && incoming !== null && incoming !== '') {
                  // For scalar settings, retain an explicitly configured separated value.
                  merged[key] = incoming;
              }
          });

          // Preserve separated-only keys as well.
          Object.keys(existingState).forEach(key => {
              if (!Object.prototype.hasOwnProperty.call(merged, key)) merged[key] = existingState[key];
          });
          return merged;
      }

      const mergedPublicState = mergeRecoveredState(publicState, separatedPublic);
      const mergedAdminState = mergeRecoveredState(adminState, separatedAdmin);

      await writeStateDocument(FS_PUBLIC, PUBLIC_STATE_DOC, mergedPublicState, 'kelasku-public-state');
      await writeStateDocument(FS_ADMIN, ADMIN_STATE_DOC, mergedAdminState, null);

      // Migrate all legacy reports out of the shared state.
      const legacyReports = Array.isArray(legacy.reports) ? legacy.reports : [];
      if (legacyReports.length) {
          let batch = db.batch();
          let count = 0;
          for (const report of legacyReports) {
              if (!report || report.id == null) continue;
              const ref = db.collection(FS_REPORTS).doc(String(report.id));
              batch.set(ref, report, { merge: true });
              count++;
              if (count >= 450) {
                  await batch.commit();
                  batch = db.batch();
                  count = 0;
              }
          }
          if (count) await batch.commit();
      }

      // Migrate sensitive per-user/staff notifications to a protected collection.
      const legacyNotifications = Array.isArray(legacy.notifications) ? legacy.notifications : [];
      if (legacyNotifications.length) {
          let batch = db.batch();
          let count = 0;
          for (const n of legacyNotifications) {
              if (!n || n.id == null) continue;
              if (n.targetUid || n.targetRole === 'staff') {
                  const ref = db.collection(FS_NOTIFICATIONS).doc(String(n.id));
                  batch.set(ref, {
                      id: n.id,
                      at: n.at || Date.now(),
                      title: String(n.title || '').slice(0, 200),
                      text: String(n.text || '').slice(0, 1000),
                      targetUid: n.targetUid || null,
                      targetRole: n.targetRole || null,
                      readBy: Array.isArray(n.readBy) ? n.readBy : [],
                      createdByUid: n.createdByUid || null
                  }, { merge: true });
                  count++;
                  if (count >= 450) {
                      await batch.commit();
                      batch = db.batch();
                      count = 0;
                  }
              }
          }
          if (count) await batch.commit();
      }

      await metaRef.set({
          version: SECURITY_DATA_VERSION,
          migrated: true,
          migratedAt: firebase.firestore.FieldValue.serverTimestamp(),
          migratedByUid: currentUser.uid
      }, { merge: true });

      _separatedMigrationDone = true;
  }

  async function loadReportsForCurrentUser() {
      if (!currentUser) return;

      try {
          let query = db.collection(FS_REPORTS);
          if (!isAdmin()) {
              query = query.where('authorUid', '==', currentUser.uid);
          }

          const snap = await query.get();
          state.reports = snap.docs.map(doc => ({ id: Number(doc.id) || doc.id, ...doc.data() }));
          state.reports.sort((a, b) => Number(b.createdAt || b.id || 0) - Number(a.createdAt || a.id || 0));
          _loadedReportIds = new Set(state.reports.map(r => String(r.id)));
          ensureAppFeatures();
      } catch (e) {
          console.warn('Report load error:', e);
          state.reports = [];
          _loadedReportIds = new Set();
      }
  }

  async function saveReportsForAdmin() {
      if (!isAdmin()) return;

      const currentIds = new Set(state.reports.map(r => String(r.id)));
      const oldIds = Array.from(_loadedReportIds);

      let batch = db.batch();
      let count = 0;

      for (const report of state.reports) {
          if (!report || report.id == null) continue;
          const ref = db.collection(FS_REPORTS).doc(String(report.id));
          batch.set(ref, report, { merge: true });
          count++;
          if (count >= 450) {
              await batch.commit();
              batch = db.batch();
              count = 0;
          }
      }

      for (const oldId of oldIds) {
          if (!currentIds.has(oldId)) {
              batch.delete(db.collection(FS_REPORTS).doc(oldId));
              count++;
              if (count >= 450) {
                  await batch.commit();
                  batch = db.batch();
                  count = 0;
              }
          }
      }

      if (count) await batch.commit();
      _loadedReportIds = currentIds;
  }

  async function saveTargetedNotifications() {
      if (!currentUser) return;

      const privateNotifications = (state.notifications || []).filter(n => n && (n.targetUid || n.targetRole === 'staff'));
      if (!privateNotifications.length) return;

      let batch = db.batch();
      let count = 0;

      for (const n of privateNotifications) {
          if (n.id == null) continue;
          const ref = db.collection(FS_NOTIFICATIONS).doc(String(n.id));
          batch.set(ref, {
              id: n.id,
              at: n.at || Date.now(),
              title: String(n.title || '').slice(0, 200),
              text: String(n.text || '').slice(0, 1000),
              targetUid: n.targetUid || null,
              targetRole: n.targetRole || null,
              readBy: Array.isArray(n.readBy) ? n.readBy : [],
              createdByUid: n.createdByUid || currentUser.uid
          }, { merge: true });
          count++;
          if (count >= 450) {
              await batch.commit();
              batch = db.batch();
              count = 0;
          }
      }

      if (count) await batch.commit();
  }

  async function loadTargetedNotifications() {
      if (!currentUser) return;

      try {
          let query = db.collection(FS_NOTIFICATIONS);
          if (isAdmin()) {
              query = query.where('targetRole', '==', 'staff');
          } else {
              query = query.where('targetUid', '==', currentUser.uid);
          }
          const snap = await query.get();
          const extra = snap.docs.map(doc => doc.data());
          const publicNotifications = Array.isArray(state.notifications)
              ? state.notifications.filter(n => !n.targetUid && n.targetRole !== 'staff')
              : [];
          state.notifications = publicNotifications.concat(extra);
      } catch (e) {
          console.warn('Targeted notification load error:', e);
      }
  }

  // Use window-backed save state so the lock survives script ordering/cache quirks.
  window.__kelaskuSavePending = false;
  window.__kelaskuSaveAgain = false;
  window.__kelaskuSavePromise = null;
  window.__kelaskuLastSaveSyncFailedNotified = false;

  async function saveState(options = {}) {
      const requirePublic = !!(options && options.requirePublic);
      const requireAdmin = !!(options && options.requireAdmin);
      window.__kelaskuSaveAgain = true;
      if (window.__kelaskuSavePromise) {
          const queuedResult = await window.__kelaskuSavePromise;
          if (requirePublic && (!queuedResult || !queuedResult.publicSynced)) {
              throw new Error('Data utama belum berhasil tersimpan ke Firebase.');
          }
          if (requireAdmin && (!queuedResult || !queuedResult.adminSynced)) {
              throw new Error('Data admin belum berhasil tersimpan ke Firebase.');
          }
          return queuedResult;
      }

      window.__kelaskuSavePromise = (async () => {
          window.__kelaskuSavePending = true;
          let lastResult = { synced: true, publicSynced: false, adminSynced: false, legacySynced: false };
          try {
              while (window.__kelaskuSaveAgain) {
                  window.__kelaskuSaveAgain = false;

                  // Student devices only retain a local copy of PUBLIC data.
                  // They never write shared class state or admin/private data.
                  if (!currentUser || !isAdmin()) {
                      const publicState = buildPublicState(state);
                      localStorage.setItem('kelasku-public-state', JSON.stringify(publicState));
                      localStorage.removeItem('kelasku-state');
                      localStorage.removeItem('kelasku-pending-admin-state');
                      localStorage.removeItem('kelasku-pending-admin-revision');
                      lastResult = { synced: true, localOnly: true, publicSynced: true, adminSynced: true, legacySynced: false };
                      continue;
                  }

                  // Give every write a monotonic client revision. Live listeners use
                  // this value to ignore older snapshots that can arrive after an import/save.
                  const previousRevision = Number(state.__kelaskuRevision) || 0;
                  state.__kelaskuRevision = Math.max(previousRevision + 1, Date.now());

                  const publicState = buildPublicState(state);
                  const adminState = buildAdminState(state);
                  const syncResults = [];

                  // Keep a durable admin draft while a server write is in flight.
                  // If the tab/app is reloaded during a transient Firestore failure,
                  // loadState can recover this newer draft instead of reverting to old data.
                  try {
                      localStorage.setItem('kelasku-pending-admin-state', JSON.stringify(state));
                      localStorage.setItem('kelasku-pending-admin-revision', String(state.__kelaskuRevision));
                  } catch (_) {}
                  let publicSynced = false;
                  let legacySynced = false;
                  let adminSynced = false;

                  // Primary separated storage.
                  try {
                      await writeStateDocument(FS_PUBLIC, PUBLIC_STATE_DOC, publicState, 'kelasku-public-state');
                      syncResults.push('public');
                      publicSynced = true;
                  } catch (e) {
                      handleFirestoreSyncError(e, 'Public state save');
                  }

                  // Compatibility snapshot for admins. Keep the complete admin
                  // state here as a fallback for older Rules / temporary Rules mismatch.
                  try {
                      await writeStateDocument(FS_COLLECTION, PUBLIC_STATE_DOC, state, null);
                      syncResults.push('legacy');
                      legacySynced = true;
                  } catch (e) {
                      if (isFirestorePermissionError(e)) {
                          handleFirestoreSyncError(e, 'Legacy state save');
                      } else if (String(e && e.message || '').includes('Data utama terlalu besar')) {
                          // Large-state fallback: keep the legacy document useful
                          // for core public data without failing the whole save.
                          try {
                              await writeStateDocument(FS_COLLECTION, PUBLIC_STATE_DOC, publicState, null);
                              syncResults.push('legacy-public');
                              legacySynced = true;
                          } catch (fallbackError) {
                              handleFirestoreSyncError(fallbackError, 'Legacy public fallback save');
                          }
                      } else {
                          throw e;
                      }
                  }

                  try {
                      await writeStateDocument(FS_ADMIN, ADMIN_STATE_DOC, adminState, null);
                      syncResults.push('admin');
                      adminSynced = true;
                  } catch (e) {
                      handleFirestoreSyncError(e, 'Admin state save');
                  }

                  try {
                      await saveReportsForAdmin();
                  } catch (e) {
                      handleFirestoreSyncError(e, 'Reports save');
                  }

                  try {
                      await saveTargetedNotifications();
                  } catch (e) {
                      handleFirestoreSyncError(e, 'Notifications save');
                  }

                  window.__kelaskuLastSaveSyncFailedNotified = false;
                  const synced = syncResults.length > 0;
                  lastResult = {
                      synced,
                      partial: syncResults.length > 0 && syncResults.length < 5,
                      sources: syncResults,
                      publicSynced,
                      legacySynced,
                      adminSynced
                  };

                  // Only clear the recovery draft after both primary separated
                  // documents confirm success. Otherwise keep it for reload recovery.
                  if (publicSynced && adminSynced) {
                      try {
                          localStorage.removeItem('kelasku-pending-admin-state');
                          localStorage.removeItem('kelasku-pending-admin-revision');
                      } catch (_) {}
                  }
                  console.log('Kelasku state save completed:', syncResults.join(', ') || 'local fallback');
              }

              if (requirePublic && !lastResult.publicSynced) {
                  throw new Error('Data utama belum berhasil tersimpan ke Firebase.');
              }
              if (requireAdmin && !lastResult.adminSynced) {
                  throw new Error('Data admin belum berhasil tersimpan ke Firebase.');
              }
              return lastResult;
          } catch (e) {
              const message = String(e && e.message ? e.message : e || 'Gagal menyimpan perubahan ke server.');
              console.error('Save separated state error:', e);
              showNotification('⚠️ Gagal menyimpan perubahan ke server.', 'error');
              return { synced: false, publicSynced: false, adminSynced: false, legacySynced: false, error: message };
          } finally {
              window.__kelaskuSavePending = false;
          }
      })();

      try {
          const result = await window.__kelaskuSavePromise;
          if (requirePublic && (!result || !result.publicSynced)) {
              throw new Error(result && result.error ? result.error : 'Data utama belum berhasil tersimpan ke Firebase.');
          }
          if (requireAdmin && (!result || !result.adminSynced)) {
              throw new Error(result && result.error ? result.error : 'Data admin belum berhasil tersimpan ke Firebase.');
          }
          return result;
      } finally {
          window.__kelaskuSavePromise = null;
      }
  }

  function restorePendingAdminDraft() {
      if (!isAdmin()) return false;
      try {
          const raw = localStorage.getItem('kelasku-pending-admin-state');
          if (!raw) return false;
          const draft = JSON.parse(raw);
          if (!draft || typeof draft !== 'object') return false;
          const draftRevision = Number(draft.__kelaskuRevision) || Number(localStorage.getItem('kelasku-pending-admin-revision')) || 0;
          const serverRevision = Number(state.__kelaskuRevision) || 0;
          // Recover only a newer unsynced draft. A newer server revision always wins.
          if (!draftRevision || draftRevision <= serverRevision) {
              localStorage.removeItem('kelasku-pending-admin-state');
              localStorage.removeItem('kelasku-pending-admin-revision');
              return false;
          }
          state = Object.assign(state, draft);
          hydrateLocalUiState();
          return true;
      } catch (_) {
          return false;
      }
  }

  async function loadState() {
      try {
          if (isAdmin()) {
              await migrateLegacyStateOnce();

              // Compatibility fallback: admin always keeps a readable legacy
              // snapshot as a second source. This prevents a temporary Rules
              // mismatch from blanking the app or removing admin-visible data.
              try {
                  const legacySnap = await db.collection(FS_COLLECTION).doc(PUBLIC_STATE_DOC).get();
                  if (legacySnap.exists && typeof legacySnap.data().value === 'string' && legacySnap.data().value) {
                      const legacyState = JSON.parse(legacySnap.data().value);
                      if (legacyState && typeof legacyState === 'object') {
                          state = Object.assign(state, legacyState);
                      }
                  }
              } catch (e) {
                  handleFirestoreSyncError(e, 'Legacy compatibility read');
              }
          }

          const currentJadwal = (state.jadwal && typeof state.jadwal === 'object' && !Array.isArray(state.jadwal))
              ? JSON.parse(JSON.stringify(state.jadwal))
              : {};

          const publicState = await readStateDocument(
              FS_PUBLIC,
              PUBLIC_STATE_DOC,
              'kelasku-public-state'
          );

          if (publicState && typeof publicState === 'object') {
              const incomingJadwal = publicState.jadwal;
              const incomingHasJadwal = hasAnyJadwalItems(incomingJadwal);
              const currentHasJadwal = hasAnyJadwalItems(currentJadwal);

              state = Object.assign(state, publicState);

              // Jangan biarkan snapshot server yang kosong menghapus jadwal
              // yang masih ada di state saat ini.
              if (!incomingHasJadwal && currentHasJadwal) {
                  state.jadwal = currentJadwal;
              }
          }

          // Admin recovery safety: jika public state kosong/kurang lengkap,
          // ambil legacy sekali lagi. Jadwal ikut dipulihkan secara eksplisit.
          if (isAdmin()) {
              const publicLooksEmpty =
                  !publicState ||
                  ((Array.isArray(publicState.students) && publicState.students.length === 0) &&
                   (Array.isArray(publicState.tugas) && publicState.tugas.length === 0) &&
                   (Array.isArray(publicState.pengumuman) && publicState.pengumuman.length === 0) &&
                   (Array.isArray(publicState.kas) && publicState.kas.length === 0));

              if (publicLooksEmpty) {
                  try {
                      const legacySnap = await db.collection(FS_COLLECTION).doc(PUBLIC_STATE_DOC).get();
                      if (legacySnap.exists && typeof legacySnap.data().value === 'string' && legacySnap.data().value) {
                          const recovered = JSON.parse(legacySnap.data().value);
                          if (recovered && typeof recovered === 'object') {
                              const recoveredPublic = buildPublicState(recovered);

                              // Kalau server public punya jadwal kosong, tetapi legacy
                              // masih punya isi, prioritaskan jadwal legacy.
                              if (!hasAnyJadwalItems(recoveredPublic.jadwal) && hasAnyJadwalItems(state.jadwal)) {
                                  recoveredPublic.jadwal = state.jadwal;
                              }

                              state = Object.assign(state, recoveredPublic);
                              await writeStateDocument(FS_PUBLIC, PUBLIC_STATE_DOC, recoveredPublic, 'kelasku-public-state');
                          }
                      }
                  } catch (recoveryError) {
                      console.warn('Legacy recovery read failed:', recoveryError);
                  }
              } else {
                  // Walaupun public state tidak sepenuhnya kosong, tetap coba
                  // memulihkan jadwal dari legacy bila public jadwal kosong.
                  if (!hasAnyJadwalItems(state.jadwal)) {
                      try {
                          const legacySnap = await db.collection(FS_COLLECTION).doc(PUBLIC_STATE_DOC).get();
                          if (legacySnap.exists && typeof legacySnap.data().value === 'string' && legacySnap.data().value) {
                              const recovered = JSON.parse(legacySnap.data().value);
                              if (recovered && hasAnyJadwalItems(recovered.jadwal)) {
                                  state.jadwal = recovered.jadwal;
                                  await writeStateDocument(
                                      FS_PUBLIC,
                                      PUBLIC_STATE_DOC,
                                      buildPublicState(recovered),
                                      'kelasku-public-state'
                                  );
                              }
                          }
                      } catch (e) {
                          console.warn('Legacy jadwal recovery failed:', e);
                      }
                  }
              }

              const adminState = await readStateDocument(FS_ADMIN, ADMIN_STATE_DOC, null);
              if (adminState) state = Object.assign(state, adminState);
          } else {
              // Never hydrate sensitive state from old browser caches.
              state.reports = [];
              state.activityLog = [];
              state.nameChangeLog = [];
              state.autoCleanReportDays = 7;
              localStorage.removeItem('kelasku-state');
          }

          await loadReportsForCurrentUser();
          await loadTargetedNotifications();

          // Restore the pending draft only after report/notification loading,
          // so a failed import cannot be partially overwritten by live server data.
          const restoredPendingDraft = restorePendingAdminDraft();
          if (restoredPendingDraft) {
              Promise.resolve().then(async () => {
                  try {
                      const retry = await saveState();
                      if (retry && retry.publicSynced && retry.adminSynced) {
                          showNotification('Data lokal yang belum tersimpan berhasil dipulihkan ke Firebase.', 'success', 5000);
                      }
                  } catch (_) {}
              });
          }
          hydrateLocalUiState();
      } catch (e) {
          console.warn('Load separated state error, using safe defaults', e);
          if (!isAdmin()) {
              state.reports = [];
              state.activityLog = [];
              state.nameChangeLog = [];
              state.autoCleanReportDays = 7;
              try { localStorage.removeItem('kelasku-state'); } catch (_) {}
          }
          hydrateLocalUiState();
      }
  }

  function hasAnyJadwalItems(jadwal) {
      if (!jadwal || typeof jadwal !== 'object' || Array.isArray(jadwal)) return false;
      return DAY_NAMES.some(day => Array.isArray(jadwal[day]) && jadwal[day].length > 0);
  }

  // ============================================================
  // PROFILE AVATAR
  // ============================================================
  function avatarStorageKey(){
      return currentUser && currentUser.uid ? 'kelasku-avatar-' + currentUser.uid : '';
  }

  function getStoredAvatar(){
      const key = avatarStorageKey();
      if (!key) return '';
      try { return localStorage.getItem(key) || ''; } catch (_) { return ''; }
  }

  function setAvatarVisual(el, avatarData, initials){
      if (!el) return;
      if (avatarData) {
          el.innerHTML = '<img src="' + avatarData + '" alt="Avatar profil">';
          el.classList.add('has-custom-avatar');
      } else {
          el.textContent = initials || 'TJ';
          el.classList.remove('has-custom-avatar');
      }
  }

  function refreshAvatarUI(){
      const displayName = currentUser ? (currentUser.username || currentUser.email || 'Pengguna') : 'Pengguna';
      const initials = displayName.split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]).join('').toUpperCase() || 'TJ';
      const avatarData = (currentUser && currentUser.avatar) || getStoredAvatar();
      if (currentUser) currentUser.avatar = avatarData || '';
      setAvatarVisual(document.getElementById('dashboard-user-avatar'), avatarData, initials);
      setAvatarVisual(document.getElementById('hero-avatar'), avatarData, initials);
      const preview = document.getElementById('profile-avatar-preview');
      const editor = document.getElementById('profile-avatar-editor');
      if (preview) {
          if (avatarData) preview.innerHTML = '<img src="' + avatarData + '" alt="Avatar profil">';
          else preview.textContent = initials;
      }
      if (editor) editor.classList.toggle('has-custom-avatar', !!avatarData);
  }

  function openAvatarPicker(){
      if (!currentUser) return;
      const input = document.getElementById('profile-avatar-input');
      if (input) input.click();
  }

  function removeAvatar(){
      if (!currentUser) return;
      const key = avatarStorageKey();
      try { if (key) localStorage.removeItem(key); } catch (_) {}
      currentUser.avatar = '';
      refreshAvatarUI();
      showNotification('Avatar profil dihapus.', 'info');
  }

  async function handleAvatarFile(file){
      if (!currentUser || !file) return;
      if (!String(file.type || '').startsWith('image/')) {
          showNotification('Pilih file gambar untuk avatar.', 'warning');
          return;
      }
      if (file.size > 8 * 1024 * 1024) {
          showNotification('Ukuran gambar terlalu besar. Maksimal 8 MB.', 'warning');
          return;
      }
      try {
          const avatarData = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onerror = () => reject(new Error('Gambar tidak bisa dibaca.'));
              reader.onload = () => {
                  const img = new Image();
                  img.onerror = () => reject(new Error('Format gambar tidak dapat diproses.'));
                  img.onload = () => {
                      const size = 256;
                      const canvas = document.createElement('canvas');
                      canvas.width = size; canvas.height = size;
                      const ctx = canvas.getContext('2d');
                      if (!ctx) return reject(new Error('Browser tidak mendukung pemrosesan avatar.'));
                      ctx.fillStyle = '#ffffff';
                      ctx.fillRect(0,0,size,size);
                      const scale = Math.min(size / img.width, size / img.height);
                      const dw = Math.max(1, Math.round(img.width * scale));
                      const dh = Math.max(1, Math.round(img.height * scale));
                      const dx = Math.round((size - dw) / 2);
                      const dy = Math.round((size - dh) / 2);
                      ctx.drawImage(img, dx, dy, dw, dh);
                      let data = '';
                      try { data = canvas.toDataURL('image/webp', 0.82); } catch (_) {}
                      if (!data || !data.startsWith('data:image/')) data = canvas.toDataURL('image/jpeg', 0.82);
                      resolve(data);
                  };
                  img.src = String(reader.result || '');
              };
              reader.readAsDataURL(file);
          });
          if (!avatarData || avatarData.length > 450000) {
              showNotification('Gambar terlalu besar setelah diproses. Coba foto lain.', 'warning');
              return;
          }
          const key = avatarStorageKey();
          if (!key) return;
          try {
              localStorage.setItem(key, avatarData);
          } catch (storageError) {
              showNotification('Avatar tidak bisa disimpan di browser ini.', 'warning');
              return;
          }
          currentUser.avatar = avatarData;
          refreshAvatarUI();
          const input = document.getElementById('profile-avatar-input');
          if (input) input.value = '';
          showNotification('Avatar profil diperbarui.', 'success');
      } catch (e) {
          console.error('Avatar processing failed:', e);
          showNotification(e.message || 'Avatar tidak dapat diproses.', 'error');
      }
  }

  // ============================================================
  // THEME
  // ============================================================
  function toggleTheme() {
      darkMode = !darkMode;
      localStorage.setItem('kelasku-theme', darkMode ? 'dark' : 'light');
      applyTheme();
  }
  function applyTheme() {
      document.body.classList.toggle('dark', darkMode);
      document.getElementById('theme-btn-small').textContent = darkMode ? '☀️' : '🌙';
      const label = document.getElementById('theme-label-setting');
      if (label) label.textContent = darkMode ? 'Terang' : '🌙 Gelap';
  }
  applyTheme();
  // ============================================================
  // AUTH FUNCTIONS
  // ============================================================
  let authMode = 'login';
  function toggleAuthMode() {
      authMode = authMode === 'login' ? 'register' : 'login';
      const namaField = document.getElementById('auth-nama-field');
      const title = document.getElementById('auth-title');
      const sub = document.getElementById('auth-sub');
      const btn = document.getElementById('auth-submit-btn');
      const link = document.getElementById('auth-toggle-link');
      document.getElementById('login-error').style.display = 'none';
      clearEmailVerificationBox();
      const passwordHint = document.getElementById('auth-password-hint');
      const passwordInput = document.getElementById('auth-password');
      if (passwordHint) passwordHint.style.display = authMode === 'register' ? 'block' : 'none';
      if (passwordInput) passwordInput.autocomplete = authMode === 'register' ? 'new-password' : 'current-password';
      if (authMode === 'register') {
          namaField.style.display = 'block';
          title.textContent = 'Buat Akun Baru 📝';
          sub.textContent = 'Daftar dengan email untuk mulai menggunakan aplikasi';
          btn.textContent = 'Daftar Sekarang →';
          link.textContent = 'Sudah punya akun? Masuk';
      } else {
          namaField.style.display = 'none';
          title.textContent = 'Selamat datang 👋';
          sub.textContent = 'Masuk dengan email untuk mengakses dasbor kelas';
          btn.textContent = 'Masuk ke Kelas →';
          link.textContent = 'Belum punya akun? Daftar';
      }
  }
  function authErrorMessage(code) {
      const map = {
          'auth/invalid-email': 'Format email tidak valid.',
          'auth/user-disabled': 'Akun ini telah dinonaktifkan.',
          'auth/user-not-found': 'Email belum terdaftar.',
          'auth/wrong-password': 'Password salah.',
          'auth/invalid-credential': 'Email atau password salah.',
          'auth/email-already-in-use': 'Email sudah terdaftar. Silakan masuk.',
          'auth/weak-password': 'Password terlalu lemah.',
          'auth/password-does-not-meet-requirements': 'Password belum memenuhi kebijakan keamanan.',
          'auth/requires-recent-login': 'Silakan lakukan verifikasi keamanan lagi.',
          'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi nanti.',
          'auth/network-request-failed': 'Koneksi internet bermasalah.'
      };
      return map[code] || 'Terjadi kesalahan. Coba lagi.';
  }
  async function doAuthSubmit() {
      const email = document.getElementById('auth-email').value.trim();
      const password = document.getElementById('auth-password').value;
      const errorEl = document.getElementById('login-error');
      errorEl.style.color = 'var(--rose)';
      errorEl.style.display = 'none';
      clearEmailVerificationBox();
      if (!email || !password) { showNotification('Email dan password wajib diisi.', 'error'); return; }
      if (authMode === 'register') {
          const policy = await validateKelaskuPassword(password);
          if (!policy.valid) {
              showNotification(policy.message, 'warning', 4500);
              return;
          }
      }
      const btn = document.getElementById('auth-submit-btn');
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Memproses...';
      try {
          if (authMode === 'register') {
              pendingRegisterName = document.getElementById('auth-nama').value.trim();
              const cred = await auth.createUserWithEmailAndPassword(email, password);
              if (pendingRegisterName) {
                  try { await cred.user.updateProfile({ displayName: pendingRegisterName }); } catch (e) {}
              }
              showNotification('Akun berhasil dibuat.', 'success');
          } else {
              await auth.signInWithEmailAndPassword(email, password);
          }
      } catch (e) {
          showNotification(authErrorMessage(e.code), 'error');
      } finally {
          btn.disabled = false;
          btn.textContent = originalText;
      }
  }
  async function doForgotPassword() {
      const email = document.getElementById('auth-email').value.trim();
      if (!email) { showNotification('Isi email dulu untuk reset password.', 'warning'); return; }
      try {
          await auth.sendPasswordResetEmail(email);
          showNotification('Link reset password telah dikirim ke email kamu.', 'success');
      } catch (e) {
          showNotification(authErrorMessage(e.code), 'error');
      }
  }
  async function logout() {
      const statusEl = document.getElementById('auth-status');
      const emailEl = document.getElementById('auth-email');
      const passwordEl = document.getElementById('auth-password');
      try {
          if (typeof stopSeparatedSync === 'function') stopSeparatedSync();
          separatedSyncUnsubs = [];
          reportSyncUnsub = null;
          notificationSyncUnsub = null;
          currentUser = null;
          authReady = false;
          liveSyncStarted = false;
          if (statusEl) {
              statusEl.textContent = 'Keluar...';
              statusEl.style.color = 'var(--text-soft)';
          }
          // Give the UI an immediate deterministic logged-out state.
          showLogin();
          document.body.classList.remove('is-admin','is-superadmin');
          if (emailEl) emailEl.value = '';
          if (passwordEl) passwordEl.value = '';
          const errEl = document.getElementById('login-error');
          if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }

          // Firebase Auth signOut clears its persisted auth session.
          if (auth.currentUser) await auth.signOut();

          if (statusEl) statusEl.textContent = 'Belum login';
          // Reload only after successful sign-out so every in-memory listener/state is reset.
          setTimeout(() => {
              try { window.location.replace(window.location.href.split('#')[0]); }
              catch (_) { window.location.reload(); }
          }, 80);
      } catch (e) {
          console.error('Logout error:', e);
          // Even if network/Firebase has a transient problem, do not leave an apparently
          // logged-in UI on screen. Re-check Auth and keep the login gate visible.
          if (auth.currentUser) {
              showNotification('Gagal keluar dari akun. Coba lagi.', 'error', 4500);
              hideLogin();
          } else {
              currentUser = null;
              authReady = false;
              showLogin();
              if (statusEl) statusEl.textContent = 'Belum login';
          }
      }
  }
  function isAdmin() { return currentUser && (currentUser.role === 'superadmin' || currentUser.role === 'admin'); }
  function isSuperAdmin() { return currentUser && currentUser.role === 'superadmin'; }
  function isReadOnly() { return !currentUser || currentUser.role === 'siswa'; }
  function applyRole(role) {
      document.body.classList.toggle('is-admin', role === 'superadmin' || role === 'admin');
      document.body.classList.toggle('is-superadmin', role === 'superadmin');
      document.getElementById('account-whoami').textContent = currentUser ? currentUser.username : '';
      let roleLabel = '';
      if (role === 'superadmin') roleLabel = 'Super Admin (Akses Penuh + Kelola Akun)';
      else if (role === 'admin') roleLabel = 'Admin (Akses Penuh, Tanpa Kelola Akun)';
      else roleLabel = 'Siswa';
      document.getElementById('account-role-label').textContent = roleLabel;
  }
  function guardReadOnly() {
      if (!currentUser || isReadOnly()) {
          showNotification('Fitur ini hanya untuk Admin atau Super Admin.', 'error');
          return true;
      }
      return false;
  }
  function guardAccountManagement() {
      if (!isSuperAdmin()) {
          showNotification('Hanya Super Admin yang dapat mengelola akun.', 'error');
          return true;
      }
      return false;
  }

  function requireRecentReauthentication(actionLabel) {
      if (!currentUser || !isAdmin()) {
          showNotification('Akses ditolak.', 'error');
          return Promise.resolve(false);
      }

      const user = auth.currentUser;
      if (!user || !user.email) {
          showNotification('Sesi login tidak tersedia.', 'error');
          return Promise.resolve(false);
      }

      const hasPasswordProvider = Array.isArray(user.providerData)
          && user.providerData.some(p => p.providerId === 'password');

      if (!hasPasswordProvider) {
          showNotification('Verifikasi ulang dengan password hanya tersedia untuk akun Email/Password.', 'warning', 5000);
          return Promise.resolve(false);
      }

      return new Promise(resolve => {
          reauthResolver = resolve;
          const actionText = document.getElementById('reauth-action-text');
          const errorEl = document.getElementById('reauth-error');
          const passwordEl = document.getElementById('reauth-password');
          if (actionText) actionText.textContent = 'Untuk ' + actionLabel + ', masukkan password akun Super Admin/Admin kamu.';
          if (errorEl) {
              errorEl.textContent = '';
              errorEl.style.display = 'none';
          }
          if (passwordEl) {
              passwordEl.value = '';
              passwordEl.onkeydown = event => {
                  if (event.key === 'Enter') confirmReauthentication();
              };
          }
          openModal('reauth');
          setTimeout(() => {
              if (passwordEl) passwordEl.focus();
          }, 50);
      });
  }

  function finishReauthentication(result) {
      const resolver = reauthResolver;
      reauthResolver = null;
      closeModal('reauth');
      if (resolver) resolver(result);
  }

  function cancelReauthentication() {
      finishReauthentication(false);
  }

  async function confirmReauthentication() {
      const errorEl = document.getElementById('reauth-error');
      const passwordEl = document.getElementById('reauth-password');
      const password = passwordEl ? passwordEl.value : '';
      const user = auth.currentUser;

      if (!user || !user.email) {
          if (errorEl) {
              errorEl.textContent = 'Sesi login tidak tersedia.';
              errorEl.style.display = 'block';
          }
          return;
      }

      if (!password) {
          if (errorEl) {
              errorEl.textContent = 'Masukkan password terlebih dahulu.';
              errorEl.style.display = 'block';
          }
          return;
      }

      try {
          const credential = firebase.auth.EmailAuthProvider.credential(
              user.email,
              password
          );

          await user.reauthenticateWithCredential(credential);
          await user.getIdToken(true);
          showNotification('Verifikasi keamanan berhasil.', 'success');
          finishReauthentication(true);
      } catch (e) {
          if (errorEl) {
              errorEl.textContent = authErrorMessage(e.code);
              errorEl.style.display = 'block';
          }
      }
  }
  // ============================================================
  // RESET
  // ============================================================
  async function resetData() {
      if (guardAccountManagement()) return;
      if (!confirm('Reset semua data ke default? Semua kas, siswa, tugas, dan piket akan hilang. Tindakan ini tidak bisa dibatalkan.')) return;
      if (!(await requireRecentReauthentication('mereset semua data kelas'))) return;
      if (driveStorageEnabled()) {
          try { await driveApiRequest({ action:'cleanup-all' }); }
          catch (e) { console.warn('Drive cleanup before reset failed:', e); showNotification('⚠️ Data aplikasi akan direset, tetapi sebagian file Drive belum bisa dipindahkan ke Trash: ' + (e.message || 'error'), 'warning', 6000); }
      }
      localStorage.removeItem('kelasku-state');
      localStorage.removeItem('kelasku-local');
      const todayStr = todayKey();
      state = {
          kas: [],
          kasFolders: [],
          students: ["Aldio Adistya", "Bagas Saputra", "Citra Ramadhani", "Dwi Lestari", "Eka Prasetyo", "Fajar Nugraha", "Gita Anggraini", "Hendra Wijaya"],
          hp: {},
          piket: {},
          piketJadwal: {},
          piketTaskList: ['Bersihkan lantai', 'Buang sampah', 'Tutup jendela', 'Rapikan meja dan kursi', 'Rapikan papan tulis', 'Matikan lampu', 'Susun kursi dengan rapi', 'Periksa kebersihan kelas'],
          piketTaskConfig: { 'Bersihkan lantai': 2, 'Buang sampah': 1, 'Tutup jendela': 1, 'Rapikan meja dan kursi': 1, 'Rapikan papan tulis': 1, 'Matikan lampu': 1, 'Susun kursi dengan rapi': 1, 'Periksa kebersihan kelas': 1 },
          piketRotationMode: 'auto',
          piketWeeklyAssignments: {},
          tugas: [],
          jadwal: {
              Senin: [{ jam: "07:15-08:45", mapel: "Matematika", guru: "Bu Rina" }],
              Selasa: [{ jam: "07:15-08:45", mapel: "Administrasi Jaringan", guru: "Pak Budi" }],
              Rabu: [{ jam: "07:15-07:45", mapel: "Projek IPAS", guru: "Bu Hanadi" }],
              Kamis: [{ jam: "07:15-08:45", mapel: "Pemrograman Web", guru: "Pak Reza" }],
              Jumat: [{ jam: "07:15-08:45", mapel: "Pendidikan Agama", guru: "Pak Yusuf" }]
          },
          pengumuman: [],
          reports: [],
          notifications: [],
          activityLog: [],
          jadwalMode: 'pelajaran',
          selectedDay: 'Senin',
          calMinimized: { hp: false, piket: false },
          kasFolderMinimized: {},
          hpSelectedDate: todayStr,
          piketSelectedDate: todayStr,
          nameChangeLog: []
      };
      DAY_NAMES.forEach(day => { state.piketJadwal[day] = []; });
      ensureRecord(state.hp, todayStr);
      ensureRecord(state.piket, todayStr);
      await saveState();
      location.reload();
  }
  function clearLocalData() {
      if (!confirm('Hapus cache lokal?')) return;
      localStorage.removeItem('kelasku-state');
      localStorage.removeItem('kelasku-local');
      location.reload();
  }
  // ============================================================
  // FIRESTORE SYNC COMPATIBILITY / ERROR HANDLING
  // ============================================================
  let firestorePermissionNoticeShown = false;
  function isFirestorePermissionError(error) {
      const code = String(error && error.code || '').toLowerCase();
      const message = String(error && error.message || error || '').toLowerCase();
      return code.includes('permission-denied')
          || message.includes('missing or insufficient permissions')
          || message.includes('permission-denied');
  }
  function notifyFirestorePermissionOnce() {
      if (firestorePermissionNoticeShown) return;
      firestorePermissionNoticeShown = true;
      showNotification('Sinkronisasi server terbatas. Data lokal tetap dipertahankan.', 'warning', 5000);
  }
  function handleFirestoreSyncError(error, label) {
      if (isFirestorePermissionError(error)) {
          console.warn(label + ': akses Firestore ditolak; sinkronisasi bagian ini dilewati.');
          notifyFirestorePermissionOnce();
          return;
      }
      console.warn(label + ':', error);
  }

  // ============================================================
  // WATCH LIVE SYNC
  // ============================================================
  let liveSyncStarted = false;
  function stopSeparatedSync(){
      separatedSyncUnsubs.forEach(fn=>{try{fn();}catch(_) {}});
      separatedSyncUnsubs = [];
      if (reportSyncUnsub) { try{reportSyncUnsub();}catch(_){} reportSyncUnsub = null; }
      if (notificationSyncUnsub) { try{notificationSyncUnsub();}catch(_){} notificationSyncUnsub = null; }
      liveSyncStarted = false;
  }
  function mergePublicAndCurrentState(saved){
      if (!saved || typeof saved !== 'object') return;
      const incomingRevision = Number(saved.__kelaskuRevision) || 0;
      const currentRevision = Number(state.__kelaskuRevision) || 0;
      // Ignore an older onSnapshot event. This prevents a stale cached snapshot
      // from replacing a freshly imported/saved state immediately after reload.
      if (currentRevision > 0 && incomingRevision < currentRevision) return;
      const keepSensitive = {
          reports: state.reports,
          activityLog: state.activityLog,
          nameChangeLog: state.nameChangeLog,
          autoCleanReportDays: state.autoCleanReportDays
      };
      state = Object.assign(state, saved, keepSensitive);
      hydrateLocalUiState();
  }
  function mergeAdminState(saved){
      if (!saved || typeof saved !== 'object') return;
      const incomingRevision = Number(saved.__kelaskuRevision) || 0;
      const currentRevision = Number(state.__kelaskuRevision) || 0;
      if (currentRevision > 0 && incomingRevision < currentRevision) return;
      state = Object.assign(state, saved);
      hydrateLocalUiState();
  }
  function mergeNotificationSnapshot(extra){
      const publicNotifications = (state.notifications || []).filter(n => !n.targetUid && n.targetRole !== 'staff');
      const seen = new Set();
      const merged = [];
      [...publicNotifications, ...(extra || [])].forEach(n => {
          if (!n || n.id == null) return;
          const key = String(n.id);
          if (seen.has(key)) return;
          seen.add(key);
          merged.push(n);
      });
      merged.sort((a,b)=>(b.at||0)-(a.at||0));
      state.notifications = merged.slice(0,100);
  }
  function watchReportsSync(){
      if (!currentUser || reportSyncUnsub) return;
      let query = db.collection(FS_REPORTS);
      if (!isAdmin()) query = query.where('authorUid', '==', currentUser.uid);
      reportSyncUnsub = query.onSnapshot((snap)=>{
          state.reports = snap.docs.map(doc => ({ id: Number(doc.id) || doc.id, ...doc.data() }));
          state.reports.sort((a,b)=>Number(b.createdAt||b.id||0)-Number(a.createdAt||a.id||0));
          _loadedReportIds = new Set(state.reports.map(r=>String(r.id)));
          ensureAppFeatures();
          if(document.getElementById('login-overlay').style.display === 'none'){
              renderReports();
              renderBeranda();
          }
      }, (e)=>handleFirestoreSyncError(e, 'Report live sync error'));
  }
  function watchNotificationsSync(){
      if (!currentUser || notificationSyncUnsub) return;
      let query = db.collection(FS_NOTIFICATIONS);
      if (isAdmin()) query = query.where('targetRole', '==', 'staff');
      else query = query.where('targetUid', '==', currentUser.uid);
      notificationSyncUnsub = query.onSnapshot((snap)=>{
          mergeNotificationSnapshot(snap.docs.map(doc=>doc.data()));
          if(document.getElementById('login-overlay').style.display === 'none') renderNotifications();
      }, (e)=>handleFirestoreSyncError(e, 'Notification live sync error'));
  }
  function watchLiveSync() {
      if (!authReady || liveSyncStarted || !currentUser) return;
      liveSyncStarted = true;

      const publicUnsub = db.collection(FS_PUBLIC).doc(PUBLIC_STATE_DOC).onSnapshot((snap) => {
          if (!snap.exists || !snap.data().value) return;
          try {
              mergePublicAndCurrentState(JSON.parse(snap.data().value));
              if (document.getElementById('login-overlay').style.display === 'none') renderAll();
          } catch (e) { handleFirestoreSyncError(e, 'Public sync parse error'); }
      }, (e)=>handleFirestoreSyncError(e, 'Public state sync error'));
      separatedSyncUnsubs.push(publicUnsub);

      if (isAdmin()) {
          const adminUnsub = db.collection(FS_ADMIN).doc(ADMIN_STATE_DOC).onSnapshot((snap) => {
              if (!snap.exists || !snap.data().value) return;
              try {
                  mergeAdminState(JSON.parse(snap.data().value));
                  if (document.getElementById('login-overlay').style.display === 'none') renderAll();
              } catch (e) { handleFirestoreSyncError(e, 'Admin state sync error'); }
          }, (e)=>console.warn('Admin state sync error:',e));
          separatedSyncUnsubs.push(adminUnsub);
      }

      watchReportsSync();
      watchNotificationsSync();
  }
  // ============================================================
  // FUNGSI UTILITY

  // ============================================================
  function todayKey() {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dateKeyOf(y, m, d) {
      return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  function dayNameOf(dateKey) {
      const [y, m, d] = dateKey.split('-').map(Number);
      return FULL_DAY_NAMES[new Date(y, m - 1, d).getDay()];
  }
  function rupiah(n) {
      return "Rp " + Math.round(n).toLocaleString('id-ID');
  }
  function ensureRecord(dict, dateKey) {
      if (!dict[dateKey]) dict[dateKey] = {};
      return dict[dateKey];
  }
  function rosterStatusOf(v) {
      if (v === undefined || v === null) return null;
      if (v === true) return { status: 'sudah', alasan: '' };
      if (v === false) return { status: 'belum', alasan: '' };
      if (typeof v === 'object') return { status: v.status || 'belum', alasan: v.alasan || '' };
      return null;
  }
  function rosterIsSudah(v) {
      const s = rosterStatusOf(v);
      return !!s && s.status === 'sudah';
  }
  // ============================================================
  // FITUR UTAMA: NOTIFIKASI, AKTIVITAS, PENCARIAN
  // ============================================================
  function escapeHtml(value){return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function jsString(value){return escapeHtml(JSON.stringify(String(value==null?'':value)));}
  function ensureAppFeatures(){
      if(!Array.isArray(state.notifications))state.notifications=[];
      if(!Array.isArray(state.activityLog))state.activityLog=[];
      if(!Array.isArray(state.reports))state.reports=[];
      if(!Array.isArray(state.kasFolders))state.kasFolders=[];
      state.kasFolders.forEach(folder=>{
          if(!folder.id)folder.id=Date.now()+Math.random();
          if(!Array.isArray(folder.students))folder.students=[];
          if(!folder.createdAt)folder.createdAt=Date.now();
          if(!folder.name)folder.name='Kas Siswa';
          if(!state.kasFolderMinimized || typeof state.kasFolderMinimized !== 'object')state.kasFolderMinimized={};
          if(state.kasFolderMinimized[String(folder.id)]===undefined)state.kasFolderMinimized[String(folder.id)]=true;
          state.students.forEach(name=>{
              if(!folder.students.some(x=>x.name===name))folder.students.push({name,status:'belum',jumlah:0,tanggal:''});
          });
      });
      state.reports.forEach(r=>{
          if(!Array.isArray(r.statusHistory))r.statusHistory=[];
          if(!r.statusHistory.length)r.statusHistory.push({status:r.status||'pending',at:r.createdAt||Date.now(),by:r.pelapor||'Siswa'});
          if(!r.reportCode)r.reportCode='LAP-'+String(r.id||Date.now()).slice(-6);
          if(r.tanggapan==null)r.tanggapan='';
          if(r.pelapor==='Anonim')r.pelapor='Siswa';
          delete r.anonim;
      });
  }
  function addActivity(action,detail){
      if(!currentUser)return;ensureAppFeatures();
      state.activityLog.unshift({id:Date.now()+Math.random(),at:Date.now(),byUid:currentUser.uid,by:currentUser.username||currentUser.email||'Pengguna',role:currentUser.role,action,detail});
      state.activityLog=state.activityLog.slice(0,100);
  }
  function addNotification(title,text,target){
      ensureAppFeatures();
      const n = {
          id: Date.now() + Math.random(),
          at: Date.now(),
          title: String(title || '').slice(0, 200),
          text: String(text || '').slice(0, 1000),
          targetUid: target && target.uid ? target.uid : null,
          targetRole: target && target.role ? target.role : null,
          readBy: [],
          createdByUid: currentUser ? currentUser.uid : null
      };
      state.notifications.unshift(n);
      state.notifications = state.notifications.slice(0, 100);
      return n;
  }
  function notificationForMe(n){
      if(!currentUser)return false;
      return (!n.targetUid&&!n.targetRole)
          || n.targetUid===currentUser.uid
          || n.targetRole===currentUser.role
          || (n.targetRole==='staff'&&isAdmin());
  }
  function getMyNotifications(){
      ensureAppFeatures();
      return state.notifications.filter(notificationForMe).sort((a,b)=>b.at-a.at);
  }
  function renderNotifications(){
      const list=document.getElementById('home-notifications'),badge=document.getElementById('home-notify-badge');
      if(!list)return;
      const items=getMyNotifications();
      const unread=items.filter(n=>!(n.readBy||[]).includes(currentUser?currentUser.uid:'')).length;
      if(badge){badge.textContent=unread+' baru';badge.style.display=unread?'inline-block':'none';}
      if(!items.length){list.innerHTML='<div class="empty">Belum ada notifikasi.</div>';return;}
      list.innerHTML=items.slice(0,6).map(n=>{
          const read=(n.readBy||[]).includes(currentUser?currentUser.uid:'');
          return `<div class="notify-item ${read?'read':'unread'}" onclick="markNotificationRead('${String(n.id).replace(/'/g,"\\'")}')"><div class="notify-dot"></div><div style="flex:1;min-width:0"><div class="notify-title">${escapeHtml(n.title)}</div><div class="notify-text">${escapeHtml(n.text)}</div><div class="notify-time">${escapeHtml(new Date(n.at).toLocaleString('id-ID'))}</div></div></div>`;
      }).join('');
  }
  async function markNotificationRead(id){
      const n=state.notifications.find(x=>String(x.id)===String(id));
      if(!n||!currentUser)return;
      if(!Array.isArray(n.readBy))n.readBy=[];
      if(!n.readBy.includes(currentUser.uid))n.readBy.push(currentUser.uid);

      if(n.targetUid || n.targetRole === 'staff'){
          try{
              await db.collection(FS_NOTIFICATIONS).doc(String(n.id)).update({
                  readBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
              });
          }catch(e){console.warn('Notification read sync failed:',e);}
      } else {
          saveState();
      }
      renderNotifications();
  }
  async function markAllNotificationsRead(){
      if(!currentUser)return;
      const items=getMyNotifications();
      const privateItems=[];
      items.forEach(n=>{
          if(!Array.isArray(n.readBy))n.readBy=[];
          if(!n.readBy.includes(currentUser.uid))n.readBy.push(currentUser.uid);
          if(n.targetUid || n.targetRole === 'staff') privateItems.push(n);
      });

      for(const n of privateItems){
          try{
              await db.collection(FS_NOTIFICATIONS).doc(String(n.id)).update({
                  readBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
              });
          }catch(e){console.warn('Notification read sync failed:',e);}
      }
      saveState();
      renderNotifications();
  }
  function getCurrentStudentName(){
      const username=(currentUser&&currentUser.username||'').trim().toLocaleLowerCase('id-ID');
      return (state.students||[]).find(name=>String(name).trim().toLocaleLowerCase('id-ID')===username)||null;
  }
  function progressStatus(done,positive,negative){return done?positive:negative;}
  function renderMyProgressAndAchievements(){const section=document.getElementById('my-progress-achievements');if(section) section.remove();}
  function renderActivityLog(){
      const list=document.getElementById('activity-log-list');
      if(!list)return;
      if(!isAdmin()){list.innerHTML='';return;}
      const rows=(state.activityLog||[]).slice().sort((a,b)=>b.at-a.at).slice(0,30);
      list.innerHTML=rows.length?rows.map(a=>`<div class="activity-row"><div class="activity-main"><b>${escapeHtml(a.by)}</b> — ${escapeHtml(a.action)}</div><div class="activity-meta">${escapeHtml(a.detail||'')} · ${new Date(a.at).toLocaleString('id-ID')}</div></div>`).join(''):'<div class="empty">Belum ada aktivitas.</div>';
  }
  function globalSearchTypeLabel(type){return({student:'Siswa',task:'Tugas',report:'Laporan',announcement:'Pengumuman',schedule:'Jadwal'})[type]||type;}
  function renderGlobalSearch(){
      const input=document.getElementById('global-search-input'),wrap=document.getElementById('global-search-results');if(!input||!wrap)return;const q=input.value.trim().toLowerCase();if(!q){wrap.innerHTML='';return;}const results=[];
      state.students.forEach(name=>{if(name.toLowerCase().includes(q))results.push({type:'student',id:name,title:name,sub:'Siswa'});});
      state.tugas.forEach(t=>{if((t.nama||'').toLowerCase().includes(q)||(t.mapel||'').toLowerCase().includes(q))results.push({type:'task',id:t.id,title:t.nama,sub:'Tugas · '+(t.mapel||'Tanpa mapel')});});
      state.reports.filter(r=>isAdmin()||r.authorUid===(currentUser&&currentUser.uid)).forEach(r=>{if((r.judul||'').toLowerCase().includes(q)||(r.reportCode||'').toLowerCase().includes(q)||(r.pelapor||'').toLowerCase().includes(q))results.push({type:'report',id:r.id,title:r.reportCode||reportCode(r),sub:'Laporan · '+r.judul});});
      state.pengumuman.forEach(p=>{const title=String(p.judul||p.title||'Pengumuman');const desc=String((p.deskripsi!==undefined?p.deskripsi:p.text)||'');if((title+' '+desc).toLowerCase().includes(q))results.push({type:'announcement',id:p.id,title,sub:desc});});
      Object.keys(state.jadwal||{}).forEach(day=>(state.jadwal[day]||[]).forEach(j=>{if((j.mapel||'').toLowerCase().includes(q)||(j.guru||'').toLowerCase().includes(q)||day.toLowerCase().includes(q))results.push({type:'schedule',id:j.id,title:j.mapel,sub:day+' · '+j.jam+' · '+(j.guru||'')});}));
      if(!results.length){wrap.innerHTML='<div class="empty">Tidak ada hasil.</div>';return;}
      wrap.innerHTML=results.slice(0,8).map(r=>`<div class="global-search-item" onclick='openGlobalSearchResult(${jsString(r.type)},${jsString(r.id)})'><div style="font-size:16px">${r.type==='student'?'🎓':r.type==='task'?'📝':r.type==='report'?'📋':r.type==='announcement'?'📢':'📅'}</div><div class="gsi-main"><div class="gsi-title">${escapeHtml(r.title)}</div><div class="gsi-sub">${escapeHtml(globalSearchTypeLabel(r.type))} · ${escapeHtml(r.sub)}</div></div></div>`).join('');
  }
  function openGlobalSearchResult(type,id){const input=document.getElementById('global-search-input'),results=document.getElementById('global-search-results');if(input)input.value='';if(results)results.innerHTML='';if(type==='task'){goTo('tugas');openTugasModal(Number(id));}else if(type==='report'){goTo('laporan');openReportModal(Number(id));}else if(type==='announcement'){goTo('beranda'); if(isAdmin()) setTimeout(()=>openPengumumanModal(Number(id)),50);}else if(type==='schedule'){goTo('jadwal');}else if(type==='student'){goTo('hp');const h=document.getElementById('hp-search');if(h){h.value=id;rosterUI.hp.search=id;renderHp();}}}
  // ============================================================
  // RENDER FUNGSI LENGKAP
  // ============================================================
  let calYear = 2026, calMonth = 8, piketCalYear = 2026, piketCalMonth = 8;
  function safeRender(fn, label) {
      try {
          if (typeof fn === 'function') fn();
      } catch (e) {
          console.error('Render ' + label + ' gagal:', e);
      }
  }
  function renderAll() {
      // Render satu per satu. Jadi jika modul lain error, Jadwal tetap hidup.
      safeRender(renderBeranda, 'Beranda');
      safeRender(renderKas, 'Kas');
      safeRender(renderKasSiswa, 'Kas Siswa');
      safeRender(renderHpCalendar, 'Kalender HP');
      safeRender(renderHp, 'HP');
      safeRender(renderPiketCalendar, 'Kalender Piket');
      safeRender(renderPiket, 'Piket');
      safeRender(renderDayTabs, 'Tab Hari Jadwal');
      safeRender(renderJadwalList, 'Daftar Jadwal');
      safeRender(renderTugas, 'Tugas');
      safeRender(renderReports, 'Laporan');
      safeRender(renderNotifications, 'Notifikasi');
      safeRender(renderActivityLog, 'Aktivitas');
      safeRender(renderAccountList, 'Manajemen Pengguna');
      safeRender(renderSettingsInfo, 'Pengaturan');
  }
  function renderSettingsInfo() {
      const input = document.getElementById('autoclean-days-input');
      if (input) input.value = (state.autoCleanTugasDays !== undefined && state.autoCleanTugasDays !== null) ? state.autoCleanTugasDays : 7;
      const reportInput = document.getElementById('autoclean-report-days-input');
      if (reportInput) reportInput.value = (state.autoCleanReportDays !== undefined && state.autoCleanReportDays !== null) ? state.autoCleanReportDays : 7;
      renderStorageUsage();
      updateAttachmentHints();
      // Jangan memanggil Google Drive saat render awal/login.
      // Pemeriksaan Drive dilakukan hanya ketika benar-benar dibutuhkan (upload/migrasi).
      const migrateBtn = document.getElementById('drive-migrate-btn');
      const migrationStatusEl = document.getElementById('drive-migration-status');
      if (migrateBtn) {
          migrateBtn.disabled = !driveStorageEnabled() || !isAdmin();
          migrateBtn.title = driveStorageEnabled() ? 'Pindahkan lampiran Base64 lama ke Google Drive' : 'Isi KELASKU_DRIVE_API_URL di index.html terlebih dahulu';
          if (driveStorageEnabled() && isAdmin()) {
              const counts = countLegacyDriveAttachments();
              if (counts.total > 0) {
                  migrateBtn.style.display = '';
                  migrateBtn.textContent = '☁️ Migrasikan ' + counts.total + ' lampiran lama ke Drive';
                  migrateBtn.disabled = false;
                  if (migrationStatusEl) migrationStatusEl.textContent = '⚠️ ' + counts.total + ' lampiran masih tersimpan sebagai data lama/Base64 (' + counts.ready + ' siap dipindahkan). File yang sudah di Google Drive tidak akan diupload ulang.';
              } else {
                  migrateBtn.style.display = '';
                  migrateBtn.textContent = '✅ Semua lampiran sudah di Google Drive';
                  migrateBtn.disabled = true;
                  if (migrationStatusEl) migrationStatusEl.textContent = '✅ Migrasi sudah selesai. Tidak ada lampiran Base64 lama yang tersisa pada data aplikasi.';
              }
          } else if (migrationStatusEl) {
              migrationStatusEl.textContent = driveStorageEnabled() ? 'Login sebagai Admin untuk memeriksa migrasi.' : 'Hubungkan Google Drive terlebih dahulu.';
          }
      }
      renderActivityLog();
  }
  const FIRESTORE_DOC_LIMIT_BYTES = 1024 * 1024;
  const LEGACY_ATTACHMENT_BYTES = 250 * 1024;
  const DRIVE_ATTACHMENT_BYTES = 10 * 1024 * 1024;
  function driveStorageEnabled() {
      return typeof KELASKU_DRIVE_API_URL === 'string'
          && /^https:\/\/script\.google\.com\/macros\/s\/[^\s]+\/exec(?:\?.*)?$/.test(KELASKU_DRIVE_API_URL.trim());
  }
  function formatStorageBytes(bytes) {
      const n = Number(bytes || 0);
      if (!Number.isFinite(n) || n < 0) return '-';
      const units = ['B','KB','MB','GB','TB'];
      let value = n, idx = 0;
      while (value >= 1024 && idx < units.length - 1) { value /= 1024; idx++; }
      const decimals = idx >= 3 ? 2 : (idx >= 1 ? 0 : 0);
      return value.toFixed(decimals) + ' ' + units[idx];
  }
  function updateAttachmentHints() {
      const max = driveStorageEnabled() ? DRIVE_ATTACHMENT_BYTES : LEGACY_ATTACHMENT_BYTES;
      const maxText = formatStorageBytes(max);
      const suffix = driveStorageEnabled() ? ' Google Drive aktif.' : ' Drive belum aktif, jadi mode lama lebih kecil.';
      const taskHint = document.getElementById('tugas-file-hint');
      const reportHint = document.getElementById('report-file-hint');
      const kasHint = document.getElementById('kas-file-hint');
      if (taskHint) taskHint.textContent = 'Maks 3 file, masing-masing ' + maxText + '.' + suffix;
      if (reportHint) reportHint.textContent = 'Maks ' + maxText + ' per laporan.' + suffix;
      if (kasHint) kasHint.textContent = 'Maks ' + maxText + '. Saat edit, kosongkan jika ingin mempertahankan lampiran lama.' + suffix;
  }
  function renderStorageUsage() {
      const labelEl = document.getElementById('storage-usage-label');
      const percentEl = document.getElementById('storage-usage-percent');
      const barEl = document.getElementById('storage-usage-bar');
      const hintEl = document.getElementById('storage-usage-hint');
      const statusEl = document.getElementById('drive-connection-status');
      if (!labelEl || !barEl) return;

      updateAttachmentHints();

      // Selalu tampilkan ukuran data aplikasi Firestore agar panel tidak kosong
      // ketika kapasitas Google Drive belum berhasil dibaca.
      let usedBytes = 0;
      try {
          usedBytes = new Blob([JSON.stringify(state)]).size;
      } catch (e) {
          try { usedBytes = JSON.stringify(state).length; } catch (_) { usedBytes = 0; }
      }

      const percent = Math.min(100, Math.round((usedBytes / FIRESTORE_DOC_LIMIT_BYTES) * 100));
      labelEl.textContent = formatStorageBytes(usedBytes) + ' / 1 MB';
      percentEl.textContent = percent + '%';
      barEl.style.width = percent + '%';

      if (driveStorageEnabled()) {
          barEl.style.background = 'var(--teal)';
          percentEl.style.color = 'var(--teal)';
          if (hintEl) {
              hintEl.textContent = 'Google Drive aktif. Angka di atas menunjukkan ukuran data aplikasi Firestore; kapasitas Drive akan ditampilkan setelah berhasil diperiksa.';
          }
          if (statusEl) {
              statusEl.textContent = 'Status Drive: terhubung — memeriksa kapasitas…';
              statusEl.style.color = 'var(--teal)';
          }
          return;
      }

      let color = 'var(--teal)';
      let hint = 'Mode lama: lampiran dapat tersimpan sebagai Base64 di Firestore dan lebih cepat memenuhi batas dokumen.';
      if (percent >= 90) {
          color = 'var(--rose)';
          hint = 'Firestore hampir penuh. Hubungkan Google Drive lalu migrasikan lampiran lama.';
      } else if (percent >= 70) {
          color = 'var(--amber)';
          hint = 'Firestore mulai mendekati batas. Hubungkan Google Drive agar file besar tidak masuk ke dokumen.';
      }
      barEl.style.background = color;
      percentEl.style.color = color;
      if (hintEl) hintEl.textContent = hint;
      if (statusEl) {
          statusEl.textContent = 'Status Drive: belum dikonfigurasi';
          statusEl.style.color = 'var(--amber)';
      }
  }
  async function driveApiRequest(payload) {
      if (!driveStorageEnabled()) throw new Error('Google Drive belum dikonfigurasi.');
      const user = auth.currentUser;
      if (!user) throw new Error('Sesi login tidak tersedia.');
      if (!payload || typeof payload !== 'object' || !KELASKU_DRIVE_ALLOWED_ACTIONS.has(String(payload.action || ''))) {
          throw new Error('Permintaan Google Drive tidak valid.');
      }
      const idToken = await user.getIdToken(false);
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 20000) : null;
      try {
          const response = await fetch(KELASKU_DRIVE_API_URL.trim(), {
              method: 'POST',
              redirect: 'follow',
              credentials: 'omit',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify(Object.assign({}, payload, { idToken })),
              signal: controller ? controller.signal : undefined
          });
          if (!response.ok) {
              throw new Error('Google Drive tidak dapat memproses permintaan.');
          }
          const responseText = await response.text();
          let data;
          try { data = JSON.parse(responseText); } catch (e) { throw new Error('Respons Google Drive tidak valid.'); }
          if (!data || data.ok !== true) throw new Error('Google Drive tidak dapat memproses permintaan.');
          return data;
      } catch (e) {
          if (e && e.name === 'AbortError') throw new Error('Koneksi Google Drive terlalu lama. Coba lagi.');
          throw e instanceof Error ? e : new Error('Google Drive tidak dapat diakses.');
      } finally {
          if (timeoutId) clearTimeout(timeoutId);
      }
  }
  async function refreshDriveStorageUsage() {
      if (!isAdmin() || !driveStorageEnabled()) return;
      const labelEl = document.getElementById('storage-usage-label');
      const percentEl = document.getElementById('storage-usage-percent');
      const barEl = document.getElementById('storage-usage-bar');
      const hintEl = document.getElementById('storage-usage-hint');
      const statusEl = document.getElementById('drive-connection-status');
      if (!labelEl || !barEl) return;
      try {
          const result = await driveApiRequest({ action:'storage' });
          const storage = result.storage || {};
          const used = Number(storage.usedBytes || 0);
          const limit = Number(storage.limitBytes || 0);
          const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
          labelEl.textContent = formatStorageBytes(used) + (limit > 0 ? ' / ' + formatStorageBytes(limit) : ' / tidak terbatas');
          percentEl.textContent = limit > 0 ? percent + '%' : '—';
          barEl.style.width = (limit > 0 ? percent : 4) + '%';
          const color = percent >= 90 ? 'var(--rose)' : (percent >= 70 ? 'var(--amber)' : 'var(--teal)');
          barEl.style.background = color;
          percentEl.style.color = color;
          if (hintEl) hintEl.textContent = 'Lampiran baru disimpan sebagai file Google Drive; Firestore hanya menyimpan metadata kecil. Kosongkan Trash Drive bila ingin benar-benar mengurangi pemakaian ruang.';
          if (statusEl) { statusEl.textContent = '📁 Status Drive: terhubung ✓'; statusEl.style.color = 'var(--teal)'; }
          updateAttachmentHints();
      } catch (e) {
          // Pertahankan angka Firestore yang sudah tampil sebagai fallback.
          if (statusEl) { statusEl.textContent = 'Status Drive: terhubung, tetapi kapasitas belum dapat dibaca'; statusEl.style.color = 'var(--amber)'; }
          if (hintEl) hintEl.textContent = 'Data aplikasi tetap dihitung dari Firestore. Kapasitas Google Drive belum dapat dibaca saat ini.';
          renderStorageUsage();
      }
  }
  function setAutoCleanDays(value) {
      if (guardReadOnly()) return;
      let days = parseInt(value, 10);
      if (isNaN(days) || days < 0) days = 0;
      if (days > 90) days = 90;
      state.autoCleanTugasDays = days;
      document.getElementById('autoclean-days-input').value = days;
      saveState();
      showNotification(days === 0 ? 'Auto-hapus tugas selesai dimatikan.' : 'Tugas selesai akan otomatis terhapus setelah ' + days + ' hari.', 'success');
  }
  function setAutoCleanReportDays(value) {
      if (guardReadOnly()) return;
      let days = parseInt(value, 10);
      if (isNaN(days) || days < 0) days = 0;
      if (days > 90) days = 90;
      state.autoCleanReportDays = days;
      const input = document.getElementById('autoclean-report-days-input');
      if (input) input.value = days;
      saveState();
      showNotification(days === 0 ? 'Auto-hapus laporan selesai dimatikan.' : 'Laporan selesai akan otomatis terhapus setelah ' + days + ' hari.', 'success');
  }
  function renderBeranda() {
      const displayName = currentUser ? currentUser.username : 'Pengurus Kelas';
      document.getElementById('greeting-user').textContent = 'Halo, ' + displayName;
      const topName = document.getElementById('dashboard-user-name');
      const topRole = document.getElementById('dashboard-user-role');
      const topAvatar = document.getElementById('dashboard-user-avatar');
      const heroAvatar = document.getElementById('hero-avatar');
      if (topName) topName.textContent = displayName;
      if (topRole) topRole.textContent = currentUser ? (currentUser.role === 'superadmin' ? 'Super Admin' : currentUser.role === 'admin' ? 'Admin' : 'Siswa') : 'Siswa';
      const initials = displayName.split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]).join('').toUpperCase() || 'TJ';
      setAvatarVisual(topAvatar, currentUser && currentUser.avatar ? currentUser.avatar : getStoredAvatar(), initials);
      setAvatarVisual(heroAvatar, currentUser && currentUser.avatar ? currentUser.avatar : getStoredAvatar(), initials);
      refreshAvatarUI();
      document.getElementById('tag-today').textContent = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'short' });
      const saldo = state.kas.reduce((a, t) => a + (t.jenis === 'masuk' ? t.jumlah : -t.jumlah), 0);
      document.getElementById('home-saldo').textContent = rupiah(saldo);
      const hpToday = state.hp[todayKey()] || {};
      document.getElementById('home-hp').textContent = Object.values(hpToday).filter(v => rosterIsSudah(v)).length + "/" + state.students.length;
      const piketToday = state.piket[todayKey()] || {};
      const todayPiketDay = dayNameOf(todayKey());
      const piketTodayAssigned = (state.piketJadwal && Array.isArray(state.piketJadwal[todayPiketDay])) ? state.piketJadwal[todayPiketDay] : [];
      document.getElementById('home-piket-count').textContent = piketTodayAssigned.filter(s => rosterIsSudah(piketToday[s])).length + "/" + piketTodayAssigned.length;
      document.getElementById('home-tugas').textContent = state.tugas.filter(t => !t.selesai).length;
      const reportCounts = {pending:0, reviewed:0, resolved:0, rejected:0};
      state.reports.forEach(r => { if (reportCounts[r.status] !== undefined) reportCounts[r.status]++; });
      const reportEl = document.getElementById('home-reports');
      if (reportEl) reportEl.textContent = reportCounts.pending + reportCounts.reviewed;
      renderNotifications();
      const todayJadwal = state.jadwal[DAY_NAMES[new Date().getDay() - 1]] || [];
      document.getElementById('home-jadwal-list').innerHTML = todayJadwal.length ? todayJadwal.map(j => `
          <div class="row-item"><div class="row-time">${escapeHtml(j.jam)}</div><div><div class="row-title">${escapeHtml(j.mapel)}</div><div class="row-sub">${escapeHtml(j.guru)}</div></div></div>
      `).join('') : `<div class="empty">Tidak ada pelajaran hari ini.</div>`;
      document.getElementById('home-piket-list').innerHTML = piketTodayAssigned.length ? `
          <div style="display:flex; flex-wrap:wrap; gap:4px;">
              ${piketTodayAssigned.map(s => `<span class="htag" style="background:${piketToday[s]?'var(--teal-glass)':'var(--rose-glass)'}; color:${piketToday[s]?'var(--teal)':'var(--rose)'}; font-size:10px;">${escapeHtml(s)}${piketToday[s]?' ✓':''}</span>`).join('')}
          </div>
      ` : `<div class="empty">Belum ada jadwal piket untuk hari ini.</div>`;
      renderHomeTugas();
      renderPengumuman();
  }
  function renderHomeTugas() {
      const list = document.getElementById('home-tugas-list');
      if (!list) return;
      const active = (state.tugas || []).filter(t => !t.selesai);
      const toTime = (t) => {
          if (!t.tenggat) return Number.POSITIVE_INFINITY;
          const time = new Date(t.tenggat + 'T23:59:59').getTime();
          return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
      };
      const nearest = active.slice().sort((a,b)=>toTime(a)-toTime(b)).slice(0,3);
      if (!nearest.length) {
          list.innerHTML = `<div class="empty" style="padding:16px 10px; text-align:center;">Belum ada tugas terdekat.</div>`;
          return;
      }
      const today = new Date(); today.setHours(0,0,0,0);
      list.innerHTML = nearest.map(t => {
          let dueText = 'Tanpa deadline', dueClass = 'pill-due';
          if (t.tenggat) {
              const due = new Date(t.tenggat + 'T00:00:00');
              if (!Number.isNaN(due.getTime())) {
                  const diff = Math.ceil((due - today) / 86400000);
                  dueText = diff < 0 ? `Terlambat ${Math.abs(diff)} hari` : diff === 0 ? 'Hari ini' : diff === 1 ? 'Besok' : `Dalam ${diff} hari`;
                  dueClass = diff < 0 ? 'pill-due overdue' : 'pill-due';
              } else { dueText = t.tenggat; }
          }
          return `
              <div class="task-item home-task-item" ${isReadOnly() ? '' : `role="button" tabindex="0" title="Buka tugas ${escapeHtml(t.nama || '')}" onclick="openTugasModal(${t.id})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openTugasModal(${t.id})}"`}>
                  <div class="checkbox" aria-hidden="true"></div>
                  <div style="flex:1; min-width:0;">
                      <div class="task-title">${escapeHtml(t.nama || 'Tugas tanpa nama')}</div>
                      <div class="task-meta"><span class="pill ${dueClass}">${dueText}</span>${t.mapel ? `<span class="pill">${escapeHtml(t.mapel)}</span>` : ''}</div>
                      ${t.deskripsi ? `<div class="task-desc">${escapeHtml(cleanTaskText(t.deskripsi))}</div>` : ''}
                      ${renderTaskFiles(t)}
                  </div>
              </div>
          `;
      }).join('');
  }
  function formatAnnouncementDeadline(value) {
      const raw = String(value || '').trim();
      if (!raw) return '';
      const d = new Date(raw.includes('T') ? raw : raw + 'T00:00:00');
      if (Number.isNaN(d.getTime())) return raw;
      return d.toLocaleDateString('id-ID', {day:'numeric', month:'long', year:'numeric'});
  }
  function announcementDeadlineClass(value) {
      const raw = String(value || '').trim();
      if (!raw) return '';
      const d = new Date(raw.includes('T') ? raw : raw + 'T23:59:59');
      if (Number.isNaN(d.getTime())) return '';
      return d.getTime() < Date.now() ? ' overdue' : '';
  }
  function renderAnnouncementFiles(p) {
      const files = getItemFiles(p);
      if (!files.length) return '';
      return `<div class="announce-files">` + files.map((f, idx) => `<div class="announce-file" onclick="event.stopPropagation(); openAnnouncementFileAt(${Number(p.id)},${idx})" title="${escapeHtml(f.name)}">📎 <span>${escapeHtml(f.name)}</span></div>`).join('') + `</div>`;
  }
  function renderPengumuman() {
      const list = document.getElementById('pengumuman-list');
      if (!list) return;
      const items = Array.isArray(state.pengumuman) ? state.pengumuman : [];
      list.innerHTML = items.length ? items.slice().reverse().map(p => {
          const title = String(p.judul || p.title || '').trim() || 'Pengumuman';
          const description = String((p.deskripsi !== undefined ? p.deskripsi : p.text) || '').trim();
          const deadline = p.deadline || p.tenggat || '';
          const deadlineText = formatAnnouncementDeadline(deadline);
          const deadlineBadge = deadlineText ? `<span class="announce-pill${announcementDeadlineClass(deadline)}">📅 Deadline ${escapeHtml(deadlineText)}</span>` : '';
          const titleHtml = isReadOnly()
              ? `<div class="announce-title">${escapeHtml(title)}</div>`
              : `<button class="announce-title-btn admin-only" type="button" onclick="openPengumumanModal(${Number(p.id)})" title="Klik untuk edit">${escapeHtml(title)}</button>`;
          const actions = isReadOnly() ? '' : `<div class="announce-actions"><button class="s-remove admin-only" type="button" onclick="event.stopPropagation(); deletePengumuman(${Number(p.id)})" title="Hapus pengumuman">×</button></div>`;
          return `
          <div class="announce-item">
            <div class="announce-dot"></div>
            <div style="flex:1; min-width:0;">
              ${titleHtml}
              ${description ? `<div class="announce-description">${escapeHtml(description)}</div>` : ''}
              <div class="announce-date">${escapeHtml(p.date || '')}</div>
              ${deadlineBadge ? `<div class="announce-meta">${deadlineBadge}</div>` : ''}
              ${renderAnnouncementFiles(p)}
            </div>
            ${actions}
          </div>`;
      }).join('') : `<div class="empty">Belum ada pengumuman.</div>`;
  }
  function getKasFolder(folderId){ return state.kasFolders.find(f => String(f.id) === String(folderId)); }
  function openKasFolderModal(){ if (guardReadOnly()) return; document.getElementById('kas-folder-name').value = ''; document.getElementById('kas-folder-nominal').value = ''; document.getElementById('kas-folder-note').value = ''; openModal('kas-folder'); }
  function submitKasFolder(){
      if (guardReadOnly()) return;
      const name = document.getElementById('kas-folder-name').value.trim();
      const nominal = Math.max(0, Number(document.getElementById('kas-folder-nominal').value || 0));
      const note = document.getElementById('kas-folder-note').value.trim();
      if (!name) { showNotification('Nama folder wajib diisi.', 'warning'); return; }
      const folder = { id: Date.now()+Math.random(), name, nominal, note, createdAt: Date.now(), students: state.students.map(name => ({name, status:'belum', jumlah:0, tanggal:''})) };
      state.kasFolders.unshift(folder);
      addActivity('Membuat folder kas siswa', name);
      saveState();
      renderKasSiswa();
      closeModal('kas-folder');
      showNotification('Folder kas siswa berhasil dibuat.', 'success');
  }
  function openKasStudentModal(folderId, studentName){
      if (guardReadOnly()) return;
      const folder = getKasFolder(folderId);
      if (!folder) return;
      const student = (folder.students || []).find(x => x.name === studentName);
      if (!student) return;
      document.getElementById('kas-student-folder-id').value = folder.id;
      document.getElementById('kas-student-name').value = student.name;
      document.getElementById('kas-student-display').value = student.name;
      document.getElementById('kas-student-status').value = student.status === 'sudah' ? 'sudah' : 'belum';
      document.getElementById('kas-student-jumlah').value = student.jumlah || folder.nominal || '';
      document.getElementById('kas-student-tanggal').value = student.tanggal || (student.status === 'sudah' ? todayKey() : '');
      openModal('kas-student');
  }
  function submitKasStudent(){
      if (guardReadOnly()) return;
      const folder = getKasFolder(document.getElementById('kas-student-folder-id').value);
      if (!folder) return;
      const name = document.getElementById('kas-student-name').value;
      const status = document.getElementById('kas-student-status').value;
      const jumlah = Math.max(0, Number(document.getElementById('kas-student-jumlah').value || 0));
      const tanggal = document.getElementById('kas-student-tanggal').value || '';
      const student = (folder.students || []).find(x => x.name === name);
      if (!student) return;
      student.status = status;
      student.jumlah = status === 'sudah' ? jumlah : 0;
      student.tanggal = status === 'sudah' ? tanggal : '';
      addActivity('Mengubah pembayaran kas siswa', folder.name + ' · ' + name + ' · ' + (status === 'sudah' ? 'Sudah bayar' : 'Belum bayar'));
      saveState();
      renderKasSiswa();
      closeModal('kas-student');
      showNotification('Status pembayaran ' + name + ' diperbarui.', 'success');
  }
  function deleteKasFolder(folderId){
      if (guardReadOnly()) return;
      const folder = getKasFolder(folderId);
      if (!folder) return;
      if (!confirm('Hapus folder "' + folder.name + '" beserta data pembayaran siswanya?')) return;
      state.kasFolders = state.kasFolders.filter(f => String(f.id) !== String(folderId));
      addActivity('Menghapus folder kas siswa', folder.name);
      saveState();
      renderKasSiswa();
      showNotification('Folder kas siswa dihapus.', 'info');
  }
  function renderKasSiswa(){
      const list = document.getElementById('kas-folder-list');
      if (!list) return;
      ensureAppFeatures();
      if (!state.kasFolders.length){
          list.innerHTML = '<div class="card kas-folder-empty">Belum ada folder kas siswa. Admin dapat membuat folder untuk kas bulanan/mingguan.</div>';
          return;
      }
      list.innerHTML = state.kasFolders.map(folder => {
          const students = Array.isArray(folder.students) ? folder.students : [];
          const paid = students.filter(x => x.status === 'sudah').length;
          const unpaid = Math.max(0, students.length - paid);
          const minimized = !!state.kasFolderMinimized[String(folder.id)];
          return `<div class="kas-folder">
              <div class="kas-folder-head">
                  <div style="min-width:0;flex:1;cursor:pointer;" onclick="toggleKasFolder('${String(folder.id)}')" title="${minimized ? 'Buka folder' : 'Minimalkan folder'}">
                      <div class="kas-folder-name">📁 ${escapeHtml(folder.name)}</div>
                      ${folder.note ? `<div class="kas-folder-note">${escapeHtml(folder.note)}</div>` : ''}
                  </div>
                  <button class="btn btn-danger admin-only" style="padding:6px 8px;font-size:10px;" onclick="event.stopPropagation();deleteKasFolder('${String(folder.id)}')">Hapus</button>
              </div>
              <div class="kas-folder-content-wrap${minimized ? ' collapsed' : ''}">
                  <div class="kas-folder-summary">
                      <span class="kas-summary-paid">✓ ${paid} Sudah Bayar</span>
                      <span class="kas-summary-unpaid">! ${unpaid} Belum Bayar</span>
                      ${folder.nominal ? `<span class="kas-summary-nominal">Rp${Number(folder.nominal).toLocaleString('id-ID')} / anak</span>` : ''}
                  </div>
                  <div class="kas-student-list">
                      ${students.length ? students.map(st => `<div class="kas-student-row" ${isAdmin() ? `onclick='openKasStudentModal(${jsString(folder.id)},${jsString(st.name)})' style="cursor:pointer;"` : ''}>
                          <div class="kas-student-avatar">${escapeHtml((st.name || '?').split(/\s+/).map(x=>x[0]||'').slice(0,2).join('').toUpperCase())}</div>
                          <div class="kas-student-info"><strong>${escapeHtml(st.name)}</strong><small>${st.status === 'sudah' ? 'Bayar' + (st.tanggal ? ' · ' + escapeHtml(st.tanggal) : '') + (st.jumlah ? ' · Rp' + Number(st.jumlah).toLocaleString('id-ID') : '') : 'Belum melakukan pembayaran'}</small></div>
                          <span class="kas-payment-badge ${st.status === 'sudah' ? 'sudah' : 'belum'}">${st.status === 'sudah' ? 'Sudah Bayar' : 'Belum Bayar'}</span>
                      </div>`).join('') : '<div class="kas-folder-empty">Belum ada data siswa.</div>'}
                  </div>
              </div>
          </div>`;
      }).join('');
  }
  function toggleKasFolder(folderId){
      if(!state.kasFolderMinimized || typeof state.kasFolderMinimized !== 'object')state.kasFolderMinimized={};
      const key=String(folderId);
      state.kasFolderMinimized[key]=!state.kasFolderMinimized[key];
      saveState();
      renderKasSiswa();
  }
  function renderKas() {
      const masuk = state.kas.filter(t => t.jenis === 'masuk').reduce((a, t) => a + t.jumlah, 0);
      const keluar = state.kas.filter(t => t.jenis === 'keluar').reduce((a, t) => a + t.jumlah, 0);
      document.getElementById('kas-saldo').textContent = rupiah(masuk - keluar);
      document.getElementById('kas-in').textContent = rupiah(masuk);
      document.getElementById('kas-out').textContent = rupiah(keluar);
      const list = document.getElementById('kas-list');
      list.innerHTML = state.kas.length ? state.kas.slice().reverse().map(t => `
          <div class="tx-item" role="button" tabindex="0" title="Klik untuk mengedit transaksi" onclick="openKasEditModal(${t.id})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openKasEditModal(${t.id})}">
              <div class="tx-icon" style="background:${t.jenis==='masuk'?'var(--teal-glass)':'var(--rose-glass)'}">${t.jenis==='masuk'?'⬇️':'⬆️'}</div>
              <div style="flex:1; min-width:0;">
                  <div class="tx-title">${escapeHtml(t.ket)}</div>
                  <div class="tx-sub">${escapeHtml(t.tanggal)}${t.file ? ` · <span style="cursor:pointer; text-decoration:underline;" onclick="event.stopPropagation(); openKasFile(${t.id})">📎 ${escapeHtml(t.file)}</span>` : ''}</div>
              </div>
              <div class="tx-amt ${t.jenis==='masuk'?'plus':'minus'}">${t.jenis==='masuk'?'+':'-'}${rupiah(t.jumlah)}</div>
          </div>
      `).join('') : `<div class="empty">Belum ada riwayat kas.</div>`;
  }
  // ===== ROSTER =====
  let rosterUI = { hp: { minimized: false, search: '' }, piket: { minimized: false, search: '' } };
  function renderRosterView(cfg) {
      const rec = ensureRecord(cfg.dict, cfg.selectedDate);
      const names = cfg.names !== undefined && cfg.names !== null ? cfg.names : state.students;
      const collected = names.length ? names.filter(n => rosterIsSudah(rec[n])).length : 0;
      document.getElementById(cfg.collectedId).textContent = collected;
      document.getElementById(cfg.remainingId).textContent = names.length - collected;
      const [y, m, d] = cfg.selectedDate.split('-').map(Number);
      const labelDate = new Date(y, m-1, d);
      document.getElementById(cfg.dateLabelId).textContent = (cfg.selectedDate === todayKey() ? 'Hari ini · ' : '') + labelDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
      const list = document.getElementById(cfg.listId);
      if (!names.length) { list.innerHTML = `<div class="empty">Tidak ada siswa yang dijadwalkan piket pada hari ini.</div>`; return; }
      const query = (cfg.searchQuery || '').trim().toLowerCase();
      const displayNames = query ? names.filter(n => n.toLowerCase().includes(query)) : names;
      if (!displayNames.length) { list.innerHTML = `<div class="empty">Tidak ada nama yang cocok dengan pencarian "${escapeHtml(cfg.searchQuery)}".</div>`; return; }
      list.innerHTML = displayNames.map(n => {
          const nameEsc = n.replace(/'/g, "\\'");
          const st = rosterStatusOf(rec[n]);
          let badgeLabel, badgeClass;
          if (!st) { badgeLabel = 'Tandai'; badgeClass = 'neutral'; }
          else if (st.status === 'sudah') { badgeLabel = '✓ Sudah'; badgeClass = 'done'; }
          else { badgeLabel = '✕ Belum'; badgeClass = 'undone'; }
          return `
          <div class="student-row">
              <div class="s-avatar" onclick='openRosterStatusModal(${jsString(cfg.type)},${jsString(nameEsc)})' style="cursor:pointer;">${escapeHtml(n.slice(0,2).toUpperCase())}</div>
              <div style="flex:1; min-width:0; cursor:pointer;" onclick='openRosterStatusModal(${jsString(cfg.type)},${jsString(nameEsc)})'>
                  <div class="s-name">${escapeHtml(n)}</div>
                  ${st && st.status==='belum' && st.alasan ? `<div class="s-reason">💬 ${escapeHtml(st.alasan)}</div>` : ''}
              </div>
              <label class="student-check admin-only" title="Tandai ${escapeHtml(nameEsc)}"><input type="checkbox" ${st && st.status==='sudah' ? 'checked' : ''} onchange='toggleRosterStudent(${jsString(cfg.type)},${jsString(nameEsc)},this.checked)'><span></span></label>
              <div class="toggle-btn ${badgeClass}" onclick='openRosterStatusModal(${jsString(cfg.type)},${jsString(nameEsc)})' style="cursor:pointer;">${badgeLabel}</div>
              <button class="s-remove admin-only" onclick='event.stopPropagation(); window.removeStudent(${jsString(nameEsc)})'>×</button>
          </div>
      `; }).join('');
  }
  function toggleRosterStudent(type,name,checked){if(guardReadOnly())return;const date=type==='hp'?(state.hpSelectedDate||todayKey()):(state.piketSelectedDate||todayKey());const rec=ensureRecord(type==='hp'?state.hp:state.piket,date);rec[name]=checked?{status:'sudah',alasan:''}:{status:'belum',alasan:''};saveState();if(type==='hp'){renderHp();renderHpCalendar();}else{renderPiket();renderPiketCalendar();}renderBeranda();}
  function toggleAllRoster(type){if(guardReadOnly())return;const date=type==='hp'?(state.hpSelectedDate||todayKey()):(state.piketSelectedDate||todayKey());const rec=ensureRecord(type==='hp'?state.hp:state.piket,date);const names=type==='hp'?(state.students||[]):(()=>{const day=dayNameOf(date);return state.piketJadwal&&Array.isArray(state.piketJadwal[day])?state.piketJadwal[day]:[]})();const allDone=names.length>0&&names.every(n=>rosterIsSudah(rec[n]));names.forEach(n=>rec[n]=allDone?{status:'belum',alasan:''}:{status:'sudah',alasan:''});saveState();if(type==='hp'){renderHp();renderHpCalendar();}else{renderPiket();renderPiketCalendar();}renderBeranda();}
  function toggleRosterList(type) { rosterUI[type].minimized = !rosterUI[type].minimized; updateRosterListUI(type); }
  function updateRosterListUI(type) { const wrap = document.getElementById(type + '-list-wrap'); const btn = document.getElementById(type + '-list-toggle'); if (!wrap || !btn) return; wrap.classList.toggle('collapsed', rosterUI[type].minimized); btn.textContent = rosterUI[type].minimized ? '+' : '−'; }
  function onRosterSearch(type) { const input = document.getElementById(type + '-search'); rosterUI[type].search = input ? input.value : ''; if (type === 'hp') renderHp(); else renderPiket(); }
  function renderHp() {
      const date = state.hpSelectedDate || todayKey();
      renderRosterView({ dict: state.hp, selectedDate: date, collectedId: 'hp-collected', remainingId: 'hp-remaining', dateLabelId: 'hp-date-label', listId: 'hp-list', type: 'hp', searchQuery: rosterUI.hp.search });
      updateRosterListUI('hp');
  }
  function renderPiket() {
      const date = state.piketSelectedDate || todayKey();
      const day = dayNameOf(date);
      const assigned = (state.piketJadwal && Array.isArray(state.piketJadwal[day])) ? state.piketJadwal[day] : [];
      renderRosterView({ dict: state.piket, selectedDate: date, names: assigned, collectedId: 'piket-collected', remainingId: 'piket-remaining', dateLabelId: 'piket-date-label', listId: 'piket-list', type: 'piket', searchQuery: rosterUI.piket.search });
      updateRosterListUI('piket');
  }
  let _rosterModalCtx = { type: null, name: null };
  function openRosterStatusModal(type, name) {
      if (guardReadOnly()) return;
      const date = type === 'hp' ? (state.hpSelectedDate || todayKey()) : (state.piketSelectedDate || todayKey());
      const rec = ensureRecord(type === 'hp' ? state.hp : state.piket, date);
      const st = rosterStatusOf(rec[name]);
      _rosterModalCtx = { type, name };
      document.getElementById('roster-status-name').textContent = name;
      document.getElementById('roster-status-title').textContent = type === 'hp' ? 'Titip HP' : 'Piket Kebersihan';
      document.getElementById('roster-status-alasan').value = (st && st.alasan) || '';
      setRosterStatusChoice(st ? st.status : null);
      openModal('roster-status');
  }
  function setRosterStatusChoice(status) {
      document.getElementById('roster-status-sudah-btn').classList.toggle('active', status === 'sudah');
      document.getElementById('roster-status-belum-btn').classList.toggle('active', status === 'belum');
      document.getElementById('roster-status-choice').value = status || '';
      document.getElementById('roster-status-alasan-field').style.display = status === 'belum' ? '' : 'none';
  }
  function submitRosterStatus() {
      const { type, name } = _rosterModalCtx;
      if (!type || !name) return;
      const status = document.getElementById('roster-status-choice').value;
      const alasan = document.getElementById('roster-status-alasan').value.trim();
      if (!status) { showNotification('Pilih status Sudah atau Belum dulu.', 'warning'); return; }
      const date = type === 'hp' ? (state.hpSelectedDate || todayKey()) : (state.piketSelectedDate || todayKey());
      const rec = ensureRecord(type === 'hp' ? state.hp : state.piket, date);
      rec[name] = status === 'sudah' ? { status: 'sudah', alasan: '' } : { status: 'belum', alasan };
      saveState();
      if (type === 'hp') { renderHp(); renderHpCalendar(); } else { renderPiket(); renderPiketCalendar(); }
      renderBeranda();
      closeModal('roster-status');
  }
  function clearRosterStatus() {
      const { type, name } = _rosterModalCtx;
      if (!type || !name) return;
      const date = type === 'hp' ? (state.hpSelectedDate || todayKey()) : (state.piketSelectedDate || todayKey());
      const rec = ensureRecord(type === 'hp' ? state.hp : state.piket, date);
      delete rec[name];
      saveState();
      if (type === 'hp') { renderHp(); renderHpCalendar(); } else { renderPiket(); renderPiketCalendar(); }
      renderBeranda();
      closeModal('roster-status');
  }
  function removeStudent(name) {
      if (guardReadOnly()) return;
      state.students = state.students.filter(s => s !== name);
      for (let date in state.hp) { if (name in state.hp[date]) delete state.hp[date][name]; }
      for (let date in state.piket) { if (name in state.piket[date]) delete state.piket[date][name]; }
      for (let day in state.piketJadwal) { state.piketJadwal[day] = (state.piketJadwal[day] || []).filter(s => s !== name); }
      removeNameFromPiketWeeklyAssignments(name);
      saveState(); renderHp(); renderPiket(); renderBeranda();
  }
  let _editingStudentName = null;
  let _hpEditCtx = { name: null, date: null };
  function openHpEditModal(name){
      if(!isAdmin()) return;
      const current=String(name||'').trim();
      if(!current) return;
      const date=state.hpSelectedDate||todayKey();
      const rec=ensureRecord(state.hp,date);
      const st=rosterStatusOf(rec[current]);
      _hpEditCtx={name:current,date};
      document.getElementById('hp-edit-current-name').textContent='Sedang mengedit: '+current;
      document.getElementById('hp-edit-name').value=current;
      document.getElementById('hp-edit-reason').value=(st&&st.alasan)||'';
      setHpEditStatus(st&&st.status==='sudah'?'sudah':'belum');
      openModal('hp-edit');
      setTimeout(()=>document.getElementById('hp-edit-name')?.focus(),40);
  }
  function setHpEditStatus(status){
      document.getElementById('hp-edit-status').value=status;
      document.getElementById('hp-edit-sudah-btn').classList.toggle('active',status==='sudah');
      document.getElementById('hp-edit-belum-btn').classList.toggle('active',status==='belum');
      document.getElementById('hp-edit-reason-field').style.display=status==='belum'?'':'none';
  }
  function submitHpEdit(){
      if(!isAdmin()) return;
      const oldName=_hpEditCtx.name;
      const date=_hpEditCtx.date||state.hpSelectedDate||todayKey();
      const newName=document.getElementById('hp-edit-name').value.trim().replace(/\s+/g,' ');
      const status=document.getElementById('hp-edit-status').value;
      const reason=document.getElementById('hp-edit-reason').value.trim();
      if(!oldName||!newName){showNotification('Nama siswa wajib diisi.','warning');return;}
      if(newName.length>80){showNotification('Nama siswa maksimal 80 karakter.','warning');return;}
      if(!status){showNotification('Pilih status Sudah Terkumpul atau Belum Terkumpul.','warning');return;}
      if(status==='belum' && !reason){showNotification('Isi alasan jika HP belum terkumpul.','warning');return;}
      const duplicate=(state.students||[]).some(n=>n.toLowerCase()===newName.toLowerCase() && n!==oldName);
      if(duplicate){showNotification('Nama siswa sudah ada.','warning');return;}
      const idx=state.students.indexOf(oldName);
      if(idx<0){closeModal('hp-edit');return;}
      state.students[idx]=newName;
      const rec=ensureRecord(state.hp,date);
      if(newName!==oldName){
          if(Object.prototype.hasOwnProperty.call(rec,oldName)) delete rec[oldName];
      }
      rec[newName]=status==='sudah'?{status:'sudah',alasan:'',waktu:(rosterStatusOf(rec[oldName])?.waktu||new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}))}:{status:'belum',alasan:reason};
      // Perbarui nama pada semua data terkait agar konsisten.
      if(state.piket && typeof state.piket==='object' && newName!==oldName){
          Object.keys(state.piket).forEach(k=>{if(state.piket[k]&&Object.prototype.hasOwnProperty.call(state.piket[k],oldName)){state.piket[k][newName]=state.piket[k][oldName];delete state.piket[k][oldName];}});
      }
      if(state.piketJadwal && typeof state.piketJadwal==='object' && newName!==oldName){
          Object.keys(state.piketJadwal).forEach(day=>{if(Array.isArray(state.piketJadwal[day])) state.piketJadwal[day]=state.piketJadwal[day].map(n=>n===oldName?newName:n);});
      }
      replaceNameInPiketWeeklyAssignments(oldName, newName);
      saveState();
      closeModal('hp-edit');
      renderHp(); renderBeranda(); renderPiket();
      showNotification('Data Titip HP berhasil diperbarui.','success');
      _hpEditCtx={name:null,date:null};
  }
  function openStudentModal() {
      if (guardReadOnly()) return;
      _editingStudentName = null;
      const title = document.querySelector('#modal-student h3');
      const button = document.querySelector('#modal-student .modal-actions .btn-primary');
      document.getElementById('student-nama').value = '';
      if(title) title.textContent = 'Tambah Siswa';
      if(button) button.textContent = 'Tambah';
      openModal('student');
  }
  function openStudentEditModal(oldName) {
      if (!isAdmin()) return;
      const current = String(oldName || '').trim();
      if (!current) return;
      _editingStudentName = current;
      const title = document.querySelector('#modal-student h3');
      const button = document.querySelector('#modal-student .modal-actions .btn-primary');
      const input = document.getElementById('student-nama');
      if(input) input.value = current;
      if(title) title.textContent = 'Edit Nama Siswa';
      if(button) button.textContent = 'Simpan';
      openModal('student');
  }
  function submitStudent() {
      if (guardReadOnly()) return;
      const nama = document.getElementById('student-nama').value.trim().replace(/\s+/g, ' ');
      if (!nama) { showNotification('Nama siswa wajib diisi.', 'warning'); return; }
      if (nama.length > 80) { showNotification('Nama siswa maksimal 80 karakter.', 'warning'); return; }
      const duplicate = (state.students || []).some(s => s.toLowerCase() === nama.toLowerCase() && s !== _editingStudentName);
      if (duplicate) { showNotification('Nama siswa sudah ada.', 'warning'); return; }

      if (_editingStudentName) {
          const oldName = _editingStudentName;
          const idx = state.students.indexOf(oldName);
          if (idx < 0) { _editingStudentName = null; closeModal('student'); return; }
          state.students[idx] = nama;

          // Pindahkan status Titip HP/Piket dari nama lama ke nama baru.
          [state.hp, state.piket].forEach(dict => {
              if (!dict || typeof dict !== 'object') return;
              Object.keys(dict).forEach(dateKey => {
                  const rec = dict[dateKey];
                  if (!rec || typeof rec !== 'object') return;
                  if (Object.prototype.hasOwnProperty.call(rec, oldName)) {
                      if (!Object.prototype.hasOwnProperty.call(rec, nama)) rec[nama] = rec[oldName];
                      delete rec[oldName];
                  }
              });
          });
          if (state.piketJadwal && typeof state.piketJadwal === 'object') {
              Object.keys(state.piketJadwal).forEach(day => {
                  if (Array.isArray(state.piketJadwal[day])) {
                      state.piketJadwal[day] = state.piketJadwal[day].map(s => s === oldName ? nama : s);
                  }
              });
          }
          replaceNameInPiketWeeklyAssignments(oldName, nama);
          addActivity('Mengubah nama siswa', oldName + ' → ' + nama);
          _editingStudentName = null;
          saveState(); renderHp(); renderPiket(); renderBeranda(); closeModal('student');
          showNotification('Nama siswa berhasil diperbarui.', 'success');
          return;
      }

      if (!state.students.includes(nama)) { state.students.push(nama); addActivity('Menambahkan siswa', nama); }
      saveState(); renderHp(); renderPiket(); renderBeranda(); closeModal('student'); showNotification('Siswa berhasil ditambahkan.', 'success');
  }
  function resetRoster(type) {
      if (guardReadOnly()) return;
      if (!confirm('Reset semua status ke netral untuk semua tanggal yang tercatat?')) return;
      const dict = type === 'hp' ? state.hp : state.piket;
      Object.keys(dict).forEach(k => { dict[k] = {}; });
      saveState(); renderAll(); showNotification('Status berhasil direset ke netral.', 'info');
  }
  // ===== CALENDAR =====
  function renderMiniCalendar(prefix, year, month, selectedDate, dict, selectFnName) {
      const monthLabel = document.getElementById(prefix + '-month-label');
      if (monthLabel) {
          const type = prefix === 'cal' ? 'hp' : 'piket';
          let selectedDay = '';
          if (selectedDate) {
              const parts = String(selectedDate).split('-');
              if (parts.length === 3 && Number(parts[0]) === year && Number(parts[1]) === month + 1) selectedDay = String(Number(parts[2]));
          }
          const selectedDateObj = selectedDate ? new Date(String(selectedDate) + 'T00:00:00') : null;
          const selectedWeekday = selectedDateObj && !Number.isNaN(selectedDateObj.getTime()) && Number(selectedDateObj.getFullYear()) === year && Number(selectedDateObj.getMonth()) === month
              ? selectedDateObj.toLocaleDateString('id-ID', { weekday: 'long' })
              : '';
          monthLabel.innerHTML = `${selectedDay ? `<span class="cal-day-label">${escapeHtml(selectedDay)}</span>` : ''}<span class="cal-date-info"><span class="cal-weekday">${selectedWeekday ? escapeHtml(selectedWeekday) : 'Kalender'}</span><span class="cal-date-main"><span class="cal-month-click" onclick="toggleCalendar('${type}', event)">${escapeHtml(MONTH_LABEL[month])}</span><span class="cal-year-click" onclick="openMonthYearPicker('${type}', event)">${year}</span></span></span>`;
      }
      document.getElementById(prefix + '-dow-row').innerHTML = DOW_LABEL.map(d => `<div class="cal-dow">${d}</div>`).join('');
      const firstDow = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const todayStr = todayKey();
      let cells = '';
      for (let i = 0; i < firstDow; i++) cells += `<div class="cal-day empty"></div>`;
      for (let d = 1; d <= daysInMonth; d++) {
          const key = dateKeyOf(year, month, d);
          const isToday = (key === todayStr);
          const isSelected = (key === selectedDate);
          const rec = dict[key] || {};
          const hasData = Object.keys(rec).length > 0;
          let cls = 'cal-day';
          if (isToday) cls += ' today';
          if (isSelected) cls += ' selected';
          const dotHtml = hasData ? '<span class="cal-dot"></span>' : '';
          cells += `<div class="${cls}" onclick="${selectFnName}('${key}')">${d}${dotHtml}</div>`;
      }
      document.getElementById(prefix + '-grid').innerHTML = cells;
  }
  function renderHpCalendar() { renderMiniCalendar('cal', calYear, calMonth, state.hpSelectedDate || todayKey(), state.hp, 'selectHpDate'); updateCalendarUI('hp'); }
  function renderPiketCalendar() { renderMiniCalendar('piket-cal', piketCalYear, piketCalMonth, state.piketSelectedDate || todayKey(), state.piket, 'selectPiketDate'); updateCalendarUI('piket'); }
  function calShift(delta) { calMonth += delta; if (calMonth < 0) { calMonth = 11; calYear--; } if (calMonth > 11) { calMonth = 0; calYear++; } renderHpCalendar(); }
  function piketCalShift(delta) { piketCalMonth += delta; if (piketCalMonth < 0) { piketCalMonth = 11; piketCalYear--; } if (piketCalMonth > 11) { piketCalMonth = 0; piketCalYear++; } renderPiketCalendar(); }
  function selectHpDate(key) { state.hpSelectedDate = key; saveState(); renderHpCalendar(); renderHp(); renderBeranda(); }
  function selectPiketDate(key) { state.piketSelectedDate = key; saveState(); renderPiketCalendar(); renderPiket(); renderBeranda(); }
  function toggleCalendar(type, evt) { if (evt) evt.stopPropagation(); const key=type==='hp'?'hp':'piket'; if(!state.calMinimized) state.calMinimized={hp:false,piket:false}; state.calMinimized[key]=!state.calMinimized[key]; saveState(); updateCalendarUI(type); }
  function updateCalendarUI(type) { const key=type==='hp'?'hp':'piket'; const body=document.getElementById(type+'-cal-body'); const picker=document.getElementById(type+'-month-picker'); if(!body)return; const min=!!(state.calMinimized&&state.calMinimized[key]); body.classList.toggle('collapsed',min); if(picker&&!picker.classList.contains('open')) picker.innerHTML=''; }
  function openMonthYearPicker(type,evt){ if(evt)evt.stopPropagation(); const picker=document.getElementById(type+'-month-picker'), body=document.getElementById(type+'-cal-body'); if(!picker||!body)return; if(picker.classList.contains('open')){picker.classList.remove('open');picker.innerHTML='';return;} body.classList.add('collapsed'); const year=type==='hp'?calYear:piketCalYear, month=type==='hp'?calMonth:piketCalMonth; picker.classList.add('open'); picker.innerHTML=`<div class="cal-picker-year"><button type="button" onclick="changePickerYear('${type}',-1,event)">‹</button><strong>${year}</strong><button type="button" onclick="changePickerYear('${type}',1,event)">›</button></div><div class="cal-picker-months">${MONTH_LABEL.map((m,i)=>`<button type="button" class="${i===month?'active':''}" onclick="choosePickerMonth('${type}',${i},event)">${escapeHtml(m)}</button>`).join('')}</div>`; }
  function changePickerYear(type,delta,evt){ if(evt)evt.stopPropagation(); if(type==='hp')calYear+=delta;else piketCalYear+=delta; const picker=document.getElementById(type+'-month-picker'); if(picker){picker.classList.remove('open');picker.innerHTML='';} openMonthYearPicker(type); }
  function choosePickerMonth(type,month,evt){ if(evt)evt.stopPropagation(); if(type==='hp'){calMonth=month;renderHpCalendar();}else{piketCalMonth=month;renderPiketCalendar();} const picker=document.getElementById(type+'-month-picker'); if(picker){picker.classList.remove('open');picker.innerHTML='';} saveState(); if(type==='hp')renderHp();else renderPiket(); }
  function openStatsModal(type) {
      const dict = type === 'hp' ? state.hp : state.piket;
      document.getElementById('stats-title').textContent = type === 'hp' ? 'Statistik Kumpul HP' : 'Statistik Piket';
      const dates = Object.keys(dict).filter(k => k <= todayKey());
      const totals = {}, trues = {};
      state.students.forEach(s => { totals[s] = 0; trues[s] = 0; });
      dates.forEach(dk => {
          const rec = dict[dk];
          let relevant = state.students;
          if (type === 'piket') { const day = dayNameOf(dk); relevant = (state.piketJadwal && Array.isArray(state.piketJadwal[day])) ? state.piketJadwal[day] : []; }
          relevant.forEach(s => {
              if (s in rec) { totals[s]++; if (rosterIsSudah(rec[s])) trues[s]++; }
          });
      });
      const data = state.students.map(s => ({ name: s, total: totals[s], done: trues[s], pct: totals[s] ? Math.round(trues[s]/totals[s]*100) : 0 }));
      document.getElementById('stats-content').innerHTML = data.map(d => `
          <div class="stat-bar-row">
              <div class="stat-bar-name">${escapeHtml(d.name)}</div>
              <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${d.pct}%; background:${d.pct>=80?'var(--teal)':d.pct>=50?'var(--amber)':'var(--rose)'};"></div></div>
              <div class="stat-bar-value">${d.done}/${d.total} (${d.pct}%)</div>
          </div>
      `).join('');
      openModal('stats');
  }
  // ===== JADWAL PIKET =====
  let piketJadwalActiveDay = 'Senin';
  function openPiketJadwalModal() {
      if (guardReadOnly()) return;
      if (!state.piketJadwal) state.piketJadwal = {};
      let active = dayNameOf(state.piketSelectedDate || todayKey());
      if (!SCHOOL_DAYS.includes(active)) active = 'Senin';
      piketJadwalActiveDay = active;
      renderPiketJadwalDayTabs();
      renderPiketJadwalChecklist();
      openModal('piket-jadwal');
  }
  function selectPiketJadwalDay(day) { piketJadwalActiveDay = day; renderPiketJadwalDayTabs(); renderPiketJadwalChecklist(); }
  function renderPiketJadwalDayTabs() { document.getElementById('piket-jadwal-day-tabs').innerHTML = SCHOOL_DAYS.map(d => `<div class="day-chip ${piketJadwalActiveDay===d?'active':''}" onclick="selectPiketJadwalDay('${jsString(d)}')">${escapeHtml(d)}</div>`).join(''); }
  function renderPiketJadwalChecklist() {
      if (!state.piketJadwal) state.piketJadwal = {};
      const assigned = state.piketJadwal[piketJadwalActiveDay] || [];
      const summaryEl = document.getElementById('piket-jadwal-summary');
      if (summaryEl) { summaryEl.textContent = assigned.length ? `📌 Hari ${piketJadwalActiveDay}: ${assigned.length} siswa ditugaskan` : `📌 Hari ${piketJadwalActiveDay}: tidak ada siswa yang ditugaskan (kosong)`; }
      const wrap = document.getElementById('piket-jadwal-checklist');
      wrap.innerHTML = state.students.length ? state.students.map(s => `
          <label class="piket-jadwal-row">
              <input type="checkbox" ${assigned.includes(s) ? 'checked' : ''} onchange='togglePiketJadwalStudent(${jsString(s)}, this.checked)'>
              <span>${escapeHtml(s)}</span>
          </label>
      `).join('') : '<div class="empty">Belum ada data siswa. Tambahkan dulu di halaman Piket/HP.</div>';
  }
  function togglePiketJadwalStudent(name, checked) {
      if (guardReadOnly()) return;
      if (!state.piketJadwal) state.piketJadwal = {};
      if (!state.piketJadwal[piketJadwalActiveDay]) state.piketJadwal[piketJadwalActiveDay] = [];
      const arr = state.piketJadwal[piketJadwalActiveDay];
      if (checked) { if (!arr.includes(name)) arr.push(name); }
      else { state.piketJadwal[piketJadwalActiveDay] = arr.filter(n => n !== name); }
      const summaryEl = document.getElementById('piket-jadwal-summary');
      if (summaryEl) { const count = state.piketJadwal[piketJadwalActiveDay].length; summaryEl.textContent = count ? `📌 Hari ${piketJadwalActiveDay}: ${count} siswa ditugaskan` : `📌 Hari ${piketJadwalActiveDay}: tidak ada siswa yang ditugaskan (kosong)`; }
      saveState(); renderPiket(); renderPiketCalendar(); renderBeranda();
  }
  // ===== ROTASI TUGAS PIKET MINGGUAN =====
  const DEFAULT_PIKET_TASKS = [
      'Bersihkan lantai',
      'Buang sampah',
      'Tutup jendela',
      'Rapikan meja dan kursi',
      'Rapikan papan tulis',
      'Matikan lampu',
      'Susun kursi dengan rapi',
      'Periksa kebersihan kelas'
  ];

  function piketDateFromKey(key) {
      const parts = String(key || '').split('-').map(Number);
      if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return new Date();
      return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
  }
  function piketWeekStartKey(dateKey) {
      const d = piketDateFromKey(dateKey || todayKey());
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      return dateKeyOf(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function piketWeekEndKey(weekKey) {
      const d = piketDateFromKey(weekKey);
      d.setDate(d.getDate() + 6);
      return dateKeyOf(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function formatPiketWeekLabel(weekKey) {
      const start = piketDateFromKey(weekKey);
      const end = piketDateFromKey(piketWeekEndKey(weekKey));
      const fmt = d => d.toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' });
      return `${fmt(start)} – ${fmt(end)}`;
  }
  function currentPiketDay() {
      const date = state.piketSelectedDate || todayKey();
      const day = dayNameOf(date);
      return SCHOOL_DAYS.includes(day) ? day : SCHOOL_DAYS[0];
  }
  function piketRotationKey(weekKey, day) {
      return `${weekKey}::${String(day || currentPiketDay())}`;
  }
  function parsePiketRotationKey(key) {
      const raw = String(key || '');
      const parts = raw.split('::');
      if (parts.length >= 2) return { weekKey: parts[0], day: parts.slice(1).join('::') };
      return { weekKey: raw || piketWeekStartKey(todayKey()), day: currentPiketDay() };
  }
  function currentPiketRotationKey() {
      return piketRotationKey(currentPiketWeekKey(), currentPiketDay());
  }
  function uniquePiketTasks(list) {
      const seen = new Set();
      return (Array.isArray(list) ? list : []).map(v => String(v || '').trim()).filter(v => {
          const k = v.toLowerCase();
          if (!k || seen.has(k)) return false;
          seen.add(k); return true;
      }).slice(0, 30);
  }
  function normalizePiketTaskList() {
      const current = uniquePiketTasks(state.piketTaskList);
      const legacyOnly = current.length === 2
          && current.every(task => ['Bersihkan lantai', 'Buang sampah'].includes(task));
      if (!current.length) {
          state.piketTaskList = [...DEFAULT_PIKET_TASKS];
      } else if (legacyOnly) {
          // Backup lama v57/v58 hanya punya dua tugas. Jangan menghapus pilihan lama;
          // tambahkan kategori baru ke daftar yang sudah ada.
          state.piketTaskList = [...current, ...DEFAULT_PIKET_TASKS.slice(2)];
      } else {
          state.piketTaskList = current;
      }
      return state.piketTaskList;
  }
  function normalizePiketTaskConfig() {
      if (!state.piketTaskConfig || typeof state.piketTaskConfig !== 'object' || Array.isArray(state.piketTaskConfig)) {
          state.piketTaskConfig = {};
      }
      const next = {};
      uniquePiketTasks(state.piketTaskList).forEach(task => {
          const lower = task.toLowerCase();
          const raw = Number(state.piketTaskConfig[task]);
          const legacyKey = Object.keys(state.piketTaskConfig).find(k => String(k).toLowerCase() === lower);
          const legacyRaw = legacyKey ? Number(state.piketTaskConfig[legacyKey]) : NaN;
          const count = Number.isFinite(raw) ? raw : (Number.isFinite(legacyRaw) ? legacyRaw : (lower === 'bersihkan lantai' ? 2 : 1));
          next[task] = Math.max(1, Math.min(8, Math.round(count)));
      });
      state.piketTaskConfig = next;
      return next;
  }
  function getPiketTaskQuota(task) {
      normalizePiketTaskConfig();
      const n = Number(state.piketTaskConfig[String(task || '')]);
      return Number.isFinite(n) ? Math.max(1, Math.min(8, Math.round(n))) : (String(task || '').toLowerCase() === 'bersihkan lantai' ? 2 : 1);
  }
  function uniquePiketStudents(day) {
      const selectedDay = day || currentPiketDay();
      const seen = new Set();
      const roster = [];
      const daily = state.piketJadwal && typeof state.piketJadwal === 'object' ? state.piketJadwal : {};
      const names = Array.isArray(daily[selectedDay]) ? daily[selectedDay] : [];
      names.forEach(value => {
          const name = String(value || '').trim();
          const key = name.toLowerCase();
          if (!key || seen.has(key)) return;
          seen.add(key);
          roster.push(name);
      });
      return roster;
  }
  function isPiketPlanRosterValid(plan, day) {
      const students = uniquePiketStudents(day);
      const map = piketPlanToStudentMap(plan);
      const keys = Object.keys(map).filter(name => String(name || '').trim());
      if (keys.length !== students.length) return false;
      const expected = new Set(students.map(name => name.toLowerCase()));
      return keys.every(name => expected.has(String(name).toLowerCase()));
  }
  function isPiketPlanTasksValid(plan) {
      if (!plan || typeof plan !== 'object') return false;
      const tasks = new Set(uniquePiketTasks(state.piketTaskList).map(task => task.toLowerCase()));
      const map = piketPlanToStudentMap(plan);
      return Object.values(map).every(task => task && tasks.has(String(task).toLowerCase()));
  }
  function shufflePiket(list) {
      const arr = [...list];
      for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
  }
  function getPreviousPiketWeekPlan(weekKey, day) {
      const selectedDay = day || currentPiketDay();
      const keys = Object.keys(state.piketWeeklyAssignments || {})
          .filter(k => {
              const parsed = parsePiketRotationKey(k);
              return parsed.day === selectedDay
                  && parsed.weekKey < weekKey
                  && state.piketWeeklyAssignments[k]
                  && typeof state.piketWeeklyAssignments[k] === 'object';
          })
          .sort();
      if (!keys.length) return null;
      return state.piketWeeklyAssignments[keys[keys.length - 1]] || null;
  }
  function replaceNameInPiketWeeklyAssignments(oldName, newName) {
      if (!oldName || !newName || oldName === newName || !state.piketWeeklyAssignments) return;
      Object.values(state.piketWeeklyAssignments).forEach(plan => {
          if (!plan || typeof plan !== 'object') return;
          if (plan.assignmentByStudent && Object.prototype.hasOwnProperty.call(plan.assignmentByStudent, oldName)) {
              if (!Object.prototype.hasOwnProperty.call(plan.assignmentByStudent, newName)) {
                  plan.assignmentByStudent[newName] = plan.assignmentByStudent[oldName];
              }
              delete plan.assignmentByStudent[oldName];
          }
          if (plan.assignments && typeof plan.assignments === 'object') {
              Object.keys(plan.assignments).forEach(task => {
                  if (Array.isArray(plan.assignments[task])) {
                      plan.assignments[task] = plan.assignments[task].map(name => name === oldName ? newName : name);
                  }
              });
          }
      });
  }
  function removeNameFromPiketWeeklyAssignments(name) {
      if (!name || !state.piketWeeklyAssignments) return;
      Object.values(state.piketWeeklyAssignments).forEach(plan => {
          if (!plan || typeof plan !== 'object') return;
          if (plan.assignmentByStudent && Object.prototype.hasOwnProperty.call(plan.assignmentByStudent, name)) delete plan.assignmentByStudent[name];
          if (plan.assignments && typeof plan.assignments === 'object') {
              Object.keys(plan.assignments).forEach(task => {
                  if (Array.isArray(plan.assignments[task])) plan.assignments[task] = plan.assignments[task].filter(student => student !== name);
              });
          }
      });
  }
  function piketPlanToStudentMap(plan) {
      const map = {};
      if (!plan || typeof plan !== 'object') return map;
      if (plan.assignmentByStudent && typeof plan.assignmentByStudent === 'object') {
          Object.keys(plan.assignmentByStudent).forEach(name => {
              map[name] = String(plan.assignmentByStudent[name] || '').trim();
          });
          return map;
      }
      const groups = plan.assignments && typeof plan.assignments === 'object' ? plan.assignments : {};
      Object.keys(groups).forEach(task => {
          (Array.isArray(groups[task]) ? groups[task] : []).forEach(name => { map[name] = task; });
      });
      return map;
  }
  function buildPiketTaskSlots(tasks, studentCount) {
      const taskList = shufflePiket(tasks);
      const slots = [];

      // Quota di atas 1 diprioritaskan supaya "Bersihkan lantai" default benar-benar
      // mendapat 2 siswa ketika peserta minimal 2 orang.
      taskList.filter(task => getPiketTaskQuota(task) > 1).forEach(task => {
          for (let i = 0; i < getPiketTaskQuota(task); i++) slots.push(task);
      });
      taskList.filter(task => getPiketTaskQuota(task) === 1).forEach(task => slots.push(task));

      // Kalau jumlah kategori lebih sedikit dari jumlah siswa, isi slot sisanya dengan
      // kategori tunggal lain. Jangan menambah "Bersihkan lantai" di atas quota-nya.
      const fillOrder = shufflePiket(taskList.filter(task => getPiketTaskQuota(task) === 1));
      let fi = 0;
      while (slots.length < studentCount && fillOrder.length) {
          slots.push(fillOrder[fi % fillOrder.length]);
          fi++;
      }

      // Pastikan dua slot sapu tetap ada bila tugas itu aktif dan pesertanya cukup.
      const floor = taskList.find(task => task.toLowerCase() === 'bersihkan lantai');
      if (floor && studentCount >= 2) {
          const floorCount = slots.slice(0, studentCount).filter(task => task.toLowerCase() === floor.toLowerCase()).length;
          for (let need = floorCount; need < Math.min(2, getPiketTaskQuota(floor)); need++) {
              const idx = slots.findIndex((task, i) => i < studentCount && task.toLowerCase() !== floor.toLowerCase());
              if (idx >= 0) slots[idx] = floor;
              else slots.unshift(floor);
          }
      }

      return slots.slice(0, studentCount);
  }
  function buildAutoPiketPlan(rotationKey) {
      const parsedKey = parsePiketRotationKey(rotationKey);
      const tasks = uniquePiketTasks(state.piketTaskList);
      const students = uniquePiketStudents(parsedKey.day);
      if (!tasks.length || !students.length) return null;

      normalizePiketTaskConfig();
      const shuffledStudents = shufflePiket(students);
      const slots = buildPiketTaskSlots(tasks, students.length);
      const previous = getPreviousPiketWeekPlan(parsedKey.weekKey, parsedKey.day);
      const previousMap = piketPlanToStudentMap(previous);
      const assignmentByStudent = {};

      // Hindari sebisa mungkin tugas yang sama dengan pekan sebelumnya, tanpa
      // mengubah jumlah orang per tugas.
      for (let i = 0; i < shuffledStudents.length; i++) {
          if (!slots[i]) break;
          if (previousMap[shuffledStudents[i]] && previousMap[shuffledStudents[i]].toLowerCase() === slots[i].toLowerCase()) {
              let swap = -1;
              for (let j = i + 1; j < slots.length; j++) {
                  if (String(slots[j]).toLowerCase() !== String(previousMap[shuffledStudents[i]]).toLowerCase()) {
                      swap = j;
                      break;
                  }
              }
              if (swap >= 0) [slots[i], slots[swap]] = [slots[swap], slots[i]];
          }
          assignmentByStudent[shuffledStudents[i]] = slots[i];
      }

      const assignments = {};
      tasks.forEach(task => { assignments[task] = []; });
      Object.keys(assignmentByStudent).forEach(student => {
          const task = assignmentByStudent[student];
          if (!assignments[task]) assignments[task] = [];
          assignments[task].push(student);
      });

      return {
          rotationKey,
          weekStart: parsedKey.weekKey,
          day: parsedKey.day,
          mode: 'auto',
          tasks,
          quotas: Object.fromEntries(tasks.map(task => [task, getPiketTaskQuota(task)])),
          assignments,
          assignmentByStudent,
          updatedAt: Date.now()
      };
  }
  function ensurePiketWeeklyPlan(rotationKey) {
      if (!state.piketWeeklyAssignments || typeof state.piketWeeklyAssignments !== 'object' || Array.isArray(state.piketWeeklyAssignments)) {
          state.piketWeeklyAssignments = {};
      }
      const parsedKey = parsePiketRotationKey(rotationKey);
      if (state.piketRotationMode !== 'auto') return state.piketWeeklyAssignments[rotationKey] || null;

      const existing = state.piketWeeklyAssignments[rotationKey];
      const validExisting = existing
          && typeof existing === 'object'
          && isPiketPlanRosterValid(existing, parsedKey.day)
          && isPiketPlanTasksValid(existing);
      if (validExisting) return existing;

      const plan = buildAutoPiketPlan(rotationKey);
      if (!plan) return null;
      state.piketWeeklyAssignments[rotationKey] = plan;
      window.__piketWeeklyAutoSaveQueued = true;
      Promise.resolve().then(() => {
          if (!window.__piketWeeklyAutoSaveQueued) return;
          window.__piketWeeklyAutoSaveQueued = false;
          if (typeof saveState === 'function') saveState();
      });
      return plan;
  }
  function piketTaskShortIcon(task) {
      const t = String(task || '').toLowerCase();
      if (t.includes('sapu') || t.includes('lantai') || t.includes('bersih')) return 'BL';
      if (t.includes('sampah') || t.includes('buang')) return 'BS';
      if (t.includes('jendela')) return 'TJ';
      if (t.includes('meja') || t.includes('kursi') || t.includes('rapikan')) return 'RK';
      if (t.includes('papan') || t.includes('tulis')) return 'PT';
      if (t.includes('lampu') || t.includes('mati')) return 'ML';
      if (t.includes('periksa') || t.includes('cek')) return 'CK';
      return String(task || 'T').trim().slice(0,2).toUpperCase();
  }
  function renderPiketWeeklyRotation() {
      const labelEl = document.getElementById('piket-weekly-label');
      const badgeEl = document.getElementById('piket-rotation-badge');
      const listEl = document.getElementById('piket-weekly-list');
      if (!listEl) return;
      const weekKey = piketWeekStartKey(state.piketSelectedDate || todayKey());
      const day = currentPiketDay();
      const rotationKey = piketRotationKey(weekKey, day);
      const students = uniquePiketStudents(day);
      const studentStat = document.getElementById('piket-weekly-stat-students');
      const taskStat = document.getElementById('piket-weekly-stat-tasks');
      const assignedStat = document.getElementById('piket-weekly-stat-assigned');
      if (labelEl) labelEl.textContent = `${day} · ${formatPiketWeekLabel(weekKey)}`;
      if (badgeEl) {
          const mode = state.piketRotationMode === 'manual' ? 'Manual' : 'Otomatis';
          badgeEl.textContent = mode;
          badgeEl.className = `piket-rotation-badge ${state.piketRotationMode === 'manual' ? 'manual' : 'auto'}`;
      }
      if (studentStat) studentStat.textContent = String(students.length);
      const plan = ensurePiketWeeklyPlan(rotationKey);
      if (!students.length) {
          if (taskStat) taskStat.textContent = '0';
          if (assignedStat) assignedStat.textContent = '0';
          listEl.innerHTML = `<div class="piket-weekly-empty piket-empty-pro"><div class="piket-empty-mark">＋</div><div><b>Belum ada peserta untuk ${escapeHtml(day)}</b><span>Atur siswa di <strong>Jadwal Piket per Hari</strong> terlebih dahulu.</span></div></div>`;
          return;
      }
      if (!plan) {
          if (taskStat) taskStat.textContent = '0';
          if (assignedStat) assignedStat.textContent = '0';
          listEl.innerHTML = `<div class="piket-weekly-empty piket-empty-pro"><div class="piket-empty-mark">↻</div><div><b>Rotasi belum dibuat</b><span>${isAdmin() ? 'Klik <strong>Atur rotasi</strong> untuk membagi tugas minggu ini.' : 'Belum ada pembagian tugas untuk minggu ini.'}</span></div></div>`;
          return;
      }
      const assignments = plan.assignments && typeof plan.assignments === 'object' ? plan.assignments : {};
      const tasks = uniquePiketTasks(plan.tasks && plan.tasks.length ? plan.tasks : state.piketTaskList);
      const activeEntries = tasks.map((task, index) => {
          const people = Array.isArray(assignments[task]) ? assignments[task] : [];
          return { task, index, people };
      }).filter(x => x.people.length);
      const totalAssigned = activeEntries.reduce((sum, x) => sum + x.people.length, 0);
      if (taskStat) taskStat.textContent = String(activeEntries.length);
      if (assignedStat) assignedStat.textContent = `${totalAssigned}/${students.length}`;
      listEl.innerHTML = activeEntries.map(entry => {
          const quota = getPiketTaskQuota(entry.task);
          const short = piketTaskShortIcon(entry.task);
          const names = entry.people.map(name => {
              const initials = String(name).split(/\s+/).map(x => x[0] || '').slice(0,2).join('').toUpperCase();
              return `<div class="piket-person-card"><span class="piket-person-avatar">${escapeHtml(initials || '•')}</span><span class="piket-person-name">${escapeHtml(name)}</span></div>`;
          }).join('');
          return `<article class="piket-week-card piket-week-card-pro ${entry.people.length > 1 ? 'multi-person' : ''}">
              <div class="piket-week-card-top">
                  <div class="piket-week-task-symbol">${escapeHtml(short)}</div>
                  <div class="piket-week-task-meta"><span>TUGAS ${String(entry.index + 1).padStart(2,'0')}</span><span>${entry.people.length}/${quota} ORANG</span></div>
              </div>
              <div class="piket-week-task-main piket-week-task-main-pro">
                  <div class="piket-week-task-name">${escapeHtml(entry.task)}</div>
                  <div class="piket-week-task-people piket-week-task-people-pro">${names}</div>
              </div>
          </article>`;
      }).join('') || `<div class="piket-weekly-empty">Belum ada pembagian tugas.</div>`;
  }

  function renderPiketTaskEditor() {
      const wrap = document.getElementById('piket-task-editor');
      if (!wrap) return;
      normalizePiketTaskList();
      normalizePiketTaskConfig();
      const tasks = uniquePiketTasks(state.piketTaskList);
      wrap.innerHTML = tasks.map((task, index) => `<div class="piket-task-editor-row">
          <input type="text" class="piket-task-input" data-piket-task-index="${index}" value="${escapeHtml(task)}" maxlength="80" placeholder="Nama tugas">
          <label class="piket-task-count"><input type="number" class="piket-task-count-input" min="1" max="8" step="1" value="${getPiketTaskQuota(task)}" aria-label="Jumlah siswa untuk ${escapeHtml(task)}"><span>orang</span></label>
          <button type="button" class="piket-task-remove" aria-label="Hapus tugas" onclick="removePiketTaskInput(${index})">×</button>
      </div>`).join('');
  }
  function addPiketTaskInput() {
      const tasks = uniquePiketTasks(getPiketTaskEditorValues());
      if (tasks.length >= 30) { showNotification('Maksimal 30 tugas piket.', 'warning'); return; }
      tasks.push('Tugas baru');
      state.piketTaskList = tasks;
      normalizePiketTaskConfig();
      state.piketTaskConfig['Tugas baru'] = 1;
      renderPiketTaskEditor();
      const inputs = document.querySelectorAll('#piket-task-editor .piket-task-input');
      const last = inputs[inputs.length - 1];
      if (last) { last.focus(); last.select(); }
  }
  function removePiketTaskInput(index) {
      const before = uniquePiketTasks(getPiketTaskEditorValues());
      const removed = before[index];
      before.splice(index, 1);
      state.piketTaskList = before.filter(Boolean);
      if (removed && state.piketTaskConfig) delete state.piketTaskConfig[removed];
      normalizePiketTaskConfig();
      renderPiketTaskEditor();
      renderPiketManualAssignmentEditor();
  }
  function getPiketTaskEditorValues() {
      const inputs = document.querySelectorAll('#piket-task-editor .piket-task-input');
      return Array.from(inputs).map(el => String(el.value || '').trim()).filter(Boolean);
  }
  function getPiketTaskEditorConfig() {
      const taskInputs = Array.from(document.querySelectorAll('#piket-task-editor .piket-task-input'));
      const countInputs = Array.from(document.querySelectorAll('#piket-task-editor .piket-task-count-input'));
      const config = {};
      taskInputs.forEach((el, index) => {
          const task = String(el.value || '').trim();
          if (!task) return;
          const raw = Number(countInputs[index]?.value);
          config[task] = Math.max(1, Math.min(8, Number.isFinite(raw) ? Math.round(raw) : 1));
      });
      return config;
  }
  function currentPiketWeekKey() { return piketWeekStartKey(state.piketSelectedDate || todayKey()); }
  function setPiketRotationMode(mode) {
      state.piketRotationMode = mode === 'manual' ? 'manual' : 'auto';
      const autoBtn = document.getElementById('piket-rotation-auto-btn');
      const manualBtn = document.getElementById('piket-rotation-manual-btn');
      if (autoBtn) autoBtn.classList.toggle('active', state.piketRotationMode === 'auto');
      if (manualBtn) manualBtn.classList.toggle('active', state.piketRotationMode === 'manual');
      const manualWrap = document.getElementById('piket-manual-assignment-wrap');
      if (manualWrap) manualWrap.style.display = state.piketRotationMode === 'manual' ? '' : 'none';
      renderPiketManualAssignmentEditor();
      renderPiketRotationPreview();
  }
  function openPiketRotationModal() {
      if (guardReadOnly()) return;
      const rotationKey = currentPiketRotationKey();
      const existing = state.piketWeeklyAssignments && state.piketWeeklyAssignments[rotationKey];
      if (existing && existing.tasks && existing.tasks.length) {
          state.piketTaskList = uniquePiketTasks(existing.tasks);
          if (existing.quotas && typeof existing.quotas === 'object') state.piketTaskConfig = Object.assign({}, existing.quotas);
      }
      normalizePiketTaskList();
      normalizePiketTaskConfig();
      renderPiketTaskEditor();
      setPiketRotationMode(state.piketRotationMode);
      openModal('piket-rotasi');
  }
  function renderPiketManualAssignmentEditor() {
      const wrap = document.getElementById('piket-manual-assignment-list');
      if (!wrap || state.piketRotationMode !== 'manual') return;
      const tasks = uniquePiketTasks(getPiketTaskEditorValues());
      const rotationKey = currentPiketRotationKey();
      const existing = state.piketWeeklyAssignments && state.piketWeeklyAssignments[rotationKey];
      const previousMap = piketPlanToStudentMap(existing);
      const students = uniquePiketStudents(currentPiketDay());
      wrap.innerHTML = students.length ? students.map(student => {
          const selected = previousMap[student] && tasks.includes(previousMap[student]) ? previousMap[student] : '';
          return `<div class="piket-manual-row"><span class="piket-manual-name">${escapeHtml(student)}</span><select data-piket-student="${escapeHtml(student)}"><option value="">Pilih tugas</option>${tasks.map(task => `<option value="${escapeHtml(task)}" ${selected === task ? 'selected' : ''}>${escapeHtml(task)} (${getPiketTaskQuota(task)} org.)</option>`).join('')}</select></div>`;
      }).join('') : '<div class="empty">Belum ada siswa yang diatur untuk piket hari ini.</div>';
  }
  function renderPiketRotationPreview() {
      const el = document.getElementById('piket-rotation-preview');
      if (!el) return;
      const students = uniquePiketStudents(currentPiketDay());
      if (!students.length) {
          el.textContent = `Tidak ada siswa piket untuk ${currentPiketDay()}.`;
          return;
      }
      if (state.piketRotationMode === 'manual') {
          el.textContent = `Manual: ${students.length} siswa • Bersihkan lantai maksimal ${getPiketTaskQuota('Bersihkan lantai')} orang.`;
          return;
      }
      const plan = buildAutoPiketPlan(currentPiketRotationKey());
      if (!plan) { el.textContent = 'Tambahkan minimal satu tugas dan atur siswa piket pada hari ini.'; return; }
      const preview = uniquePiketTasks(plan.tasks).map(task => `${task}: ${(plan.assignments[task] || []).length}`).filter(Boolean).join(' • ');
      el.textContent = `Preview ${students.length} siswa: ` + preview;
  }
  async function savePiketRotation() {
      if (guardReadOnly()) return;
      const tasks = uniquePiketTasks(getPiketTaskEditorValues());
      if (!tasks.length) { showNotification('Tambahkan minimal satu tugas piket.', 'warning'); return; }
      const students = uniquePiketStudents(currentPiketDay());
      if (!students.length) { showNotification(`Belum ada siswa yang diatur untuk piket ${currentPiketDay()}.`, 'warning'); return; }

      state.piketTaskList = tasks;
      state.piketTaskConfig = getPiketTaskEditorConfig();
      normalizePiketTaskConfig();
      if (!state.piketWeeklyAssignments || typeof state.piketWeeklyAssignments !== 'object' || Array.isArray(state.piketWeeklyAssignments)) state.piketWeeklyAssignments = {};
      const rotationKey = currentPiketRotationKey();
      const parsedKey = parsePiketRotationKey(rotationKey);

      if (state.piketRotationMode === 'auto') {
          const plan = buildAutoPiketPlan(rotationKey);
          if (!plan) { showNotification('Rotasi otomatis belum bisa dibuat.', 'warning'); return; }
          state.piketWeeklyAssignments[rotationKey] = plan;
          const saveResult = await saveState();
          if (!saveResult || saveResult.synced === false || !saveResult.publicSynced) {
              showNotification('Rotasi dibuat, tetapi belum dikonfirmasi tersimpan ke Firebase.', 'error', 7000);
              return;
          }
          renderPiketWeeklyRotation();
          renderPiket();
          renderBeranda();
          closeModal('piket-rotasi');
          showNotification(`Rotasi ${parsedKey.day} minggu ini sudah diacak dan tersimpan.`, 'success');
          return;
      }

      const selects = document.querySelectorAll('#piket-manual-assignment-list [data-piket-student]');
      const assignmentByStudent = {};
      let missing = 0;
      selects.forEach(select => {
          const name = select.getAttribute('data-piket-student') || '';
          const task = String(select.value || '').trim();
          if (name) assignmentByStudent[name] = task;
          if (!task) missing++;
      });
      if (missing) { showNotification(`${missing} siswa belum mendapat tugas piket.`, 'warning'); return; }

      const counts = {};
      Object.values(assignmentByStudent).forEach(task => { counts[task] = (counts[task] || 0) + 1; });
      for (const task of Object.keys(counts)) {
          const quota = getPiketTaskQuota(task);
          if (counts[task] > quota) {
              showNotification(`Tugas "${task}" maksimal ${quota} orang.`, 'warning');
              return;
          }
      }
      const floorTask = tasks.find(task => task.toLowerCase() === 'bersihkan lantai');
      if (floorTask && students.length >= 2 && (counts[floorTask] || 0) < Math.min(2, getPiketTaskQuota(floorTask))) {
          showNotification('Bersihkan lantai harus mendapat 2 siswa pada rotasi ini.', 'warning');
          return;
      }

      const assignments = {};
      tasks.forEach(task => { assignments[task] = []; });
      Object.keys(assignmentByStudent).forEach(student => {
          const task = assignmentByStudent[student];
          if (!assignments[task]) assignments[task] = [];
          assignments[task].push(student);
      });
      const plan = {
          rotationKey,
          weekStart: parsedKey.weekKey,
          day: parsedKey.day,
          mode: 'manual',
          tasks,
          quotas: Object.fromEntries(tasks.map(task => [task, getPiketTaskQuota(task)])),
          assignments,
          assignmentByStudent,
          updatedAt: Date.now()
      };
      state.piketWeeklyAssignments[rotationKey] = plan;
      const saveResult = await saveState();
      if (!saveResult || saveResult.synced === false || !saveResult.publicSynced) {
          showNotification('Rotasi manual sudah dibuat, tetapi belum dikonfirmasi tersimpan ke Firebase.', 'error', 7000);
          return;
      }
      renderPiketWeeklyRotation();
      renderPiket();
      renderBeranda();
      closeModal('piket-rotasi');
      showNotification(`Rotasi manual ${parsedKey.day} tersimpan.`, 'success');
  }
  // ===== JADWAL PELAJARAN =====
  function renderDayTabs() {
      const wrap = document.getElementById('day-tabs');
      if (!wrap) return;
      if (!DAY_NAMES.includes(state.selectedDay)) state.selectedDay = DAY_NAMES[0];
      wrap.innerHTML = DAY_NAMES.map(d => `
          <button type="button"
                  class="day-chip ${state.selectedDay===d?'active':''}"
                  data-jadwal-day="${escapeHtml(d)}"
                  aria-pressed="${state.selectedDay===d ? 'true' : 'false'}">
              ${escapeHtml(d)}
          </button>
      `).join('');
  }
  function selectDay(d) {
      if (!DAY_NAMES.includes(d)) return;
      if (!state.jadwal || typeof state.jadwal !== 'object' || Array.isArray(state.jadwal)) {
          state.jadwal = {};
      }
      if (!Array.isArray(state.jadwal[d])) state.jadwal[d] = [];
      state.selectedDay = d;
      renderDayTabs();
      renderJadwalList();
  }
  function renderJadwalList() {
      const wrap = document.getElementById('jadwal-list');
      if (!wrap) return;
      if (!state.jadwal || typeof state.jadwal !== 'object' || Array.isArray(state.jadwal)) {
          state.jadwal = {};
      }
      const items = Array.isArray(state.jadwal[state.selectedDay]) ? state.jadwal[state.selectedDay] : [];
      const readOnly = isReadOnly();
      wrap.innerHTML = items.length ? items.map(j => `
          <div class="row-item" ${readOnly ? '' : `onclick="openJadwalModal(${Number(j.id)})"`} style="${readOnly ? '' : 'cursor:pointer;'}">
              <div class="row-time">${escapeHtml(j.jam || '')}</div>
              <div><div class="row-title">${escapeHtml(j.mapel || '')}</div><div class="row-sub">${escapeHtml(j.guru || '')}</div></div>
          </div>
      `).join('') : `<div class="empty">Tidak ada jadwal pelajaran.</div>`;
  }
  function openJadwalModal(id) {
      if (guardReadOnly()) return;

      document.getElementById('jadwal-hari').innerHTML = DAY_NAMES.map(d => `<option value="${d}">${d}</option>`).join('');
      if (id) {
          let found = null, foundDay = null;
          for (let day in state.jadwal) {
              const item = (state.jadwal[day] || []).find(j => j.id === Number(id));
              if (item) { found = item; foundDay = day; break; }
          }
          if (!found) return;
          const [mulai, selesai] = (found.jam || '').split('-');
          document.getElementById('jadwal-hari').value = foundDay;
          document.getElementById('jadwal-mulai').value = mulai || '';
          document.getElementById('jadwal-selesai').value = selesai || '';
          document.getElementById('jadwal-mapel').value = found.mapel || '';
          document.getElementById('jadwal-guru').value = found.guru || '';
          document.getElementById('jadwal-edit-id').value = found.id;
          document.getElementById('jadwal-delete-btn').style.display = '';
          document.getElementById('jadwal-modal-title').textContent = 'Edit Jam Pelajaran';
      } else {
          document.getElementById('jadwal-hari').value = state.selectedDay || DAY_NAMES[0];
          document.getElementById('jadwal-mulai').value = '';
          document.getElementById('jadwal-selesai').value = '';
          document.getElementById('jadwal-mapel').value = '';
          document.getElementById('jadwal-guru').value = '';
          document.getElementById('jadwal-edit-id').value = '';
          document.getElementById('jadwal-delete-btn').style.display = 'none';
          document.getElementById('jadwal-modal-title').textContent = 'Atur Jam Pelajaran';
      }
      openModal('jadwal');
  }
  function submitJadwal() {
      if (guardReadOnly()) return;
      const hari = document.getElementById('jadwal-hari').value;
      const mulai = document.getElementById('jadwal-mulai').value;
      const selesai = document.getElementById('jadwal-selesai').value;
      const mapel = document.getElementById('jadwal-mapel').value.trim();
      const guru = document.getElementById('jadwal-guru').value.trim();
      const editId = document.getElementById('jadwal-edit-id').value;
      if (!mapel || !mulai || !selesai) { showNotification('Isi semua field!', 'warning'); return; }
      if (!state.jadwal[hari]) state.jadwal[hari] = [];
      if (editId) {
          for (let day in state.jadwal) { state.jadwal[day] = state.jadwal[day].filter(j => j.id !== Number(editId)); }
          state.jadwal[hari].push({ id: Number(editId), jam: mulai+'-'+selesai, mapel, guru });
          addActivity('Mengubah jadwal', mapel + ' · ' + hari + ' ' + mulai + '-' + selesai);
          addNotification('Jadwal diperbarui', mapel + ' · ' + hari + ' ' + mulai + '-' + selesai, {role:'siswa'});
          saveState(); renderJadwalList(); renderBeranda(); closeModal('jadwal'); showNotification('Jadwal berhasil diperbarui.', 'success'); return;
      }
      state.jadwal[hari].push({ id: Date.now(), jam: mulai+'-'+selesai, mapel, guru });
      addActivity('Menambahkan jadwal', mapel + ' · ' + hari + ' ' + mulai + '-' + selesai);
      addNotification('Jadwal baru', mapel + ' · ' + hari + ' ' + mulai + '-' + selesai, {role:'siswa'});
      saveState(); renderJadwalList(); renderBeranda(); closeModal('jadwal'); showNotification('Jadwal berhasil ditambahkan.', 'success');
  }
  function deleteJadwalCurrent() {
      if (guardReadOnly()) return;
      const editId = document.getElementById('jadwal-edit-id').value;
      if (!editId) return;
      if (!confirm('Hapus jadwal ini?')) return;
      let deletedSchedule = null;
      for (let day in state.jadwal) {
          const hit = (state.jadwal[day] || []).find(j => j.id === Number(editId));
          if (hit) deletedSchedule = hit;
          state.jadwal[day] = state.jadwal[day].filter(j => j.id !== Number(editId));
      }
      addActivity('Menghapus jadwal', deletedSchedule ? deletedSchedule.mapel + ' · ' + (deletedSchedule.guru || '') : 'Jadwal');
      saveState(); renderJadwalList(); renderBeranda(); closeModal('jadwal'); showNotification('Jadwal dihapus.', 'info');
  }
  function setJadwalMode(mode) {
      state.jadwalMode = mode;
      document.getElementById('mode-pelajaran').classList.toggle('active', mode === 'pelajaran');
      document.getElementById('mode-piket').classList.toggle('active', mode === 'piket');
      document.getElementById('jadwal-mode-pelajaran').style.display = mode === 'pelajaran' ? 'block' : 'none';
      document.getElementById('jadwal-mode-piket').style.display = mode === 'piket' ? 'block' : 'none';
      if (mode === 'pelajaran') {
          renderDayTabs();
          renderJadwalList();
      }
  }
  // ===== TUGAS =====
  function cleanTaskText(value){ return String(value == null ? "" : value).replace(/\bvidio\b/gi, "video"); }
  function renderTaskFiles(t) {
      const files = getItemFiles(t);
      if (!files.length) return '';
      return `<div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px;">` +
          files.map((f, idx) => `<div class="task-file" onclick="event.stopPropagation(); openTaskFileAt(${t.id},${idx})">📎 ${escapeHtml(f.name)}</div>`).join('') +
          `</div>`;
  }
  function autoCleanDoneTugas() {
      const days = (state.autoCleanTugasDays !== undefined && state.autoCleanTugasDays !== null) ? state.autoCleanTugasDays : 7;
      const now = Date.now();
      let changed = false;
      state.tugas.forEach(t => { if (t.selesai && !t.selesaiAt) { t.selesaiAt = now; changed = true; } });
      if (days > 0) {
          const thresholdMs = days * 24 * 60 * 60 * 1000;
          const expiredTasks = state.tugas.filter(t => t.selesai && t.selesaiAt && (now - t.selesaiAt) > thresholdMs);
          if (expiredTasks.length) {
              expiredTasks.forEach(t => void deleteDriveAttachments(getItemFiles(t), 'task'));
              state.tugas = state.tugas.filter(t => !(t.selesai && t.selesaiAt && (now - t.selesaiAt) > thresholdMs));
              changed = true;
          }
      }
      if (changed) saveState();
  }
  function renderTugas() {
      autoCleanDoneTugas();
      const acDays = (state.autoCleanTugasDays !== undefined && state.autoCleanTugasDays !== null) ? state.autoCleanTugasDays : 7;
      const hintEl = document.getElementById('tugas-autoclean-hint');
      if (hintEl) hintEl.textContent = acDays > 0 ? `Otomatis terhapus ${acDays} hari setelah dicentang selesai. Atur di Setelan.` : 'Auto-hapus dimatikan (atur di Setelan).';
      const open = state.tugas.filter(t => !t.selesai);
      const done = state.tugas.filter(t => t.selesai);
      const readOnly = isReadOnly();

      document.getElementById('tugas-open-list').innerHTML = open.length ? open.map(t => `
          <div class="task-item">
              <div class="checkbox admin-only" onclick="event.stopPropagation(); toggleTugas(${t.id})"></div>
              <div style="flex:1; ${readOnly ? '' : 'cursor:pointer;'}" ${readOnly ? '' : `onclick="openTugasModal(${t.id})"`}>
                  <div class="task-title">${escapeHtml(cleanTaskText(t.nama))}</div>
                  <div class="task-meta"><span class="pill">📚 ${escapeHtml(t.mapel || 'Tanpa mata pelajaran')}</span><span class="pill pill-due">📅 ${t.tenggat || 'Tanpa deadline'}</span>${getItemFiles(t).length ? '<span class="pill task-pill-file">📎 Lampiran</span>' : ''}${t.driveLink ? '<span class="pill task-pill-drive">☁️ Google Drive</span>' : ''}</div>
                  ${t.deskripsi ? `<div class="task-desc">${escapeHtml(cleanTaskText(t.deskripsi))}</div>` : ''}
                  ${t.driveLink ? `<div class="task-drive-link"><a href="${escapeHtml(t.driveLink)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">☁️ Buka folder Google Drive untuk mengumpulkan</a></div>` : ''}
                  ${renderTaskFiles(t)}
              </div>
              <button class="s-remove admin-only" onclick="event.stopPropagation(); deleteTugas(${t.id})">×</button>
          </div>
      `).join('') : `<div class="empty">Tidak ada tugas aktif 🎉</div>`;

      document.getElementById('tugas-done-list').innerHTML = done.length ? done.map(t => `
          <div class="task-item">
              <div class="checkbox checked admin-only" onclick="event.stopPropagation(); toggleTugas(${t.id})">✓</div>
              <div style="flex:1; ${readOnly ? '' : 'cursor:pointer;'}" ${readOnly ? '' : `onclick="openTugasModal(${t.id})"`}>
                  <div class="task-title checked">${escapeHtml(cleanTaskText(t.nama))}</div>
                  <div class="task-meta"><span class="pill">📚 ${escapeHtml(t.mapel || 'Tanpa mata pelajaran')}</span><span class="pill pill-due">📅 ${t.tenggat || 'Tanpa deadline'}</span>${getItemFiles(t).length ? '<span class="pill task-pill-file">📎 Lampiran</span>' : ''}${t.driveLink ? '<span class="pill task-pill-drive">☁️ Google Drive</span>' : ''}</div>
                  ${t.deskripsi ? `<div class="task-desc" style="text-decoration:line-through; color:var(--text-muted);">${escapeHtml(cleanTaskText(t.deskripsi))}</div>` : ''}
                  ${t.driveLink ? `<div class="task-drive-link task-drive-link-done"><a href="${escapeHtml(t.driveLink)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">☁️ Buka folder Google Drive</a></div>` : ''}
                  ${renderTaskFiles(t)}
              </div>
              <button class="s-remove admin-only" onclick="event.stopPropagation(); deleteTugas(${t.id})">×</button>
          </div>
      `).join('') : `<div class="empty">Belum ada tugas selesai.</div>`;
  }
  function clearDoneTugas() {
      if (guardReadOnly()) return;
      const doneCount = state.tugas.filter(t => t.selesai).length;
      if (!doneCount) { showNotification('Tidak ada tugas selesai untuk dibersihkan.', 'info'); return; }
      if (!confirm('Hapus semua (' + doneCount + ') tugas yang sudah selesai? Tindakan ini tidak bisa dibatalkan.')) return;
      const deletedTasks = state.tugas.filter(t => t.selesai);
      deletedTasks.forEach(t => void deleteDriveAttachments(getItemFiles(t), 'task'));
      state.tugas = state.tugas.filter(t => !t.selesai);
      saveState(); renderTugas(); renderBeranda(); showNotification('Tugas yang sudah selesai berhasil dibersihkan.', 'success');
  }
  function normalizeAttachment(file) {
      if (!file || typeof file !== 'object') return null;
      const driveFileId = String(file.driveFileId || file.driveId || file.fileId || file.id || '').trim();
      const driveUrl = String(file.driveUrl || file.url || file.fileUrl || '').trim();
      return {
          name: file.name || file.file || 'File',
          data: file.data || file.fileData || '',
          driveFileId,
          driveUrl,
          sizeBytes: Number(file.sizeBytes || file.size || 0),
          mimeType: file.mimeType || file.fileMimeType || '',
          storage: file.storage || (driveFileId || driveUrl ? 'google-drive' : '')
      };
  }
  function getItemFiles(item) {
      if (!item || typeof item !== 'object') return [];
      if (Array.isArray(item.files) && item.files.length) {
          return item.files.map(normalizeAttachment).filter(Boolean);
      }
      if (item.file || item.fileData || item.driveFileId || item.driveId || item.fileId || item.driveUrl || item.url) {
          const normalized = normalizeAttachment({
              name: item.file || item.name,
              data: item.fileData || item.data || '',
              driveFileId: item.driveFileId || item.driveId || item.fileId || '',
              driveUrl: item.driveUrl || item.url || item.fileUrl || '',
              sizeBytes: item.fileSize || item.sizeBytes || item.size || 0,
              mimeType: item.fileMimeType || item.mimeType || '',
              storage: item.storage || ''
          });
          return normalized ? [normalized] : [];
      }
      return [];
  }
  function openTaskFileAt(id, idx) {
      const t = state.tugas.find(x => x.id === Number(id));
      if (!t) return;
      const files = getItemFiles(t);
      const f = files[idx];
      if (!f) return;
      openStoredAttachment(normalizeAttachment(f));
  }
  let _tugasEditFiles = [];
  function renderTugasFileChips() {
      const wrap = document.getElementById('tugas-file-chips');
      wrap.innerHTML = _tugasEditFiles.map((f, idx) => `
          <div class="file-chip">📎 ${escapeHtml(f.name)}<span class="file-chip-remove" onclick="removeTugasEditFile(${idx})">×</span></div>
      `).join('');
  }
  function removeTugasEditFile(idx) { _tugasEditFiles.splice(idx,1); renderTugasFileChips(); }
  async function onTugasFileSelected(input) {
      const remainingSlots = MAX_FILES_PER_ITEM - _tugasEditFiles.length;
      const picked = Array.from(input.files || []);
      if (picked.length > remainingSlots) { showNotification('Maksimal ' + MAX_FILES_PER_ITEM + ' file per tugas. Sisa slot: ' + remainingSlots + '.', 'error'); input.value = ''; return; }
      for (const file of picked) {
          try {
              const attachment = await prepareAttachment(file);
              _tugasEditFiles.push({ name: attachment.name, data: attachment.data, sizeBytes: attachment.sizeBytes, mimeType: attachment.mimeType, storage:'pending' });
              if (attachment.compressed) showNotification('Gambar "' + file.name + '" dikompres otomatis menjadi ' + Math.round((attachment.data.length * 3 / 4) / 1024) + 'KB.', 'success');
          } catch (e) { showNotification('File "' + file.name + '": ' + (e.message || 'gagal diproses') + (driveStorageEnabled() ? '' : ' — Google Drive belum terhubung, jadi batas penyimpanan lokal berlaku.') + '.', 'error', 6000); }
      }
      input.value = '';
      renderTugasFileChips();
  }
  function openTugasModal(id) {
      if (guardReadOnly()) return;

      const fileInput = document.getElementById('tugas-file');
      fileInput.value = '';
      if (id) {
          const t = state.tugas.find(x => x.id === Number(id));
          if (!t) return;
          document.getElementById('tugas-nama').value = t.nama || '';
          document.getElementById('tugas-mapel').value = t.mapel || '';
          document.getElementById('tugas-tenggat').value = t.tenggat || '';
          document.getElementById('tugas-drive-link').value = t.driveLink || '';
          document.getElementById('tugas-deskripsi').value = t.deskripsi || '';
          document.getElementById('tugas-edit-id').value = t.id;
          document.getElementById('tugas-modal-title').textContent = 'Edit Tugas';
          document.getElementById('tugas-delete-btn').style.display = '';
          _tugasEditFiles = getItemFiles(t).map(f => ({ ...f }));
      } else {
          document.getElementById('tugas-nama').value = '';
          document.getElementById('tugas-mapel').value = '';
          document.getElementById('tugas-tenggat').value = '';
          document.getElementById('tugas-drive-link').value = '';
          document.getElementById('tugas-deskripsi').value = '';
          document.getElementById('tugas-edit-id').value = '';
          document.getElementById('tugas-modal-title').textContent = 'Tambah Tugas';
          document.getElementById('tugas-delete-btn').style.display = 'none';
          _tugasEditFiles = [];
      }
      renderTugasFileChips();
      openModal('tugas');
  }
  const IMAGE_TARGET_BYTES = 500 * 1024;
  const MAX_FILES_PER_ITEM = 3;
  function currentAttachmentLimit() {
      return driveStorageEnabled() ? DRIVE_ATTACHMENT_BYTES : LEGACY_ATTACHMENT_BYTES;
  }
  function base64FromDataUrl(dataUrl) {
      const str = String(dataUrl || '');
      const comma = str.indexOf(',');
      return comma >= 0 ? str.slice(comma + 1) : str;
  }
  function mimeTypeFromFilename(name) {
      const ext = String(name || '').toLowerCase().split('.').pop();
      return ({
          pdf:'application/pdf',
          doc:'application/msword',
          docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          xls:'application/vnd.ms-excel',
          xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ppt:'application/vnd.ms-powerpoint',
          pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          rtf:'application/rtf', txt:'text/plain', csv:'text/csv', zip:'application/zip',
          jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp', gif:'image/gif',

      })[ext] || 'application/octet-stream';
  }
  function isAllowedAttachmentHost(url) {
      try {
          const u = new URL(url, window.location.href);
          if (u.protocol !== 'https:') return false;
          const host = u.hostname.toLowerCase();
          return host === 'drive.google.com'
              || host === 'docs.google.com'
              || host === 'drive.usercontent.google.com'
              || host === 'lh3.googleusercontent.com';
      } catch (_) {
          return false;
      }
  }
  function attachmentUrl(file) {
      if (!file) return '';
      const id = String(file.driveFileId || file.driveId || file.fileId || '').trim();
      if (id) return 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/view';
      const directUrl = String(file.driveUrl || file.url || file.fileUrl || '').trim();
      return directUrl && isAllowedAttachmentHost(directUrl) ? directUrl : '';
  }
  function openStoredAttachment(file) {
      if (!file) return;
      const url = attachmentUrl(file);
      if (url) {
          // Gunakan anchor/link biasa agar pembukaan file berasal langsung dari
          // aksi klik pengguna dan tidak dianggap sebagai popup script oleh browser.
          const link = document.createElement('a');
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          link.remove();
          return;
      }
      if (file.data) { openFileData(file.data, file.name); return; }
      showNotification('File tidak memiliki lokasi penyimpanan yang valid.', 'error');
  }
  async function uploadPreparedAttachment(prepared, category) {
      if (!driveStorageEnabled()) {
          return { name: prepared.name, data: prepared.data, sizeBytes: prepared.sizeBytes, mimeType: prepared.mimeType };
      }
      const result = await driveApiRequest({
          action: 'upload',
          category,
          filename: prepared.name,
          mimeType: prepared.mimeType || 'application/octet-stream',
          base64: base64FromDataUrl(prepared.data),
          sizeBytes: prepared.sizeBytes || 0
      });
      const file = result.file || {};
      return {
          name: file.name || prepared.name,
          data: '',
          driveFileId: String(file.driveFileId || file.fileId || file.id || '').trim(),
          driveUrl: String(file.driveUrl || file.url || '').trim(),
          sizeBytes: Number(file.sizeBytes || prepared.sizeBytes || 0),
          mimeType: file.mimeType || prepared.mimeType || '',
          storage: 'google-drive'
      };
  }
  async function deleteDriveAttachment(file, category) {
      if (!driveStorageEnabled() || !file || !file.driveFileId) return;
      try {
          await driveApiRequest({ action:'delete', fileId:file.driveFileId, category });
      } catch (e) {
          console.warn('Drive file delete failed:', e);
      }
  }
  async function deleteDriveAttachments(files, category) {
      if (!driveStorageEnabled() || !Array.isArray(files)) return;
      for (const file of files) {
          await deleteDriveAttachment(file, category);
      }
  }
  function dataUrlToBlob(dataUrl) {
      const parts = dataUrl.split(',');
      const mimeMatch = parts[0].match(/data:(.*?);base64/);
      const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
      const binary = atob(parts[1]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: mime });
  }
  function openFileData(dataUrl, filename) {
      try {
          const blob = dataUrlToBlob(dataUrl);
          const blobUrl = URL.createObjectURL(blob);
          const win = window.open(blobUrl, '_blank');
          if (!win) {
              const a = document.createElement('a');
              a.href = blobUrl;
              a.download = filename || 'file';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              showNotification('File sedang diunduh (pratinjau diblokir browser).', 'info');
          }
          setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      } catch (e) { showNotification(clientSafeError('Gagal membuka file. Coba lagi.'), 'error'); }
  }
  function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
      });
  }
  function attachmentNameForWebp(name) {
      return String(name || 'gambar').replace(/\.[^.]+$/, '') + '.webp';
  }
  async function compressImageAttachment(file) {
      const sourceUrl = URL.createObjectURL(file);
      try {
          const image = new Image();
          await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = sourceUrl; });
          const largest = Math.max(image.naturalWidth, image.naturalHeight);
          const scale = largest > 1600 ? 1600 / largest : 1;
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          let quality = 0.86;
          let compressed;
          do {
              compressed = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
              quality -= 0.08;
          } while (compressed && compressed.size > IMAGE_TARGET_BYTES && quality >= 0.30);
          if (!compressed) throw new Error('Browser tidak mendukung kompresi gambar');
          return new File([compressed], attachmentNameForWebp(file.name), { type: 'image/webp' });
      } finally { URL.revokeObjectURL(sourceUrl); }
  }
  const ALLOWED_ATTACHMENT_MIME = new Set([
      'application/pdf','application/msword','application/rtf','text/plain','text/csv',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel','application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/zip','application/x-zip-compressed',
      'image/jpeg','image/png','image/webp','image/gif'
  ]);
  const ALLOWED_ATTACHMENT_EXT = new Set(['pdf','doc','docx','xls','xlsx','ppt','pptx','rtf','txt','csv','zip','jpg','jpeg','png','webp','gif']);
  function validateAttachmentTypeClient(file) {
      const name = String(file && file.name || '');
      const ext = name.toLowerCase().split('.').pop();
      const mime = String(file && file.type || '').toLowerCase();
      if (!ALLOWED_ATTACHMENT_EXT.has(ext)) {
          throw new Error('Jenis file tidak diizinkan. Gunakan PDF, DOC/DOCX, XLSX, JPG/JPEG, PNG, atau WEBP.');
      }
      if (!ALLOWED_ATTACHMENT_MIME.has(mime)) {
          throw new Error('Tipe file tidak diizinkan: ' + (mime || 'tidak diketahui') + '.');
      }
      const expected = {
          pdf:['application/pdf'], doc:['application/msword'], docx:['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
          xls:['application/vnd.ms-excel'], xlsx:['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
          ppt:['application/vnd.ms-powerpoint'], pptx:['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
          rtf:['application/rtf','text/rtf'], txt:['text/plain'], csv:['text/csv','application/csv'],
          zip:['application/zip','application/x-zip-compressed'], jpg:['image/jpeg','image/pjpeg'], jpeg:['image/jpeg','image/pjpeg'],
          png:['image/png'], webp:['image/webp'], gif:['image/gif']
      };
      if (mime && expected[ext] && !expected[ext].includes(mime)) {
          throw new Error('Tipe file tidak cocok dengan ekstensi .' + ext + '.');
      }
      return true;
  }

  async function prepareAttachment(file) {
      validateAttachmentTypeClient(file);
      let prepared = file, compressed = false;
      if ((file.type || '').startsWith('image/')) {
          prepared = await compressImageAttachment(file);
          compressed = prepared.size < file.size;
      }
      const limit = currentAttachmentLimit();
      if (prepared.size > limit) {
          throw new Error('Ukuran akhir ' + formatStorageBytes(prepared.size) + ' melebihi batas ' + formatStorageBytes(limit) + '. Untuk PDF/dokumen, kecilkan file sebelum upload.');
      }
      return {
          name: prepared.name,
          data: await readFileAsDataUrl(prepared),
          sizeBytes: prepared.size,
          mimeType: prepared.type || file.type || mimeTypeFromFilename(prepared.name) || 'application/octet-stream',
          compressed
      };
  }
  function normalizeTugasDriveLink(value) {
      const raw = String(value || '').trim();
      if (!raw) return '';
      try {
          const u = new URL(raw);
          const host = u.hostname.toLowerCase();
          if (u.protocol !== 'https:' || (host !== 'drive.google.com' && host !== 'docs.google.com')) {
              throw new Error('Gunakan tautan Google Drive/Docs dengan HTTPS.');
          }
          return u.href;
      } catch (e) {
          throw new Error(e && e.message ? e.message : 'Tautan Google Drive tidak valid.');
      }
  }
  async function submitTugas() {
      if (guardReadOnly()) return;
      const nama = document.getElementById('tugas-nama').value.trim();
      const mapel = document.getElementById('tugas-mapel').value.trim();
      const tenggat = document.getElementById('tugas-tenggat').value;
      const driveLinkRaw = document.getElementById('tugas-drive-link').value.trim();
      const deskripsi = document.getElementById('tugas-deskripsi').value.trim();
      const editId = document.getElementById('tugas-edit-id').value;
      if (!nama) { showNotification('Nama tugas wajib diisi.', 'warning'); return; }

      let driveLink = '';
      try {
          driveLink = normalizeTugasDriveLink(driveLinkRaw);
      } catch (e) {
          showNotification('Link Google Drive: ' + (e.message || 'tidak valid') + '.', 'warning', 5000);
          return;
      }

      let files;
      try {
          files = [];
          for (const file of _tugasEditFiles.slice()) {
              if (driveStorageEnabled() && file.driveFileId) {
                  files.push({
                      name:file.name,
                      driveFileId:file.driveFileId,
                      driveUrl:file.driveUrl || attachmentUrl(file),
                      sizeBytes:Number(file.sizeBytes || file.size || 0),
                      mimeType:file.mimeType || '',
                      storage:'google-drive'
                  });
              } else if (file.data) {
                  files.push(await uploadPreparedAttachment(file, 'task'));
              } else {
                  files.push(file);
              }
          }
      } catch (e) {
          showNotification('Gagal menyimpan lampiran tugas: ' + (e.message || 'error'), 'error', 5000);
          return;
      }

      if (editId) {
          const t = state.tugas.find(x => x.id === Number(editId));
          if (t) {
              const previousFiles = getItemFiles(t);
              const keptDriveIds = new Set(files.map(f => f.driveFileId).filter(Boolean));
              previousFiles.forEach(oldFile => {
                  if (oldFile.driveFileId && !keptDriveIds.has(oldFile.driveFileId)) {
                      void deleteDriveAttachment(oldFile, 'task');
                  }
              });
              t.nama = nama; t.mapel = mapel; t.tenggat = tenggat; t.driveLink = driveLink; t.deskripsi = deskripsi; t.files = files;
              delete t.file; delete t.fileData;
          }
          addActivity('Mengubah tugas', t ? t.nama : 'Tugas');
          addNotification('Tugas diperbarui', 'Tugas ' + (t ? t.nama : '') + ' telah diperbarui.', {role:'siswa'});
          await saveState(); renderTugas(); renderBeranda(); closeModal('tugas'); showNotification('Tugas berhasil diperbarui.', 'success'); return;
      }
      state.tugas.push({ id: Date.now(), nama, mapel, tenggat, driveLink, deskripsi, files, selesai: false });
      document.getElementById('tugas-deskripsi').value = '';
      addActivity('Menambahkan tugas', nama);
      addNotification('Tugas baru', 'Tugas baru: ' + nama + (tenggat ? ' · Deadline ' + tenggat : ''), {role:'siswa'});
      await saveState(); renderTugas(); renderBeranda(); closeModal('tugas'); showNotification('Tugas berhasil ditambahkan.', 'success');
  }
  function deleteTugasCurrent() {
      if (guardReadOnly()) return;
      const editId = document.getElementById('tugas-edit-id').value;
      if (!editId) return;
      if (!confirm('Hapus tugas ini?')) return;
      const deletedTask = state.tugas.find(t => t.id === Number(editId));
      if (deletedTask) void deleteDriveAttachments(getItemFiles(deletedTask), 'task');
      state.tugas = state.tugas.filter(t => t.id !== Number(editId));
      addActivity('Menghapus tugas', deletedTask ? deletedTask.nama : 'Tugas');
      saveState(); renderTugas(); renderBeranda(); closeModal('tugas'); showNotification('Tugas dihapus.', 'info');
  }
  function toggleTugas(id) {
      if (guardReadOnly()) return;
      const t = state.tugas.find(x => x.id === id);
      if (t) { t.selesai = !t.selesai; if (t.selesai) { t.selesaiAt = Date.now(); } else { delete t.selesaiAt; } }
      saveState(); renderTugas(); renderBeranda();
  }
  function deleteTugas(id) {
      if (guardReadOnly()) return;
      const deletedTask = state.tugas.find(t => t.id === id);
      if (deletedTask) void deleteDriveAttachments(getItemFiles(deletedTask), 'task');
      state.tugas = state.tugas.filter(t => t.id !== id);
      addActivity('Menghapus tugas', deletedTask ? deletedTask.nama : 'Tugas');
      saveState(); renderTugas(); renderBeranda(); showNotification('Tugas dihapus.', 'info');
  }
  // ===== LAPORAN =====
  function autoCleanDoneReports() {
      const days = (state.autoCleanReportDays !== undefined && state.autoCleanReportDays !== null) ? state.autoCleanReportDays : 7;
      const now = Date.now();
      let changed = false;
      state.reports.forEach(r => {
          if (r.status === 'resolved' && !r.resolvedAt) { r.resolvedAt = now; changed = true; }
          if (r.status !== 'resolved' && r.resolvedAt) { delete r.resolvedAt; changed = true; }
      });
      if (days > 0) {
          const thresholdMs = days * 24 * 60 * 60 * 1000;
          const expiredReports = state.reports.filter(r => r.status === 'resolved' && r.resolvedAt && (now - r.resolvedAt) > thresholdMs);
          if (expiredReports.length) {
              expiredReports.forEach(r => {
                  if (r.driveFileId) void deleteDriveAttachment({driveFileId:r.driveFileId}, 'report');
              });
              state.reports = state.reports.filter(r => !(r.status === 'resolved' && r.resolvedAt && (now - r.resolvedAt) > thresholdMs));
              changed = true;
          }
      }
      if (changed) saveState();
  }
  function reportStatusLabel(status) { return ({pending:'Menunggu', reviewed:'Ditinjau', resolved:'Selesai', rejected:'Ditolak'})[status] || status || 'Menunggu'; }
  function reportCode(r) { return r.reportCode || ('LAP-'+String(r.id).slice(-6)); }
  function reportUnreadCount() {
      if (!currentUser || currentUser.role !== 'siswa') return 0;
      const seen = Number(localStorage.getItem('kelasku-report-seen-'+currentUser.uid) || 0);
      return state.reports.filter(r => r.authorUid === currentUser.uid && r.statusHistory && r.statusHistory.length && (r.statusHistory[r.statusHistory.length-1].at > seen)).length;
  }
  function renderReports() {
      if (isAdmin()) autoCleanDoneReports();
      const filterEl = document.getElementById('report-filter');
      const searchEl = document.getElementById('report-search');
      const filter = filterEl ? filterEl.value : 'all';
      const q = (searchEl ? searchEl.value : '').trim().toLowerCase();
      let list = [...state.reports];
      const isStaff = currentUser && (currentUser.role === 'superadmin' || currentUser.role === 'admin');
      if (!isStaff) list = list.filter(r => currentUser && r.authorUid === currentUser.uid);
      if (filter !== 'all') list = list.filter(r => r.status === filter);
      if (q) list = list.filter(r => [reportCode(r), r.judul, r.deskripsi, r.kategori, r.pelapor, r.status].join(' ').toLowerCase().includes(q));
      const counts = {pending:0, reviewed:0, resolved:0, rejected:0};
      state.reports.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
      const stats = document.getElementById('report-stats');
      if (stats) stats.innerHTML = ['pending','reviewed','resolved','rejected'].map(s => `<span style="font-size:9px; padding:4px 7px; border-radius:8px; background:var(--glass-card); color:var(--text-soft);">${reportStatusLabel(s)} <b>${counts[s]}</b></span>`).join('');
      const unread = reportUnreadCount();
      const badge = document.getElementById('report-unread-badge');
      if (badge) { badge.style.display = unread ? 'inline-block' : 'none'; badge.textContent = unread + ' pembaruan'; }
      const wrap = document.getElementById('report-list');
      wrap.innerHTML = list.length ? list.reverse().map(r => {
          const history = r.statusHistory || [];
          const latest = history.length ? history[history.length-1] : null;
          const updated = latest ? `<span>🔄 ${reportStatusLabel(latest.status)}</span>` : '';
          const response = r.tanggapan ? `<span>💬 Ada tanggapan</span>` : '';
          return `<div class="report-item" onclick="openReportModal(${r.id})">
              <div class="report-icon">${r.urgensi==='darurat'?'🚨':'📌'}</div>
              <div style="flex:1; min-width:0;">
                  <div class="report-title">${escapeHtml(r.judul)}</div>
                  <div class="report-meta"><span>${escapeHtml(reportCode(r))}</span> • <span>${escapeHtml(r.kategori)}</span>${r.file ? ` <span class="report-file" onclick="event.stopPropagation();openReportFile(${r.id})">📎 ${escapeHtml(r.file)}</span>` : ''} <span class="report-status ${r.status}">${reportStatusLabel(r.status)}</span></div>
                  ${updated || response ? `<div class="report-meta" style="margin-top:5px;">${updated} ${response}</div>` : ''}
              </div>
          </div>`;
      }).join('') : `<div class="empty">${isStaff ? 'Belum ada laporan.' : 'Kamu belum pernah membuat laporan.'}</div>`;
      if (!isStaff && currentUser) localStorage.setItem('kelasku-report-seen-'+currentUser.uid, String(Date.now()));
  }
  function setReportStaffView(isStaff, isExisting) {
      const modal = document.getElementById('modal-report');
      if (!modal) return;
      const editableIds = ['report-kategori','report-judul','report-deskripsi','report-tanggal','report-urgensi','report-file'];
      const studentReadOnly = !isStaff && !!isExisting;
      modal.querySelectorAll('.staff-report-value').forEach(el => el.remove());
      modal.classList.toggle('staff-readonly', !!isStaff);
      editableIds.forEach(id => {
          const el = document.getElementById(id);
          if (!el) return;
          const field = el.closest('.field');
          if (!field) return;
          if (isStaff || studentReadOnly) {
              let value = '';
              if (id === 'report-kategori') { value = el.options[el.selectedIndex]?.textContent?.trim() || '-'; }
              else if (id === 'report-urgensi') { value = el.options[el.selectedIndex]?.textContent?.trim() || '-'; }
              else if (id === 'report-tanggal') {
                  const raw = el.value || '';
                  if (raw) { const parts = raw.split('-'); value = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : raw; }
                  else value = '-';
              } else if (id === 'report-file') { value = el.files?.length ? el.files[0].name : (window._currentReportFileName || 'Tidak ada lampiran'); }
              else { value = el.value || '-'; }
              el.style.display = 'none';
              el.disabled = true;
              const display = document.createElement('div');
              display.className = 'staff-report-value';
              display.dataset.for = id;
              display.textContent = value;
              display.setAttribute('aria-readonly', 'true');
              field.appendChild(display);
          } else {
              el.style.display = '';
              el.disabled = false;
              el.readOnly = false;
          }
      });
      const statusField = document.getElementById('report-status-field');
      const responseEl = document.getElementById('report-tanggapan');
      const historyEl = document.getElementById('report-history');
      const delBtn = document.getElementById('report-delete-btn');
      const submitBtn = document.getElementById('report-submit-btn') || document.querySelector('#modal-report .btn-primary');
      const titleEl = document.getElementById('report-modal-title');
      if (isStaff) {
          if (statusField) statusField.style.display = 'block';
          if (delBtn) delBtn.style.setProperty('display', 'none', 'important');
          if (submitBtn) { submitBtn.textContent = 'Simpan Status'; submitBtn.style.display = ''; submitBtn.disabled = false; }
          if (titleEl) titleEl.textContent = 'Kelola Laporan';
          if (responseEl) { responseEl.disabled = true; responseEl.readOnly = true; }
      } else if (studentReadOnly) {
          if (statusField) statusField.style.display = 'none';
          if (delBtn) delBtn.style.setProperty('display', 'none', 'important');
          if (submitBtn) { submitBtn.textContent = 'Tutup'; submitBtn.style.display = ''; submitBtn.disabled = false; submitBtn.onclick = () => closeModal('report'); }
          if (titleEl) titleEl.textContent = 'Lihat Laporan';
          if (responseEl) { responseEl.disabled = true; responseEl.readOnly = true; }
      } else {
          if (statusField) statusField.style.display = 'none';
          if (delBtn) delBtn.style.setProperty('display', 'none', 'important');
          if (submitBtn) { submitBtn.textContent = 'Kirim'; submitBtn.style.display = ''; submitBtn.disabled = false; submitBtn.onclick = submitReport; }
          if (titleEl) titleEl.textContent = 'Buat Laporan';
          if (responseEl) { responseEl.disabled = false; responseEl.readOnly = false; }
      }
  }
  function openReportModal(id) {
      const isStaff = currentUser && (currentUser.role === 'superadmin' || currentUser.role === 'admin');
      window._currentReportFileName = '';
      const r = id ? state.reports.find(x => x.id === Number(id)) : null;
      if (id && !r) return;
      if (r) {
          window._currentReportFileName = r.file || '';
          document.getElementById('report-code-label').textContent = reportCode(r);
          document.getElementById('report-edit-id').value = r.id;
          document.getElementById('report-kategori').value = r.kategori || 'Lainnya';
          document.getElementById('report-judul').value = r.judul || '';
          document.getElementById('report-deskripsi').value = r.deskripsi || '';
          document.getElementById('report-tanggal').value = r.tanggal || '';
          document.getElementById('report-urgensi').value = r.urgensi || 'sedang';
          document.getElementById('report-file').value = '';
          document.getElementById('report-status').value = r.status || 'pending';
          const responseEl = document.getElementById('report-tanggapan');
          if (responseEl) responseEl.value = r.tanggapan || '';
          const historyEl = document.getElementById('report-history');
          if (historyEl) historyEl.innerHTML = (r.statusHistory || []).length ? '<b>Riwayat status</b><br>' + (r.statusHistory || []).map(h => `${escapeHtml(reportStatusLabel(h.status))} — ${escapeHtml(h.by || 'Admin')} — ${escapeHtml(new Date(h.at).toLocaleString('id-ID'))}`).reverse().join('<br>') : '<b>Riwayat status</b><br>Belum ada perubahan.';
      } else {
          document.getElementById('report-code-label').textContent = 'Laporan baru';
          document.getElementById('report-edit-id').value = '';
          document.getElementById('report-kategori').value = 'Kekerasan/Berantem';
          document.getElementById('report-judul').value = '';
          document.getElementById('report-deskripsi').value = '';
          document.getElementById('report-tanggal').value = todayKey();
          document.getElementById('report-urgensi').value = 'sedang';
          document.getElementById('report-file').value = '';
          document.getElementById('report-status').value = 'pending';
          const responseEl = document.getElementById('report-tanggapan');
          if (responseEl) responseEl.value = '';
          const historyEl = document.getElementById('report-history');
          if (historyEl) historyEl.innerHTML = '';
      }
      setReportStaffView(!!(r && isStaff), !!r);
      const studentResponse = document.getElementById('report-student-response');
      const studentResponseText = document.getElementById('report-student-response-text');
      if (studentResponse) studentResponse.style.display = (r && !isStaff && r.tanggapan) ? 'block' : 'none';
      if (studentResponseText) studentResponseText.textContent = (r && r.tanggapan) ? r.tanggapan : '';
      if (r && !isStaff && currentUser) localStorage.setItem('kelasku-report-seen-'+currentUser.uid, String(Date.now()));
      openModal('report');
  }
  async function submitReport() {
      if (!currentUser) { showNotification('Sesi login tidak tersedia.', 'error'); return; }
      const editId = document.getElementById('report-edit-id').value;
      const isStaff = currentUser && (currentUser.role === 'superadmin' || currentUser.role === 'admin');
      if (editId && !isStaff) {
          showNotification('Laporan yang sudah dikirim tidak dapat diubah.', 'info');
          return;
      }
      if (editId && isStaff) {
          const r = state.reports.find(x => x.id === Number(editId));
          if (!r) return;
          const newStatus = document.getElementById('report-status').value;
          const oldStatus = r.status || 'pending';
          const responseText = (document.getElementById('report-tanggapan')?.value || '').trim();
          const previousResponse = r.tanggapan || '';
          const statusChanged = oldStatus !== newStatus;
          const responseChanged = previousResponse !== responseText;
          r.status = newStatus;
          if (responseText) r.tanggapan = responseText;
          else if (!r.tanggapan) r.tanggapan = '';
          if (!Array.isArray(r.statusHistory)) r.statusHistory = [];
          if (statusChanged || !r.statusHistory.length) {
              r.statusHistory.push({ status:newStatus, at:Date.now(), by:currentUser.username || currentUser.email || 'Admin' });
          }
          if (statusChanged || responseChanged) {
              addActivity('Memperbarui laporan ' + (r.reportCode || reportCode(r)), 'Status: ' + reportStatusLabel(newStatus) + (responseChanged ? ' · Tanggapan diperbarui' : ''));
              if (r.authorUid) addNotification('Laporan diperbarui', (r.reportCode || reportCode(r)) + ' sekarang ' + reportStatusLabel(newStatus) + (responseChanged ? '. Ada tanggapan Admin.' : '.'), {uid:r.authorUid});
          }
          if (newStatus === 'resolved') { if (oldStatus !== 'resolved' || !r.resolvedAt) { r.resolvedAt = Date.now(); } }
          else { delete r.resolvedAt; }
          const saveResult = await saveState();
          if (saveResult && saveResult.synced === false) {
              showNotification('Status gagal disimpan ke server.', 'error', 5000);
              return;
          }
          renderReports();
          closeModal('report');
          showNotification('Status laporan berhasil diperbarui.', 'success');
          return;
      }
      if (editId) return;
      const fileInput = document.getElementById('report-file');
      let fileName = '', fileData = '', driveFileId = '', driveUrl = '', fileSize = 0, fileMimeType = '';
      if (fileInput.files.length > 0) {
          const file = fileInput.files[0];
          try {
              const attachment = await prepareAttachment(file);
              if (attachment.compressed) showNotification('Gambar dikompres otomatis sebelum disimpan.', 'success');
              const stored = await uploadPreparedAttachment(attachment, 'report');
              fileName = stored.name || attachment.name;
              fileData = stored.data || '';
              driveFileId = stored.driveFileId || '';
              driveUrl = stored.driveUrl || stored.url || '';
              fileSize = Number(stored.sizeBytes || attachment.sizeBytes || 0);
              fileMimeType = stored.mimeType || attachment.mimeType || '';
          } catch (e) { showNotification(clientSafeError('Gagal memproses file. Coba lagi.'), 'error'); return; }
      }
      const judul = document.getElementById('report-judul').value.trim();
      const deskripsi = document.getElementById('report-deskripsi').value.trim();
      const kategori = document.getElementById('report-kategori').value;
      const tanggal = document.getElementById('report-tanggal').value;
      const urgensi = document.getElementById('report-urgensi').value;
      if (!judul || !deskripsi) { showNotification('Judul dan deskripsi wajib diisi.', 'warning'); return; }
      const reportId = Date.now();
      const newReport = {
          id: reportId,
          reportCode: 'LAP-'+String(reportId).slice(-6),
          judul, deskripsi, kategori, urgensi,
          pelapor: currentUser ? currentUser.username : 'Siswa',
          authorUid: currentUser ? currentUser.uid : null,
          status: 'pending',
          statusHistory: [{ status:'pending', at:Date.now(), by: currentUser ? (currentUser.username || currentUser.email || 'Siswa') : 'Siswa' }],
          tanggapan: '',
          createdAt: Date.now(),
          date: new Date().toLocaleDateString('id-ID'),
          tanggal: tanggal || todayKey(),
          file: fileName,
          fileData,
          driveFileId,
          driveUrl,
          fileSize,
          fileMimeType,
          storage: driveFileId ? 'google-drive' : ''
      };
      state.reports.push(newReport);
      fileInput.value = '';
      addActivity('Membuat laporan', reportCode(newReport) + ' · ' + judul);

      // Reports are no longer stored in kelasku-state. Student creates only
      // their own report document, which Rules also enforce by authorUid.
      try {
          await db.collection(FS_REPORTS).doc(String(reportId)).set(newReport);

          try {
              const staffNotification = addNotification(
                  'Laporan baru',
                  (currentUser ? currentUser.username : 'Siswa') + ' mengirim laporan ' + reportCode(newReport) + '.',
                  {role:'staff'}
              );
              await db.collection(FS_NOTIFICATIONS).doc(String(staffNotification.id)).set({
                  ...staffNotification,
                  createdByUid: currentUser.uid
              });
          } catch (notificationError) {
              // A notification failure must never make a successfully-created
              // report look like it failed. The report itself is the source of truth.
              console.warn('Staff notification save failed:', notificationError);
          }

          _loadedReportIds.add(String(reportId));
          renderReports();
          closeModal('report');
          showNotification('Laporan berhasil dikirim!', 'success');
      } catch (e) {
          state.reports = state.reports.filter(r => String(r.id) !== String(reportId));
          if (newReport.driveFileId) void deleteDriveAttachment({driveFileId:newReport.driveFileId}, 'report');
          showNotification('Gagal menyimpan laporan. Coba lagi.', 'error');
          console.error('Create report error:', e);
      }
  }
  function openReportFile(id) {
      const r = state.reports.find(x => x.id === Number(id));
      if (!r) return;
      openStoredAttachment(normalizeAttachment({ name:r.file, data:r.fileData, driveFileId:r.driveFileId, driveUrl:r.driveUrl, fileSize:r.fileSize, fileMimeType:r.fileMimeType, storage:r.storage }));
  }
  async function deleteReport() {
      if (guardReadOnly()) return;
      if (!isAdmin()) {
          showNotification('Hanya Admin atau Super Admin yang dapat menghapus laporan.', 'error');
          return;
      }
      const editId = Number(document.getElementById('report-edit-id').value);
      if (!confirm('Hapus laporan ini?')) return;
      try {
          const deletedReport = state.reports.find(r => r.id === editId);
          await db.collection(FS_REPORTS).doc(String(editId)).delete();
          if (deletedReport && deletedReport.driveFileId) void deleteDriveAttachment({driveFileId:deletedReport.driveFileId}, 'report');
          state.reports = state.reports.filter(r => r.id !== editId);
          _loadedReportIds.delete(String(editId));
          renderReports();
          closeModal('report');
          showNotification('Laporan dihapus.', 'info');
      } catch (e) {
          showNotification('Gagal menghapus laporan.', 'error');
      }
  }
  // ===== KAS ACTION =====
  async function submitKas() {
      if (guardReadOnly()) return;
      const jenis = document.getElementById('kas-jenis').value;
      const ket = document.getElementById('kas-ket').value.trim();
      const jumlah = parseFloat(document.getElementById('kas-jumlah').value);
      const fileInput = document.getElementById('kas-file');
      const editId = Number(document.getElementById('kas-edit-id').value || 0);
      if (!ket || !jumlah || jumlah <= 0) { showNotification('Isi semua field transaksi dengan benar.', 'warning'); return; }
      if (editId) {
          const t = state.kas.find(x => x.id === editId);
          if (!t) { showNotification('Transaksi tidak ditemukan.', 'error'); return; }
          let fileName = t.file || '', fileData = t.fileData || '', driveFileId = t.driveFileId || '', driveUrl = t.driveUrl || '', fileSize = Number(t.fileSize || 0), fileMimeType = t.fileMimeType || '';
          if (fileInput.files.length > 0) {
              const oldDriveId = driveFileId;
              const file = fileInput.files[0];
              try {
                  const attachment = await prepareAttachment(file);
                  const stored = await uploadPreparedAttachment(attachment, 'kas');
                  fileData = stored.data || '';
                  fileName = stored.name || attachment.name;
                  driveFileId = stored.driveFileId || '';
                  driveUrl = stored.driveUrl || stored.url || '';
                  fileSize = Number(stored.sizeBytes || attachment.sizeBytes || 0);
                  fileMimeType = stored.mimeType || attachment.mimeType || '';
                  if (attachment.compressed) showNotification('Gambar dikompres otomatis sebelum disimpan.', 'success');
                  if (oldDriveId && oldDriveId !== driveFileId) void deleteDriveAttachment({driveFileId:oldDriveId}, 'kas');
              } catch (e) { showNotification(e.message || 'Gagal memproses file.', 'error'); return; }
          }
          t.jenis = jenis; t.ket = ket; t.jumlah = jumlah; t.file = fileName; t.fileData = fileData; t.driveFileId = driveFileId; t.driveUrl = driveUrl; t.fileSize = fileSize; t.fileMimeType = fileMimeType; t.storage = driveFileId ? 'google-drive' : '';
          fileInput.value = '';
          document.getElementById('kas-edit-id').value = '';
          document.getElementById('kas-modal-title').textContent = 'Tambah Transaksi Kas';
          document.getElementById('kas-delete-btn').style.display = 'none';
          addActivity('Mengubah transaksi kas', ket + ' · ' + rupiah(jumlah));
          saveState(); renderKas(); renderBeranda(); closeModal('kas'); showNotification('Transaksi kas berhasil diperbarui.', 'success'); return;
      }
      let fileName = '', fileData = '', driveFileId = '', driveUrl = '', fileSize = 0, fileMimeType = '';
      if (fileInput.files.length > 0) {
          const file = fileInput.files[0];
          try {
              const attachment = await prepareAttachment(file);
              const stored = await uploadPreparedAttachment(attachment, 'kas');
              fileData = stored.data || '';
              fileName = stored.name || attachment.name;
              driveFileId = stored.driveFileId || '';
              driveUrl = stored.driveUrl || stored.url || '';
              fileSize = Number(stored.sizeBytes || attachment.sizeBytes || 0);
              fileMimeType = stored.mimeType || attachment.mimeType || '';
              if (attachment.compressed) showNotification('Gambar dikompres otomatis sebelum disimpan.', 'success');
          } catch (e) { showNotification(e.message || 'Gagal memproses file.', 'error'); return; }
      }
      state.kas.push({ id: Date.now(), jenis, ket, jumlah, tanggal: new Date().toLocaleDateString('id-ID'), file: fileName, fileData, driveFileId, driveUrl, fileSize, fileMimeType, storage: driveFileId ? 'google-drive' : '' });
      fileInput.value = '';
      document.getElementById('kas-edit-id').value = '';
      addActivity('Menambahkan transaksi kas', ket + ' · ' + rupiah(jumlah));
      saveState(); renderKas(); renderBeranda(); closeModal('kas'); showNotification('Transaksi kas berhasil ditambahkan.', 'success');
  }
  function openKasAddModal() {
      if (guardReadOnly()) return;
      document.getElementById('kas-modal-title').textContent = 'Tambah Transaksi Kas';
      document.getElementById('kas-edit-id').value = '';
      document.getElementById('kas-jenis').value = 'masuk';
      document.getElementById('kas-ket').value = '';
      document.getElementById('kas-jumlah').value = '';
      document.getElementById('kas-file').value = '';
      document.getElementById('kas-delete-btn').style.display = 'none';
      openModal('kas');
  }
  function openKasEditModal(id) {
      if (guardReadOnly()) return;
      const t = state.kas.find(x => x.id === Number(id));
      if (!t) { showNotification('Transaksi tidak ditemukan.', 'error'); return; }
      document.getElementById('kas-modal-title').textContent = 'Edit Transaksi Kas';
      document.getElementById('kas-edit-id').value = t.id;
      document.getElementById('kas-jenis').value = t.jenis || 'keluar';
      document.getElementById('kas-ket').value = t.ket || '';
      document.getElementById('kas-jumlah').value = t.jumlah || '';
      document.getElementById('kas-file').value = '';
      document.getElementById('kas-delete-btn').style.display = '';
      openModal('kas');
  }
  function hapusKasCurrent() {
      if (guardReadOnly()) return;
      const editId = Number(document.getElementById('kas-edit-id').value || 0);
      if (!editId) return;
      if (!confirm('Hapus transaksi kas ini?')) return;
      const deletedKas = state.kas.find(t => t.id === editId);
      if (deletedKas && deletedKas.driveFileId) void deleteDriveAttachment({driveFileId:deletedKas.driveFileId}, 'kas');
      state.kas = state.kas.filter(t => t.id !== editId);
      addActivity('Menghapus transaksi kas', deletedKas ? deletedKas.ket + ' · ' + rupiah(deletedKas.jumlah) : 'Transaksi kas');
      saveState(); renderKas(); renderBeranda();
      document.getElementById('kas-edit-id').value = '';
      document.getElementById('kas-delete-btn').style.display = 'none';
      closeModal('kas'); showNotification('Transaksi kas dihapus.', 'info');
  }
  function openKasFile(id) {
      const t = state.kas.find(x => x.id === Number(id));
      if (!t) return;
      openStoredAttachment({ name:t.file, data:t.fileData, driveFileId:t.driveFileId, driveUrl:t.driveUrl });
  }
  function hapusKas(id) {
      if (guardReadOnly()) return;
      if (!confirm('Hapus transaksi kas ini?')) return;
      const deletedKas = state.kas.find(t => t.id === id);
      if (deletedKas && deletedKas.driveFileId) void deleteDriveAttachment({driveFileId:deletedKas.driveFileId}, 'kas');
      state.kas = state.kas.filter(t => t.id !== id);
      addActivity('Menghapus transaksi kas', deletedKas ? deletedKas.ket + ' · ' + rupiah(deletedKas.jumlah) : 'Transaksi kas');
      saveState(); renderKas(); renderBeranda(); showNotification('Transaksi kas dihapus.', 'info');
  }
  function openExportModal() {
      let txt = "REKAP KAS KELAS X TJKT 1\n==================\n";
      state.kas.forEach(t => { txt += `[${t.tanggal}] ${t.jenis.toUpperCase()}: ${t.ket} (${rupiah(t.jumlah)})${t.file ? ' [File: '+t.file+']' : ''}\n`; });
      document.getElementById('export-text').value = txt;
      openModal('export');
  }
  function copyExportText() { const el = document.getElementById('export-text'); el.select(); document.execCommand('copy'); showNotification('Rekap kas telah disalin ke clipboard.', 'success'); }
  // ===== PENGUMUMAN ACTION =====
  let _pengumumanEditFiles = [];
  function renderPengumumanFileChips() {
      const wrap = document.getElementById('pengumuman-file-chips');
      if (!wrap) return;
      wrap.innerHTML = _pengumumanEditFiles.map((f, idx) => `
          <div class="file-chip">📎 ${escapeHtml(f.name)}<span class="file-chip-remove" onclick="removePengumumanEditFile(${idx})">×</span></div>
      `).join('');
  }
  function removePengumumanEditFile(idx) {
      if (idx < 0 || idx >= _pengumumanEditFiles.length) return;
      _pengumumanEditFiles.splice(idx, 1);
      renderPengumumanFileChips();
  }
  async function onPengumumanFileSelected(input) {
      const remainingSlots = MAX_FILES_PER_ITEM - _pengumumanEditFiles.length;
      const picked = Array.from(input.files || []);
      if (!picked.length) return;
      if (picked.length > remainingSlots) {
          showNotification('Maksimal ' + MAX_FILES_PER_ITEM + ' file per pengumuman. Sisa slot: ' + remainingSlots + '.', 'error');
          input.value = '';
          return;
      }
      for (const file of picked) {
          try {
              const attachment = await prepareAttachment(file);
              _pengumumanEditFiles.push({
                  name: attachment.name,
                  data: attachment.data,
                  sizeBytes: attachment.sizeBytes,
                  mimeType: attachment.mimeType,
                  storage: 'pending'
              });
              if (attachment.compressed) {
                  showNotification('Gambar "' + file.name + '" dikompres otomatis.', 'success');
              }
          } catch (e) {
              showNotification('File "' + file.name + '": ' + (e.message || 'gagal diproses') + '.', 'error');
          }
      }
      input.value = '';
      renderPengumumanFileChips();
  }
  function openPengumumanModal(id) {
      if (guardReadOnly()) return;
      const judulEl = document.getElementById('pengumuman-judul');
      const deskripsiEl = document.getElementById('pengumuman-deskripsi');
      const deadlineEl = document.getElementById('pengumuman-deadline');
      const editEl = document.getElementById('pengumuman-edit-id');
      const titleEl = document.getElementById('pengumuman-modal-title');
      const submitEl = document.getElementById('pengumuman-submit-btn');
      const deleteEl = document.getElementById('pengumuman-delete-btn');
      const fileEl = document.getElementById('pengumuman-file');
      if (fileEl) fileEl.value = '';

      if (id) {
          const p = state.pengumuman.find(x => Number(x.id) === Number(id));
          if (!p) { showNotification('Pengumuman tidak ditemukan.', 'error'); return; }
          judulEl.value = p.judul || p.title || '';
          deskripsiEl.value = p.deskripsi !== undefined ? (p.deskripsi || '') : (p.text || '');
          deadlineEl.value = p.deadline || p.tenggat || '';
          editEl.value = p.id;
          titleEl.textContent = 'Edit Pengumuman';
          submitEl.textContent = 'Simpan';
          deleteEl.style.display = '';
          _pengumumanEditFiles = getItemFiles(p).map(f => ({...f}));
      } else {
          judulEl.value = '';
          deskripsiEl.value = '';
          deadlineEl.value = '';
          editEl.value = '';
          titleEl.textContent = 'Tambah Pengumuman';
          submitEl.textContent = 'Publikasikan';
          deleteEl.style.display = 'none';
          _pengumumanEditFiles = [];
      }
      renderPengumumanFileChips();
      openModal('pengumuman');
  }
  function openAnnouncementFileAt(id, idx) {
      const p = state.pengumuman.find(x => Number(x.id) === Number(id));
      if (!p) return;
      const files = getItemFiles(p);
      const f = files[idx];
      if (f) openStoredAttachment(normalizeAttachment(f));
  }
  async function submitPengumuman() {
      if (guardReadOnly()) return;
      const judul = document.getElementById('pengumuman-judul').value.trim();
      const deskripsi = document.getElementById('pengumuman-deskripsi').value.trim();
      const deadline = document.getElementById('pengumuman-deadline').value || '';
      const editId = document.getElementById('pengumuman-edit-id').value;
      if (!judul || !deskripsi) {
          showNotification('Judul dan deskripsi wajib diisi.', 'warning');
          return;
      }

      const uploadedThisRound = [];
      let files;
      try {
          files = [];
          for (const file of _pengumumanEditFiles.slice()) {
              if (driveStorageEnabled() && file.driveFileId) {
                  files.push({
                      name: file.name,
                      driveFileId: file.driveFileId,
                      driveUrl: file.driveUrl || attachmentUrl(file),
                      sizeBytes: Number(file.sizeBytes || file.size || 0),
                      mimeType: file.mimeType || '',
                      storage: 'google-drive'
                  });
              } else if (file.data) {
                  const stored = await uploadPreparedAttachment(file, 'announcement');
                  files.push(stored);
                  if (stored && stored.driveFileId) uploadedThisRound.push(stored);
              } else {
                  files.push(file);
              }
          }
      } catch (e) {
          await deleteDriveAttachments(uploadedThisRound, 'announcement');
          showNotification('Gagal menyimpan lampiran pengumuman: ' + (e.message || 'error'), 'error', 5000);
          return;
      }

      const nowText = new Date().toLocaleDateString('id-ID');
      if (editId) {
          const p = state.pengumuman.find(x => Number(x.id) === Number(editId));
          if (!p) {
              await deleteDriveAttachments(uploadedThisRound, 'announcement');
              showNotification('Pengumuman tidak ditemukan.', 'error');
              return;
          }
          const previousFiles = getItemFiles(p);
          const keptDriveIds = new Set(files.map(f => f.driveFileId).filter(Boolean));
          previousFiles.forEach(oldFile => {
              if (oldFile.driveFileId && !keptDriveIds.has(oldFile.driveFileId)) {
                  void deleteDriveAttachment(oldFile, 'announcement');
              }
          });
          p.judul = judul;
          p.title = judul;
          p.deskripsi = deskripsi;
          p.text = deskripsi;
          p.deadline = deadline;
          p.files = files;
          delete p.tenggat;
          delete p.file;
          delete p.fileData;
          addActivity('Mengubah pengumuman', judul);
          addNotification('Pengumuman diperbarui', judul + (deadline ? ' · Deadline ' + deadline : ''), {role:'siswa'});
          await saveState();
          renderPengumuman();
          closeModal('pengumuman');
          showNotification('Pengumuman berhasil diperbarui.', 'success');
          return;
      }

      state.pengumuman.push({
          id: Date.now(),
          judul,
          title: judul,
          deskripsi,
          text: deskripsi,
          deadline,
          date: nowText,
          files
      });
      addActivity('Menerbitkan pengumuman', judul);
      addNotification('Pengumuman baru', judul + (deadline ? ' · Deadline ' + deadline : ''), {role:'siswa'});
      await saveState();
      renderPengumuman();
      closeModal('pengumuman');
      showNotification('Pengumuman berhasil dipublikasikan.', 'success');
  }
  function deletePengumumanCurrent() {
      if (guardReadOnly()) return;
      const editId = Number(document.getElementById('pengumuman-edit-id').value || 0);
      if (!editId) return;
      if (deletePengumuman(editId)) closeModal('pengumuman');
  }
  function deletePengumuman(id) {
      if (guardReadOnly()) return false;
      const deletedAnnouncement = state.pengumuman.find(p => Number(p.id) === Number(id));
      if (!deletedAnnouncement) return false;
      if (!confirm('Hapus pengumuman ini?')) return false;
      void deleteDriveAttachments(getItemFiles(deletedAnnouncement), 'announcement');
      state.pengumuman = state.pengumuman.filter(p => Number(p.id) !== Number(id));
      addActivity('Menghapus pengumuman', deletedAnnouncement.judul || deletedAnnouncement.title || deletedAnnouncement.text || 'Pengumuman');
      saveState();
      renderPengumuman();
      showNotification('Pengumuman dihapus.', 'info');
      return true;
  }
  // ===== ACCOUNT MANAGEMENT =====
  let _allAccounts = [];
  async function renderAccountList() {
      const wrap = document.getElementById('account-list');
      if (!wrap || !isSuperAdmin()) return;
      wrap.innerHTML = '<div class="empty">Memuat akun...</div>';
      try {
          const snap = await db.collection(FS_PROFILES).get();
          const users = [];
          snap.forEach(doc => users.push({ id: doc.id, ...doc.data() }));
          users.sort((a,b) => (a.username || a.email || '').localeCompare(b.username || b.email || ''));
          _allAccounts = users;
          const badge = document.getElementById('account-total-badge');
          if (badge) badge.textContent = users.length;
          renderAccountGroups(users);
      } catch (e) { wrap.innerHTML = '<div class="empty">Gagal memuat akun.</div>'; }
  }
  function renderAccountGroups(users) {
      const wrap = document.getElementById('account-list');
      const roleOrder = [{ key: 'superadmin', label: '🛡️ Super Admin' }, { key: 'admin', label: '🔧 Admin' }, { key: 'siswa', label: '🎓 Siswa' }];
      const groupsHtml = roleOrder.map(r => {
          const members = users.filter(u => (u.role || 'siswa') === r.key);
          if (!members.length) return '';
          const rowsHtml = members.map(u => `
              <div class="acc-row">
                  <div class="acc-info" style="cursor:pointer; width:100%;" onclick='openAccountEditModal(${jsString(u.id)})'>
                      <b>${escapeHtml(u.username || u.email)}</b>
                      <div class="acc-email">${escapeHtml(u.email || '')}${u.active===false ? ' · <span style="color:var(--rose);font-weight:700;">nonaktif</span>' : ''}</div>
                  </div>
              </div>
          `).join('');
          return `
              <details class="role-group role-${r.key}" open>
                  <summary>${escapeHtml(r.label)}<span class="role-count">${members.length}</span></summary>
                  <div class="role-body">${rowsHtml}</div>
              </details>
          `;
      }).join('');
      wrap.innerHTML = groupsHtml || '<div class="empty">Belum ada akun terdaftar.</div>';
  }
  function filterAccountList() {
      const q = document.getElementById('account-search').value.trim().toLowerCase();
      if (!q) { renderAccountGroups(_allAccounts); return; }
      const filtered = _allAccounts.filter(u => (u.username || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
      if (!filtered.length) { document.getElementById('account-list').innerHTML = `<div class="acc-empty-search">Tidak ada akun yang cocok dengan "${escapeHtml(q)}"</div>`; return; }
      renderAccountGroups(filtered);
  }
  async function addAccount() {
      if (guardAccountManagement()) return;

      const nama = document.getElementById('acc-nama').value.trim();
      const email = document.getElementById('acc-email').value.trim();
      const password = document.getElementById('acc-password').value;
      const role = document.getElementById('acc-role').value;

      if (!nama || !email || !password) {
          showNotification('Semua kolom wajib diisi.', 'warning');
          return;
      }

      const passwordPolicy = await validateKelaskuPassword(password);
      if (!passwordPolicy.valid) {
          showNotification(passwordPolicy.message, 'warning', 4500);
          return;
      }

      if (!VALID_ROLES.includes(role)) {
          showNotification('Role tidak valid.', 'error');
          return;
      }

      if (!(await requireRecentReauthentication('menambahkan akun baru'))) return;

      let createdUser = null;

      try {
          // Akun Auth dibuat melalui secondaryAuth agar sesi Super Admin utama tidak berubah.
          const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
          createdUser = cred.user;

          try {
              await createdUser.updateProfile({ displayName: nama });
          } catch (e) {}

          await db.collection(FS_PROFILES).doc(createdUser.uid).set({
              email,
              username: nama,
              role,
              active: true,
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });

          document.getElementById('acc-nama').value = '';
          document.getElementById('acc-email').value = '';
          document.getElementById('acc-password').value = '';

          await secondaryAuth.signOut();
          renderAccountList();
          showNotification('Akun berhasil dibuat!', 'success');
      } catch (e) {
          try { await secondaryAuth.signOut(); } catch (_) {}
          showNotification(authErrorMessage(e.code), 'error');
      }
  }

  async function toggleAccountActiveFromModal() {
      if (guardAccountManagement()) return;

      const uid = document.getElementById('acc-edit-id').value;

      if (!uid || uid === currentUser.uid) {
          showNotification('Tidak dapat menonaktifkan akun sendiri.', 'warning');
          return;
      }

      const isActive = document.getElementById('acc-edit-active').value !== 'false';
      const makeActive = !isActive;

      if (!makeActive && !confirm('Nonaktifkan akun ini? Akun tidak akan bisa menggunakan Kelasku sampai diaktifkan kembali.')) {
          return;
      }

      if (!(await requireRecentReauthentication(makeActive ? 'mengaktifkan akun' : 'menonaktifkan akun'))) return;

      try {
          await db.collection(FS_PROFILES).doc(uid).update({
              active: makeActive
          });

          showNotification(makeActive ? 'Akun diaktifkan.' : 'Akun dinonaktifkan.', 'success');
          closeModal('account-edit');
          renderAccountList();
      } catch (e) {
          showNotification('Gagal memperbarui status akun.', 'error');
      }
  }

  function openAccountEditModal(uid) {
      if (guardAccountManagement()) return;

      const u = _allAccounts.find(x => x.id === uid);
      if (!u) return;

      document.getElementById('acc-edit-nama').value = u.username || '';
      document.getElementById('acc-edit-email').value = u.email || '';
      document.getElementById('acc-edit-role').value = u.role || 'siswa';
      document.getElementById('acc-edit-id').value = uid;

      const isActive = u.active !== false;
      document.getElementById('acc-edit-active').value = isActive ? 'true' : 'false';

      const toggleBtn = document.getElementById('acc-edit-toggle-btn');
      toggleBtn.textContent = isActive ? '✕ Nonaktifkan Akun' : '✓ Aktifkan Akun';
      toggleBtn.style.display = (uid === currentUser.uid) ? 'none' : '';

      openModal('account-edit');
  }

  async function submitAccountEdit() {
      if (guardAccountManagement()) return;

      const uid = document.getElementById('acc-edit-id').value;
      const nama = document.getElementById('acc-edit-nama').value.trim();
      const role = document.getElementById('acc-edit-role').value;

      if (!nama) {
          showNotification('Nama tidak boleh kosong.', 'warning');
          return;
      }

      if (!VALID_ROLES.includes(role)) {
          showNotification('Role tidak valid.', 'error');
          return;
      }

      if (uid === currentUser.uid && role !== 'superadmin') {
          showNotification('Tidak dapat mengubah peran akun sendiri.', 'warning');
          return;
      }

      if (!(await requireRecentReauthentication('mengubah akun pengguna'))) return;

      try {
          await db.collection(FS_PROFILES).doc(uid).update({
              username: nama,
              role
          });

          if (uid === currentUser.uid) {
              currentUser.username = nama;
              currentUser.role = role;
              applyRole(role);
          }

          showNotification('Akun berhasil diperbarui.', 'success');
          closeModal('account-edit');
          renderAccountList();
      } catch (e) {
          showNotification('Gagal memperbarui akun.', 'error');
      }
  }

  // ===== EXPORT / IMPORT =====
  async function exportBackup() {
      if (guardReadOnly()) return;
      if (!(await requireRecentReauthentication('mengunduh backup data kelas'))) return;
      const payload = { exportedAt: new Date().toISOString(), state };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'kelasku-backup-' + todayKey() + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showNotification('Backup berhasil diunduh!', 'success');
  }
  function countLegacyDriveAttachments() {
      let total = 0;
      let ready = 0;
      const tasks = Array.isArray(state.tugas) ? state.tugas : [];
      tasks.forEach(task => {
          const files = getItemFiles(task);
          files.forEach(file => {
              if (!file) return;
              if (file.driveFileId) return;
              if (file.data) { total++; ready++; }
          });
      });
      const kasList = Array.isArray(state.kas) ? state.kas : [];
      kasList.forEach(kas => {
          if (!kas || kas.driveFileId) return;
          if (kas.fileData) { total++; ready++; }
      });
      const reports = Array.isArray(state.reports) ? state.reports : [];
      reports.forEach(report => {
          if (!report || report.driveFileId) return;
          if (report.fileData) { total++; ready++; }
      });
      return { total, ready };
  }

  async function migrateAllAttachmentsToDrive() {
      if (guardReadOnly()) return;
      if (!driveStorageEnabled()) {
          showNotification('Google Drive belum dikonfigurasi. Isi KELASKU_DRIVE_API_URL lalu upload ulang index.html.', 'warning', 5000);
          return;
      }
      const before = countLegacyDriveAttachments();
      if (before.total === 0) {
          showNotification('✅ Semua lampiran sudah berada di Google Drive. Tidak ada yang perlu dimigrasikan lagi.', 'success', 5000);
          renderSettingsInfo();
          return;
      }
      if (!(await requireRecentReauthentication('memigrasikan semua lampiran ke Google Drive'))) return;
      if (!confirm('Migrasikan ' + before.total + ' lampiran lama yang masih tersimpan sebagai Base64 ke Google Drive?\n\nFile yang sudah memiliki ID Google Drive tidak akan diupload ulang.')) return;

      let migrated = 0;
      let skipped = 0;
      try {
          for (const task of state.tugas || []) {
              const oldFiles = getItemFiles(task);
              if (!oldFiles.length) continue;
              const newFiles = [];
              for (const file of oldFiles) {
                  if (file.driveFileId) { newFiles.push(file); skipped++; continue; }
                  if (!file.data) { newFiles.push(file); skipped++; continue; }
                  const stored = await uploadPreparedAttachment({
                      name:file.name || 'lampiran',
                      data:file.data,
                      sizeBytes:Number(file.sizeBytes || Math.floor(base64FromDataUrl(file.data).length * 0.75)),
                      mimeType:file.mimeType || mimeTypeFromFilename(file.name)
                  }, 'task');
                  newFiles.push(stored);
                  migrated++;
              }
              task.files = newFiles;
              delete task.file; delete task.fileData;
          }

          for (const kas of state.kas || []) {
              if (kas.driveFileId || !kas.fileData) { if (kas.file) skipped++; continue; }
              const stored = await uploadPreparedAttachment({
                  name:kas.file || 'lampiran',
                  data:kas.fileData,
                  sizeBytes:Number(kas.fileSize || Math.floor(base64FromDataUrl(kas.fileData).length * 0.75)),
                  mimeType:kas.fileMimeType || mimeTypeFromFilename(kas.file)
              }, 'kas');
              kas.driveFileId = stored.driveFileId || '';
              kas.driveUrl = stored.driveUrl || stored.url || '';
              kas.fileSize = Number(stored.sizeBytes || 0);
              kas.fileMimeType = stored.mimeType || '';
              kas.storage = 'google-drive';
              kas.fileData = '';
              migrated++;
          }

          for (const report of state.reports || []) {
              if (!report.fileData || report.driveFileId) { if (report.file) skipped++; continue; }
              const stored = await uploadPreparedAttachment({
                  name:report.file || 'lampiran',
                  data:report.fileData,
                  sizeBytes:Number(report.fileSize || Math.floor(base64FromDataUrl(report.fileData).length * 0.75)),
                  mimeType:report.fileMimeType || mimeTypeFromFilename(report.file)
              }, 'report');
              report.driveFileId = stored.driveFileId || '';
              report.driveUrl = stored.driveUrl || stored.url || '';
              report.fileSize = Number(stored.sizeBytes || 0);
              report.fileMimeType = stored.mimeType || '';
              report.storage = 'google-drive';
              report.fileData = '';
              await db.collection(FS_REPORTS).doc(String(report.id)).set(report, { merge:true });
              migrated++;
          }

          await saveState();
          renderAll();
          await refreshDriveStorageUsage();
          const after = countLegacyDriveAttachments();
          const statusEl = document.getElementById('drive-migration-status');
          const btn = document.getElementById('drive-migrate-btn');
          if (after.total === 0) {
              if (btn) { btn.textContent = '✅ Semua lampiran sudah di Google Drive'; btn.disabled = true; }
              if (statusEl) statusEl.textContent = '✅ Migrasi selesai. Tidak ada lampiran Base64 lama yang tersisa.';
          } else if (statusEl) {
              statusEl.textContent = '⚠️ Masih ada ' + after.total + ' lampiran lama yang belum berhasil dipindahkan. Kamu bisa melanjutkan migrasi tanpa mengupload ulang file yang sudah berhasil.';
          }
          showNotification('Migrasi selesai. ' + migrated + ' lampiran dipindahkan; ' + skipped + ' dilewati.', 'success', 6000);
      } catch (e) {
          console.error('Drive migration error:', e);
          showNotification('Migrasi berhenti: ' + (e.message || 'terjadi kesalahan').toString(), 'error', 6000);
      }
  }

  async function importBackup(file) {
      if (!file || guardReadOnly()) return;
      const inputEl = document.getElementById('import-file-input');
      if (!confirm('⚠️ Import akan MENIMPA data yang ada sekarang (siswa, tugas, kas, jadwal, HP, piket, dll) dengan isi file "' + file.name + '".\n\nData saat ini TIDAK BISA dikembalikan kecuali kamu punya backup lain.\n\nLanjutkan import?')) {
          if (inputEl) inputEl.value = '';
          return;
      }
      if (!(await requireRecentReauthentication('mengimpor backup dan menimpa data kelas'))) {
          if (inputEl) inputEl.value = '';
          return;
      }

      const reader = new FileReader();
      reader.onload = async (e) => {
          try {
              const parsed = JSON.parse(e.target.result);
              const imported = parsed && parsed.state ? parsed.state : parsed;
              if (!imported || typeof imported !== 'object') throw new Error('Format backup tidak valid.');

              state = Object.assign(state, imported);
              // Lock this import above any stale live-sync snapshot that may arrive
              // while Drive attachments are being migrated.
              state.__kelaskuRevision = Math.max((Number(state.__kelaskuRevision) || 0) + 1, Date.now());
              hydrateLocalUiState();

              // Backup lama dapat berisi Base64 yang membuat dokumen Firestore
              // melewati batas ukuran. Karena Drive sudah terhubung, pindahkan
              // lampiran lama ke Drive terlebih dahulu, lalu simpan metadata saja.
              let migrated = 0;
              if (driveStorageEnabled()) {
                  for (const task of (state.tugas || [])) {
                      const oldFiles = getItemFiles(task);
                      if (!oldFiles.length) continue;
                      const newFiles = [];
                      for (const f of oldFiles) {
                          if (f && f.driveFileId) {
                              newFiles.push({
                                  name: f.name || 'lampiran',
                                  driveFileId: f.driveFileId,
                                  driveUrl: f.driveUrl || attachmentUrl(f),
                                  sizeBytes: Number(f.sizeBytes || f.size || 0),
                                  mimeType: f.mimeType || mimeTypeFromFilename(f.name),
                                  storage: 'google-drive'
                              });
                          } else if (f && f.data) {
                              const stored = await uploadPreparedAttachment({
                                  name: f.name || 'lampiran',
                                  data: f.data,
                                  sizeBytes: Number(f.sizeBytes || Math.floor(base64FromDataUrl(f.data).length * 0.75)),
                                  mimeType: f.mimeType || mimeTypeFromFilename(f.name)
                              }, 'task');
                              newFiles.push(stored);
                              migrated++;
                          } else if (f) {
                              newFiles.push(f);
                          }
                      }
                      task.files = newFiles;
                      delete task.file;
                      delete task.fileData;
                  }

                  for (const kas of (state.kas || [])) {
                      if (!kas) continue;
                      if (kas.fileData && !kas.driveFileId) {
                          const stored = await uploadPreparedAttachment({
                              name: kas.file || 'lampiran',
                              data: kas.fileData,
                              sizeBytes: Number(kas.fileSize || Math.floor(base64FromDataUrl(kas.fileData).length * 0.75)),
                              mimeType: kas.fileMimeType || mimeTypeFromFilename(kas.file)
                          }, 'kas');
                          kas.driveFileId = stored.driveFileId || '';
                          kas.driveUrl = stored.driveUrl || stored.url || '';
                          kas.fileSize = Number(stored.sizeBytes || 0);
                          kas.fileMimeType = stored.mimeType || '';
                          kas.storage = 'google-drive';
                          kas.fileData = '';
                          migrated++;
                      } else if (kas.driveFileId) {
                          kas.fileData = '';
                          kas.storage = 'google-drive';
                      }
                  }

                  // Pengumuman juga dapat membawa Base64 dan sebelumnya belum
                  // ikut dimigrasikan saat import. Ini bisa membuat public-state
                  // terlalu besar lalu membuat import terlihat berhasil padahal
                  // data lama kembali saat halaman direload.
                  for (const announcement of (state.pengumuman || [])) {
                      if (!announcement) continue;
                      const oldFiles = getItemFiles(announcement);
                      if (!oldFiles.length) continue;
                      const newFiles = [];
                      for (const f of oldFiles) {
                          if (f && f.driveFileId) {
                              newFiles.push({
                                  name: f.name || 'lampiran',
                                  driveFileId: f.driveFileId,
                                  driveUrl: f.driveUrl || attachmentUrl(f),
                                  sizeBytes: Number(f.sizeBytes || f.size || 0),
                                  mimeType: f.mimeType || mimeTypeFromFilename(f.name),
                                  storage: 'google-drive'
                              });
                          } else if (f && f.data) {
                              const stored = await uploadPreparedAttachment({
                                  name: f.name || 'lampiran',
                                  data: f.data,
                                  sizeBytes: Number(f.sizeBytes || Math.floor(base64FromDataUrl(f.data).length * 0.75)),
                                  mimeType: f.mimeType || mimeTypeFromFilename(f.name)
                              }, 'announcement');
                              newFiles.push(stored);
                              migrated++;
                          } else if (f) {
                              newFiles.push(f);
                          }
                      }
                      announcement.files = newFiles;
                      delete announcement.file;
                      delete announcement.fileData;
                  }

                  for (const report of (state.reports || [])) {
                      if (!report) continue;
                      if (report.fileData && !report.driveFileId) {
                          const stored = await uploadPreparedAttachment({
                              name: report.file || 'lampiran',
                              data: report.fileData,
                              sizeBytes: Number(report.fileSize || Math.floor(base64FromDataUrl(report.fileData).length * 0.75)),
                              mimeType: report.fileMimeType || mimeTypeFromFilename(report.file)
                          }, 'report');
                          report.driveFileId = stored.driveFileId || '';
                          report.driveUrl = stored.driveUrl || stored.url || '';
                          report.fileSize = Number(stored.sizeBytes || 0);
                          report.fileMimeType = stored.mimeType || '';
                          report.storage = 'google-drive';
                          report.fileData = '';
                          migrated++;
                      } else if (report.driveFileId) {
                          report.fileData = '';
                          report.storage = 'google-drive';
                      }
                  }
              }

              // Normalize imported weekly rotation without mixing different days.
              // Plans from v57/v58 that do not contain `day` are kept intact for backward
              // compatibility; new per-day plans are normalized against their own roster.
              normalizePiketTaskList();
              normalizePiketTaskConfig();
              if (state.piketWeeklyAssignments && typeof state.piketWeeklyAssignments === 'object') {
                  Object.keys(state.piketWeeklyAssignments).forEach(rotationKey => {
                      const plan = state.piketWeeklyAssignments[rotationKey];
                      if (!plan || typeof plan !== 'object') return;
                      if (Array.isArray(plan.tasks)) plan.tasks = uniquePiketTasks(plan.tasks);
                      if (plan.day && SCHOOL_DAYS.includes(plan.day)) {
                          const students = uniquePiketStudents(plan.day);
                          const expected = new Set(students.map(name => name.toLowerCase()));
                          if (plan.assignmentByStudent && typeof plan.assignmentByStudent === 'object') {
                              const normalized = {};
                              Object.keys(plan.assignmentByStudent).forEach(name => {
                                  const cleanName = String(name || '').trim();
                                  const task = String(plan.assignmentByStudent[name] || '').trim();
                                  if (cleanName && expected.has(cleanName.toLowerCase()) && task && plan.tasks.includes(task)) normalized[cleanName] = task;
                              });
                              plan.assignmentByStudent = normalized;
                          }
                          if (plan.assignments && typeof plan.assignments === 'object') {
                              const cleaned = {};
                              Object.keys(plan.assignments).forEach(task => {
                                  const names = Array.isArray(plan.assignments[task]) ? plan.assignments[task] : [];
                                  cleaned[task] = names.map(name => String(name || '').trim()).filter(name => expected.has(name.toLowerCase()));
                              });
                              plan.assignments = cleaned;
                          }
                          plan.quotas = Object.fromEntries(uniquePiketTasks(plan.tasks).map(task => [task, getPiketTaskQuota(task)]));
                      }
                  });
              }

              // Import wajib berhasil menulis public-state sebelum kita membaca
              // ulang dari server. Sebelumnya saveState bisa menganggap import
              // sukses hanya karena dokumen admin berhasil disimpan, lalu reload
              // mengambil public-state lama sehingga data import tampak hilang.
              const result = await saveState({ requirePublic: true, requireAdmin: true });
              if (!result || result.synced === false || !result.publicSynced) {
                  throw new Error('Firebase tidak mengonfirmasi penyimpanan data utama. Data import belum dianggap berhasil.');
              }

              // Baca ulang dari Firebase agar yang tampil adalah data server,
              // bukan hanya state sementara di browser.
              await loadState();
              renderAll();
              showNotification(
                  migrated
                      ? 'Import berhasil. ' + migrated + ' lampiran dipindahkan ke Google Drive dan data tersimpan di Firebase.'
                      : 'Import berhasil dan data tersimpan di Firebase.',
                  'success',
                  7000
              );
          } catch (err) {
              console.error('Import backup error:', err);
              showNotification('Import gagal: ' + (err.message || err), 'error', 8000);
          } finally {
              if (inputEl) inputEl.value = '';
          }
      };
      reader.onerror = () => {
          if (inputEl) inputEl.value = '';
          showNotification('File backup tidak dapat dibaca.', 'error');
      };
      reader.readAsText(file);
  }


  // Global search shortcut: Cmd/Ctrl + K focuses the Kelasku search.
  (function wireGlobalSearchShortcut(){
      if (window.__kelaskuSearchShortcut) return;
      window.__kelaskuSearchShortcut = true;
      document.addEventListener('keydown', function(e){
          if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') {
              const active = document.activeElement;
              if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable)) return;
              const input = document.getElementById('global-search-input');
              if (!input) return;
              e.preventDefault();
              input.focus();
              input.select();
          }
      });
  })();

  // ============================================================
  // NAVIGATION
  // ============================================================
  function autoOpenKasAndCalendarPanels(name) {
      if (!state || typeof state !== 'object') return;
      if (!state.kasFolderMinimized || typeof state.kasFolderMinimized !== 'object') {
          state.kasFolderMinimized = {};
      }
      if (!state.calMinimized || typeof state.calMinimized !== 'object') {
          state.calMinimized = { hp: false, piket: false };
      }

      // Kas: setiap kali menu Kas dibuka, folder kas siswa tetap tertutup.
      // Pengguna dapat membukanya sendiri dengan klik nama folder.
      if (name === 'kas') {
          (state.kasFolders || []).forEach(folder => {
              if (folder && folder.id != null) {
                  state.kasFolderMinimized[String(folder.id)] = true;
              }
          });
          if (typeof renderKasSiswa === 'function') renderKasSiswa();
      }

      // Kalender HP: saat masuk ke menu Pengumpulan HP, kalender tidak otomatis terbuka.
      // Pilihan tanggal tetap kembali ke hari ini seperti sebelumnya.
      if (name === 'hp') {
          state.calMinimized.hp = true;
          const now = new Date();
          const today = todayKey();
          state.hpSelectedDate = today;
          calYear = now.getFullYear();
          calMonth = now.getMonth();
          if (typeof renderHpCalendar === 'function') renderHpCalendar();
          else if (typeof updateCalendarUI === 'function') updateCalendarUI('hp');
          renderHp();
      }

      // Kalender Piket: perilaku yang sama, selalu kembali ke hari ini saat
      // tampilan Piket dibuka kembali.
      if (name === 'jadwal' && state.jadwalMode === 'piket') {
          state.calMinimized.piket = true;
          const now = new Date();
          state.piketSelectedDate = todayKey();
          piketCalYear = now.getFullYear();
          piketCalMonth = now.getMonth();
          if (typeof renderPiketCalendar === 'function') renderPiketCalendar();
          else if (typeof updateCalendarUI === 'function') updateCalendarUI('piket');
          renderPiket();
      }
  }

  function goTo(name) {
      const target = document.getElementById('view-' + name);
      if (!target) return;

      // Reset SEMUA view secara eksplisit.
      // Ini mencegah konten menu Kas (termasuk Kas Siswa)
      // tertinggal ketika berpindah ke HP, Setelan, atau menu lain.
      document.querySelectorAll('.view').forEach(v => {
          v.classList.remove('active');
          v.style.display = 'none';
          v.setAttribute('aria-hidden', 'true');
      });

      // Hanya view tujuan yang boleh tampil.
      target.classList.add('active');
      target.style.display = 'block';
      target.removeAttribute('aria-hidden');

      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      // Menu sekunder (Tugas/Laporan/Catur/Setelan) tetap berada di bawah
      // Bottom Nav utama: Lainnya.
      const primaryMobileTab = ['tugas','laporan','catur','settings'].includes(name) ? 'lainnya' : name;
      const tab = document.querySelector('.tab[data-tab="' + primaryMobileTab + '"]');
      if (tab) tab.classList.add('active');

      document.querySelectorAll('.desktop-nav-btn, .desktop-nav-item')
          .forEach(t => t.classList.remove('active'));

      const desktopTab = document.querySelector(
          '.desktop-nav-btn[data-desktop-tab="' + name + '"], ' +
          '.desktop-nav-item[data-tab="' + name + '"]'
      );
      if (desktopTab) desktopTab.classList.add('active');

      const content = document.querySelector('.content');
      if (content) content.scrollTop = 0;

      if (name === 'catur' && typeof window.__kelaskuChessInit === 'function') { window.__kelaskuChessInit(); }

      if (name === 'settings' && typeof renderAccountList === 'function') {
          renderAccountList();
      }

      if (name === 'jadwal') {
          const mode = state && state.jadwalMode === 'piket' ? 'piket' : 'pelajaran';
          try {
              setJadwalMode(mode);
          } catch (e) {
              console.warn('Jadwal mode render fallback:', e);
              renderDayTabs();
              renderJadwalList();
          }
      }

      // Folder Kas dan kalender tetap memakai perilaku yang sudah ada.
      autoOpenKasAndCalendarPanels(name);
  }

  function openModal(name) { document.getElementById('modal-' + name).classList.add('open'); }
  function closeModal(name) { document.getElementById('modal-' + name).classList.remove('open'); }
  // ============================================================
  // CLOCK
  // ============================================================
  function updateClock() {
      const d = new Date();
      document.getElementById('clock').textContent = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  }
  updateClock(); setInterval(updateClock, 10000);
  // ============================================================
  // EKSPOR FUNGSI KE GLOBAL
  // ============================================================
  window.doAuthSubmit = doAuthSubmit;
  window.toggleAuthMode = toggleAuthMode;
  window.doForgotPassword = doForgotPassword;
  window.confirmReauthentication = confirmReauthentication;
  window.cancelReauthentication = cancelReauthentication;
  window.toggleTheme = toggleTheme;
  window.openAvatarPicker = openAvatarPicker;
  window.handleAvatarFile = handleAvatarFile;
  window.removeAvatar = removeAvatar;
  window.goTo = goTo;
  window.openKasFolderModal = openKasFolderModal;
  window.submitKasFolder = submitKasFolder;
  window.openKasStudentModal = openKasStudentModal;
  window.submitKasStudent = submitKasStudent;
  window.deleteKasFolder = deleteKasFolder;
  window.toggleKasFolder = toggleKasFolder;
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.logout = logout;
  window.resetData = resetData;
  window.clearLocalData = clearLocalData;
  window.addAccount = addAccount;
  window.openAccountEditModal = openAccountEditModal;
  window.submitAccountEdit = submitAccountEdit;
  window.toggleAccountActiveFromModal = toggleAccountActiveFromModal;
  window.exportBackup = exportBackup;
  window.importBackup = importBackup;
  window.toggleCalendar = toggleCalendar;
  window.openMonthYearPicker = openMonthYearPicker;
  window.changePickerYear = changePickerYear;
  window.choosePickerMonth = choosePickerMonth;
  window.toggleRosterStudent = toggleRosterStudent;
  window.toggleAllRoster = toggleAllRoster;
  window.toggleRosterList = toggleRosterList;
  window.onRosterSearch = onRosterSearch;
  window.calShift = calShift;
  window.piketCalShift = piketCalShift;
  window.setJadwalMode = setJadwalMode;
  window.openJadwalModal = openJadwalModal;
  window.submitJadwal = submitJadwal;
  window.deleteJadwalCurrent = deleteJadwalCurrent;
  window.openPiketJadwalModal = openPiketJadwalModal;
  window.openPiketRotationModal = openPiketRotationModal;
  window.setPiketRotationMode = setPiketRotationMode;
  window.addPiketTaskInput = addPiketTaskInput;
  window.removePiketTaskInput = removePiketTaskInput;
  window.savePiketRotation = savePiketRotation;
  window.resetRoster = resetRoster;
  window.openStudentModal = openStudentModal;
  window.submitStudent = submitStudent;
  window.renderGlobalSearch = renderGlobalSearch;
  window.openGlobalSearchResult = openGlobalSearchResult;
  window.markNotificationRead = markNotificationRead;
  window.markAllNotificationsRead = markAllNotificationsRead;
  window.openPengumumanModal = openPengumumanModal;
  window.submitPengumuman = submitPengumuman;
  window.onPengumumanFileSelected = onPengumumanFileSelected;
  window.removePengumumanEditFile = removePengumumanEditFile;
  window.openAnnouncementFileAt = openAnnouncementFileAt;
  window.deletePengumumanCurrent = deletePengumumanCurrent;
  window.submitTugas = submitTugas;
  window.clearDoneTugas = clearDoneTugas;
  window.setAutoCleanDays = setAutoCleanDays;
  window.setAutoCleanReportDays = setAutoCleanReportDays;
  window.openTaskFileAt = openTaskFileAt;
  window.onTugasFileSelected = onTugasFileSelected;
  window.removeTugasEditFile = removeTugasEditFile;
  window.openKasFile = openKasFile;
  window.openReportFile = openReportFile;
  window.toggleTugas = toggleTugas;
  window.deleteTugas = deleteTugas;
  window.openTugasModal = openTugasModal;
  window.deleteTugasCurrent = deleteTugasCurrent;
  window.openReportModal = openReportModal;
  window.submitReport = submitReport;
  window.deleteReport = deleteReport;
  window.submitKas = submitKas;
  window.openKasEditModal = openKasEditModal;
  window.openKasAddModal = openKasAddModal;
  window.hapusKas = hapusKas;
  window.hapusKasCurrent = hapusKasCurrent;
  window.openExportModal = openExportModal;
  window.copyExportText = copyExportText;
  window.openStatsModal = openStatsModal;
  window.selectHpDate = selectHpDate;
  window.selectPiketDate = selectPiketDate;
  window.selectDay = selectDay;
  window.openRosterStatusModal = openRosterStatusModal;
  window.openHpEditModal = openHpEditModal;
  window.setHpEditStatus = setHpEditStatus;
  window.submitHpEdit = submitHpEdit;
  window.setRosterStatusChoice = setRosterStatusChoice;
  window.submitRosterStatus = submitRosterStatus;
  window.clearRosterStatus = clearRosterStatus;
  window.removeStudent = removeStudent;
  window.togglePiketJadwalStudent = togglePiketJadwalStudent;
  window.selectPiketJadwalDay = selectPiketJadwalDay;
  window.todayKey = todayKey;
