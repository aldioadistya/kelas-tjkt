const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();

const auth = getAuth();
const db = getFirestore();

const ALLOWED_ROLES = ["siswa", "admin", "superadmin"];

function requireSignedIn(request) {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Kamu harus login terlebih dahulu."
    );
  }
}

function requireSuperAdmin(request) {
  requireSignedIn(request);

  const role = request.auth.token.role;

  if (role !== "superadmin") {
    throw new HttpsError(
      "permission-denied",
      "Hanya Super Admin yang boleh melakukan tindakan ini."
    );
  }
}

function validateRole(role) {
  if (!ALLOWED_ROLES.includes(role)) {
    throw new HttpsError(
      "invalid-argument",
      "Role tidak valid."
    );
  }
}

function validateEmail(email) {
  if (
    typeof email !== "string" ||
    !email.includes("@") ||
    email.length > 254
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Email tidak valid."
    );
  }
}

/**
 * Set role Custom Claim pengguna
 */
exports.setUserRole = onCall(async (request) => {
  requireSuperAdmin(request);

  const data = request.data || {};
  const uid = data.uid;
  const role = data.role;

  if (typeof uid !== "string" || !uid) {
    throw new HttpsError(
      "invalid-argument",
      "UID wajib diisi."
    );
  }

  validateRole(role);

  let userRecord;

  try {
    userRecord = await auth.getUser(uid);
  } catch (error) {
    throw new HttpsError(
      "not-found",
      "Pengguna tidak ditemukan."
    );
  }

  await auth.setCustomUserClaims(uid, {
    ...(userRecord.customClaims || {}),
    role
  });

  await db
    .collection("kelasku_profiles")
    .doc(uid)
    .set(
      {
        role,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

  return {
    success: true,
    uid,
    role
  };
});

/**
 * Membuat akun pengguna baru
 */
exports.createUserAccount = onCall(async (request) => {
  requireSuperAdmin(request);

  const data = request.data || {};

  const email = data.email;
  const password = data.password;
  const username = data.username;
  const role = data.role || "siswa";

  validateEmail(email);
  validateRole(role);

  if (
    typeof password !== "string" ||
    password.length < 6
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Password minimal 6 karakter."
    );
  }

  if (
    typeof username !== "string" ||
    username.trim().length < 1 ||
    username.trim().length > 80
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Username tidak valid."
    );
  }

  let userRecord;

  try {
    userRecord = await auth.createUser({
      email,
      password,
      displayName: username.trim()
    });
  } catch (error) {
    throw new HttpsError(
      "already-exists",
      error.message || "Gagal membuat akun."
    );
  }

  await auth.setCustomUserClaims(userRecord.uid, {
    role
  });

  await db
    .collection("kelasku_profiles")
    .doc(userRecord.uid)
    .set({
      email,
      username: username.trim(),
      role,
      active: true,
      createdAt: FieldValue.serverTimestamp()
    });

  return {
    success: true,
    uid: userRecord.uid,
    email,
    username: username.trim(),
    role
  };
});

/**
 * Mengaktifkan / menonaktifkan akun
 */
exports.setUserActive = onCall(async (request) => {
  requireSuperAdmin(request);

  const data = request.data || {};
  const uid = data.uid;
  const active = data.active;

  if (typeof uid !== "string" || !uid) {
    throw new HttpsError(
      "invalid-argument",
      "UID wajib diisi."
    );
  }

  if (typeof active !== "boolean") {
    throw new HttpsError(
      "invalid-argument",
      "active harus berupa true atau false."
    );
  }

  await auth.updateUser(uid, {
    disabled: !active
  });

  await db
    .collection("kelasku_profiles")
    .doc(uid)
    .set(
      {
        active,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

  return {
    success: true,
    uid,
    active
  };
});

/**
 * Menghapus akun
 */
exports.deleteUserAccount = onCall(async (request) => {
  requireSuperAdmin(request);

  const data = request.data || {};
  const uid = data.uid;

  if (typeof uid !== "string" || !uid) {
    throw new HttpsError(
      "invalid-argument",
      "UID wajib diisi."
    );
  }

  if (uid === request.auth.uid) {
    throw new HttpsError(
      "failed-precondition",
      "Super Admin tidak boleh menghapus akunnya sendiri."
    );
  }

  try {
    await auth.deleteUser(uid);
  } catch (error) {
    throw new HttpsError(
      "not-found",
      "Akun tidak ditemukan."
    );
  }

  await db
    .collection("kelasku_profiles")
    .doc(uid)
    .delete();

  return {
    success: true,
    uid
  };
});

/**
 * Refresh token pengguna sendiri
 */
exports.refreshMyToken = onCall(async (request) => {
  requireSignedIn(request);

  const uid = request.auth.uid;
  const user = await auth.getUser(uid);

  const claims = user.customClaims || {};

  await auth.setCustomUserClaims(uid, {
    ...claims
  });

  return {
    success: true,
    uid,
    role: claims.role || null
  };
});

/**
 * Health check
 */
exports.healthCheck = onRequest((req, res) => {
  res.status(200).json({
    success: true,
    service: "kelasku-functions",
    time: new Date().toISOString()
  });
});
