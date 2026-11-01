const admin = require("firebase-admin");
function getAdminApp() {
  if (admin.apps.length) return admin.app();
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const projectId = process.env.FIREBASE_PROJECT_ID || "sen-k168";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  if (!privateKey || !clientEmail) throw new Error("Firebase Admin credentials are not configured");
  return admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
}
async function requireUser(req) {
  const match = String(req.headers.authorization || "").match(/^Bearer\\s+(.+)$/i);
  if (!match) { const e = new Error("กรุณาเข้าสู่ระบบก่อน"); e.status = 401; throw e; }
  return getAdminApp().auth().verifyIdToken(match[1]);
}
module.exports = { getAdminApp, requireUser };
