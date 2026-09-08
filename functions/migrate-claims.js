const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();

const auth = getAuth();
const db = getFirestore();

const ALLOWED_ROLES = ["siswa", "admin", "superadmin"];

async function migrateClaims() {
  console.log("=== MIGRASI ROLE KE CUSTOM CLAIMS ===");

  const snapshot = await db
    .collection("kelasku_profiles")
    .get();

  if (snapshot.empty) {
    console.log("Tidak ada profile.");
    return;
  }

  let success = 0;
  let failed = 0;

  for (const doc of snapshot.docs) {
    const uid = doc.id;
    const data = doc.data() || {};

    const role = data.role || "siswa";

    if (!ALLOWED_ROLES.includes(role)) {
      console.log(
        `SKIP ${uid}: role "${role}" tidak valid`
      );
      failed++;
      continue;
    }

    try {
      const user = await auth.getUser(uid);

      await auth.setCustomUserClaims(uid, {
        ...(user.customClaims || {}),
        role
      });

      console.log(
        `OK ${uid} -> ${role}`
      );

      success++;
    } catch (error) {
      console.error(
        `GAGAL ${uid}:`,
        error.message
      );

      failed++;
    }
  }

  console.log("");
  console.log("=== SELESAI ===");
  console.log(`Berhasil : ${success}`);
  console.log(`Gagal    : ${failed}`);
}

migrateClaims()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error("ERROR:", error);
    process.exit(1);
  });
