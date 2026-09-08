/**
 * migrate-claims.js
 *
 * Jalankan SEKALI setelah Firebase Admin SDK siap.
 * Tujuan:
 *   kelasku_profiles/{uid}.role
 *        ↓
 *   Firebase Authentication Custom Claims
 *
 * Jalankan dari lingkungan server/trusted environment.
 */

const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

const PROFILE_COLLECTION = 'kelasku_profiles';

async function migrateClaims() {
  const snapshot = await db.collection(PROFILE_COLLECTION).get();

  let total = 0;
  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of snapshot.docs) {
    total++;

    const uid = doc.id;
    const data = doc.data() || {};
    const role = data.role;

    // Hanya role yang valid.
    if (!['siswa', 'admin', 'superadmin'].includes(role)) {
      console.log(`[SKIP] ${uid}: role tidak valid ->`, role);
      skipped++;
      continue;
    }

    try {
      // Pastikan user Firebase memang ada.
      const user = await auth.getUser(uid);

      await auth.setCustomUserClaims(uid, {
        role
      });

      console.log(
        `[OK] ${user.email || uid}: Custom Claim role=${role}`
      );

      success++;
    } catch (error) {
      console.error(
        `[ERROR] ${uid}:`,
        error.message || error
      );

      failed++;
    }
  }

  console.log('\n===== MIGRASI SELESAI =====');
  console.log('Total   :', total);
  console.log('Berhasil:', success);
  console.log('Skip    :', skipped);
  console.log('Gagal   :', failed);
}

migrateClaims()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Migrasi gagal:', error);
    process.exit(1);
  });
