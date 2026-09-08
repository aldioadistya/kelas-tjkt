const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

const PROFILE_COLLECTION = "kelasku_profiles";

const VALID_ROLES = ["siswa", "admin", "superadmin"];

const BOOTSTRAP_SUPERADMIN_UID = "cffzW5yM1Dh2IX4nrsNAFDaw1At2";

/*
===========================================================
HELPER
===========================================================
*/

function requireAuth(request) {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Anda harus login."
    );
  }

  return request.auth;
}

function requireSuperAdmin(request) {
  const authContext = requireAuth(request);

  const role = authContext.token.role;

  if (
    role !== "superadmin" &&
    authContext.uid !== BOOTSTRAP_SUPERADMIN_UID
  ) {
    throw new HttpsError(
      "permission-denied",
      "Hanya Super Admin yang dapat melakukan tindakan ini."
    );
  }

  return authContext;
}

function validateRole(role) {
  if (!VALID_ROLES.includes(role)) {
    throw new HttpsError(
      "invalid-argument",
      "Role tidak valid."
    );
  }
}

/*
===========================================================
SET CUSTOM CLAIM ROLE
===========================================================
*/

exports.setUserRole = onCall(async (request) => {
  const caller = requireSuperAdmin(request);

  const data = request.data || {};

  const uid = String(data.uid || "").trim();
  const role = String(data.role || "").trim();

  if (!uid) {
    throw new HttpsError(
      "invalid-argument",
      "UID pengguna wajib diisi."
    );
  }

  validateRole(role);

  // Tidak boleh menurunkan Super Admin utama.
  if (uid === BOOTSTRAP_SUPERADMIN_UID && role !== "superadmin") {
    throw new HttpsError(
      "permission-denied",
      "Super Admin utama tidak dapat diturunkan."
    );
  }

  try {
    // Pastikan user Firebase ada.
    const user = await auth.getUser(uid);

    // Set Custom Claim.
    await auth.setCustomUserClaims(uid, {
      role: role
    });

    // Sinkronkan profile Firestore.
    await db
      .collection(PROFILE_COLLECTION)
      .doc(uid)
      .set(
        {
          role: role,
          roleUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          roleUpdatedBy: caller.uid
        },
        {
          merge: true
        }
      );

    return {
      success: true,
      uid: user.uid,
      email: user.email || null,
      role: role
    };

  } catch (error) {
    console.error("setUserRole error:", error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      "internal",
      "Gagal mengubah role pengguna."
    );
  }
});

/*
===========================================================
CREATE USER
===========================================================
*/

exports.createUserAccount = onCall(async (request) => {
  requireSuperAdmin(request);

  const data = request.data || {};

  const email = String(data.email || "").trim().toLowerCase();
  const password = String(data.password || "");
  const username = String(data.username || "").trim();
  const role = String(data.role || "siswa").trim();

  if (!email) {
    throw new HttpsError(
      "invalid-argument",
      "Email wajib diisi."
    );
  }

  if (!password || password.length < 6) {
    throw new HttpsError(
      "invalid-argument",
      "Password minimal 6 karakter."
    );
  }

  if (!username || username.length > 80) {
    throw new HttpsError(
      "invalid-argument",
      "Username tidak valid."
    );
  }

  validateRole(role);

  try {
    const user = await auth.createUser({
      email,
      password,
      displayName: username
    });

    await auth.setCustomUserClaims(user.uid, {
      role
    });

    await db
      .collection(PROFILE_COLLECTION)
      .doc(user.uid)
      .set({
        email,
        username,
        role,
        active: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: request.auth.uid
      });

    return {
      success: true,
      uid: user.uid,
      email,
      username,
      role
    };

  } catch (error) {
    console.error("createUserAccount error:", error);

    if (error.code === "auth/email-already-exists") {
      throw new HttpsError(
        "already-exists",
        "Email tersebut sudah digunakan."
      );
    }

    throw new HttpsError(
      "internal",
      "Gagal membuat akun."
    );
  }
});

/*
===========================================================
DISABLE / ENABLE USER
===========================================================
*/

exports.setUserActive = onCall(async (request) => {
  const caller = requireSuperAdmin(request);

  const data = request.data || {};

  const uid = String(data.uid || "").trim();
  const active = data.active === true;

  if (!uid) {
    throw new HttpsError(
      "invalid-argument",
      "UID pengguna wajib diisi."
    );
  }

  if (uid === caller.uid) {
    throw new HttpsError(
      "permission-denied",
      "Anda tidak dapat menonaktifkan akun sendiri."
    );
  }

  if (uid === BOOTSTRAP_SUPERADMIN_UID && !active) {
    throw new HttpsError(
      "permission-denied",
      "Super Admin utama tidak dapat dinonaktifkan."
    );
  }

  try {
    await auth.updateUser(uid, {
      disabled: !active
    });

    await db
      .collection(PROFILE_COLLECTION)
      .doc(uid)
      .set(
        {
          active,
          activeUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          activeUpdatedBy: caller.uid
        },
        {
          merge: true
        }
      );

    return {
      success: true,
      uid,
      active
    };

  } catch (error) {
    console.error("setUserActive error:", error);

    throw new HttpsError(
      "internal",
      "Gagal mengubah status akun."
    );
  }
});

/*
===========================================================
DELETE USER
===========================================================
*/

exports.deleteUserAccount = onCall(async (request) => {
  const caller = requireSuperAdmin(request);

  const data = request.data || {};
  const uid = String(data.uid || "").trim();

  if (!uid) {
    throw new HttpsError(
      "invalid-argument",
      "UID pengguna wajib diisi."
    );
  }

  if (uid === caller.uid) {
    throw new HttpsError(
      "permission-denied",
      "Anda tidak dapat menghapus akun sendiri."
    );
  }

  if (uid === BOOTSTRAP_SUPERADMIN_UID) {
    throw new HttpsError(
      "permission-denied",
      "Super Admin utama tidak dapat dihapus."
    );
  }

  try {
    await auth.deleteUser(uid);

    await db
      .collection(PROFILE_COLLECTION)
      .doc(uid)
      .delete();

    return {
      success: true,
      uid
    };

  } catch (error) {
    console.error("deleteUserAccount error:", error);

    throw new HttpsError(
      "internal",
      "Gagal menghapus akun."
    );
  }
});

/*
===========================================================
REFRESH CLAIMS
===========================================================
*/

exports.refreshMyToken = onCall(async (request) => {
  const authContext = requireAuth(request);

  const uid = authContext.uid;

  const user = await auth.getUser(uid);

  return {
    success: true,
    uid: user.uid,
    message:
      "Silakan refresh ID token di client untuk mengambil Custom Claims terbaru."
  };
});

/*
===========================================================
HEALTH CHECK
===========================================================
*/

exports.healthCheck = onRequest((req, res) => {
  res.status(200).json({
    success: true,
    service: "Kelasku Security Functions",
    timestamp: new Date().toISOString()
  });
});
