const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const {
  getFirestore,
  FieldValue
} = require("firebase-admin/firestore");

initializeApp();

const auth = getAuth();
const db = getFirestore();

const ALLOWED_ROLES = [
  "siswa",
  "admin",
  "superadmin"
];

// ============================================================
// HELPER
// ============================================================

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

// ============================================================
// BOOTSTRAP SUPER ADMIN
// ============================================================

exports.bootstrapSuperAdmin = onCall(
  { cors: true },
  async (request) => {
    requireSignedIn(request);

    const SUPERADMIN_UID =
      "cffzW5yM1Dh2IX4nrsNAFDaw1At2";

    if (request.auth.uid !== SUPERADMIN_UID) {
      throw new HttpsError(
        "permission-denied",
        "Hanya akun Super Admin utama yang boleh melakukan bootstrap."
      );
    }

    let user;

    try {
      user = await auth.getUser(SUPERADMIN_UID);
    } catch (error) {
      throw new HttpsError(
        "not-found",
        "Akun Super Admin tidak ditemukan di Authentication."
      );
    }

    await auth.setCustomUserClaims(
      SUPERADMIN_UID,
      {
        ...(user.customClaims || {}),
        role: "superadmin"
      }
    );

    await db
      .collection("kelasku_profiles")
      .doc(SUPERADMIN_UID)
      .set(
        {
          role: "superadmin",
          active: true
        },
        { merge: true }
      );

    return {
      success: true,
      uid: SUPERADMIN_UID,
      role: "superadmin"
    };
  }
);

// ============================================================
// SET USER ROLE
// ============================================================

exports.setUserRole = onCall(
  { cors: true },
  async (request) => {
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

    await auth.setCustomUserClaims(
      uid,
      {
        ...(userRecord.customClaims || {}),
        role
      }
    );

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
  }
);

// ============================================================
// CREATE USER ACCOUNT
// ============================================================

exports.createUserAccount = onCall(
  { cors: true },
  async (request) => {
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
        email: email,
        password: password,
        displayName: username.trim()
      });
    } catch (error) {
      throw new HttpsError(
        "already-exists",
        error.message ||
          "Gagal membuat akun."
      );
    }

    await auth.setCustomUserClaims(
      userRecord.uid,
      {
        role
      }
    );

    await db
      .collection("kelasku_profiles")
      .doc(userRecord.uid)
      .set({
        email: email,
        username: username.trim(),
        role: role,
        active: true,
        createdAt: FieldValue.serverTimestamp()
      });

    return {
      success: true,
      uid: userRecord.uid,
      email: email,
      username: username.trim(),
      role: role
    };
  }
);

// ============================================================
// SET USER ACTIVE
// ============================================================

exports.setUserActive = onCall(
  { cors: true },
  async (request) => {
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

    try {
      await auth.updateUser(uid, {
        disabled: !active
      });
    } catch (error) {
      throw new HttpsError(
        "not-found",
        "Pengguna tidak ditemukan."
      );
    }

    await db
      .collection("kelasku_profiles")
      .doc(uid)
      .set(
        {
          active: active,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );

    return {
      success: true,
      uid,
      active
    };
  }
);

// ============================================================
// DELETE USER ACCOUNT
// ============================================================

exports.deleteUserAccount = onCall(
  { cors: true },
  async (request) => {
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
  }
);

// ============================================================
// REFRESH TOKEN
// ============================================================

exports.refreshMyToken = onCall(
  { cors: true },
  async (request) => {
    requireSignedIn(request);

    const uid = request.auth.uid;

    const user = await auth.getUser(uid);

    const claims = user.customClaims || {};

    await auth.setCustomUserClaims(
      uid,
      {
        ...claims
      }
    );

    return {
      success: true,
      uid,
      role: claims.role || null
    };
  }
);

// ============================================================
// HEALTH CHECK
// ============================================================

exports.healthCheck = onRequest(
  { cors: true },
  (req, res) => {
    res.status(200).json({
      success: true,
      service: "kelasku-functions",
      time: new Date().toISOString()
    });
  }
);
