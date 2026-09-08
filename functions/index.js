exports.bootstrapSuperAdmin = onCall(async (request) => {
  requireSignedIn(request);

  const SUPERADMIN_UID = "cffzW5yM1Dh2IX4nrsNAFDaw1At2";

  if (request.auth.uid !== SUPERADMIN_UID) {
    throw new HttpsError(
      "permission-denied",
      "Hanya akun Super Admin utama yang boleh melakukan bootstrap."
    );
  }

  const user = await auth.getUser(SUPERADMIN_UID);

  await auth.setCustomUserClaims(SUPERADMIN_UID, {
    ...(user.customClaims || {}),
    role: "superadmin"
  });

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
});
