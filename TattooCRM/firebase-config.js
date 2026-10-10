// Reuse the shared default app and owner-guarded Firestore.
window.FB = { auth: MyApps.auth, db: MyApps.db() };
