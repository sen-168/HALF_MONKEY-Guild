const admin = require("firebase-admin");
const crypto = require("node:crypto");

function getAdminApp() {
  if (admin.apps.length) return admin.app();
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const projectId = process.env.FIREBASE_PROJECT_ID || "sen-k168";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  if (!privateKey || !clientEmail) throw new Error("Firebase Admin credentials are not configured");
  return admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
}

async function requireUser(req) {
  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!match) { const e = new Error("กรุณาเข้าสู่ระบบก่อน"); e.status = 401; throw e; }
  return getAdminApp().auth().verifyIdToken(match[1]);
}

const LEGACY_MEMBER_IDS = new Set(["HM002", "HM003", "HM004", "HM005", "HM006"]);

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") { res.setHeader("Allow", "POST, OPTIONS"); return res.status(204).end(); }
  if (req.method !== "POST") { res.setHeader("Allow", "POST, OPTIONS"); return res.status(405).json({ error: "Method not allowed" }); }

  try {
    const actor = await requireUser(req);
    if (actor.memberId !== "HM001" || actor.role !== "leader") {
      return res.status(403).json({ error: "เฉพาะหัวหน้ากิลด์เท่านั้นที่รีเซ็ตรหัสผ่านสมาชิกได้" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const memberId = String(body.memberId || "").trim().toUpperCase();
    const newPassword = String(body.newPassword || "");
    if (!/^HM\d{3,}$/.test(memberId) || memberId === "HM001") {
      return res.status(400).json({ error: "รหัสสมาชิกไม่ถูกต้อง หรือไม่สามารถรีเซ็ตรหัสผ่านหัวหน้ากิลด์จากเมนูนี้ได้" });
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({ error: "รหัสผ่านใหม่ต้องมีความยาว 8–128 ตัวอักษร" });
    }

    const app = getAdminApp();
    const ref = app.firestore().collection("members").doc(memberId);
    const snap = await ref.get();
    const isLegacy = LEGACY_MEMBER_IDS.has(memberId);
    if (!isLegacy && (!snap.exists || snap.data().status !== "approved")) {
      return res.status(404).json({ error: "ไม่พบสมาชิกที่ได้รับอนุมัติแล้ว" });
    }
    if (snap.exists && snap.data().status && snap.data().status !== "approved") {
      return res.status(403).json({ error: "สมาชิกคนนี้ยังไม่ได้รับอนุมัติ หรือถูกระงับบัญชี" });
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = crypto.scryptSync(newPassword, salt, 64).toString("hex");
    await ref.set({
      id: memberId,
      role: "member",
      status: "approved",
      passwordSalt: salt,
      passwordHash,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    if (!isLegacy) {
      try { await app.auth().updateUser("hm-" + memberId, { disabled: false }); }
      catch (error) {
        if (error.code !== "auth/user-not-found") throw error;
      }
    }

    return res.status(200).json({ ok: true, memberId, message: "รีเซ็ตรหัสผ่านสำเร็จ" });
  } catch (error) {
    console.error("member-reset-password:", error.message);
    return res.status(error.status || 500).json({ error: error.status ? error.message : "รีเซ็ตรหัสผ่านไม่สำเร็จ กรุณาลองใหม่" });
  }
};
