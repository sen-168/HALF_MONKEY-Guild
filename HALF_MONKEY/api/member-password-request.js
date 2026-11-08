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
  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!match) { const e = new Error("กรุณาเข้าสู่ระบบก่อน"); e.status = 401; throw e; }
  return getAdminApp().auth().verifyIdToken(match[1]);
}

const LEGACY_IDS = new Set(["HM001", "HM002", "HM003", "HM004", "HM005", "HM006"]);
const validId = id => /^HM\d{3,}$/.test(id);

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") { res.setHeader("Allow", "GET, POST, PATCH, OPTIONS"); return res.status(204).end(); }

  try {
    const app = getAdminApp();
    const db = app.firestore();

    // Members submit a request using the member ID already entered on the login form.
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const memberId = String(body.memberId || "").trim().toUpperCase();
      if (!validId(memberId) || memberId === "HM001") {
        return res.status(200).json({ ok: true, message: "หากพบรหัสสมาชิกในระบบ จะส่งคำขอให้หัวหน้ากิลด์ตรวจสอบแล้ว" });
      }

      let approved = LEGACY_IDS.has(memberId);
      if (!approved) {
        const memberSnap = await db.collection("members").doc(memberId).get();
        approved = memberSnap.exists && memberSnap.data().status === "approved";
      }

      if (approved) {
        const ref = db.collection("passwordResetRequests").doc(memberId);
        const old = await ref.get();
        if (!old.exists || old.data().status !== "pending") {
          await ref.set({
            memberId,
            status: "pending",
            requestedAt: admin.firestore.FieldValue.serverTimestamp(),
            handledAt: null
          }, { merge: true });
        }
      }
      return res.status(200).json({ ok: true, message: "หากพบรหัสสมาชิกในระบบ จะส่งคำขอให้หัวหน้ากิลด์ตรวจสอบแล้ว" });
    }

    // All request viewing and completion actions are restricted to HM001.
    const actor = await requireUser(req);
    if (actor.memberId !== "HM001" || actor.role !== "leader") {
      return res.status(403).json({ error: "เฉพาะหัวหน้ากิลด์เท่านั้น" });
    }

    if (req.method === "GET") {
      const snap = await db.collection("passwordResetRequests").where("status", "==", "pending").get();
      const requests = await Promise.all(snap.docs.map(async doc => {
        const memberId = doc.id;
        const profile = await db.collection("members").doc(memberId).get();
        const legacyNames = {
          HM002: "銀河 ` Noriko", HM003: "銀河 ` Kisumi", HM004: "銀河 ` Haruto",
          HM005: "銀河 ` Hanmuenli", HM006: "銀河 ` Miyuki"
        };
        const data = doc.data();
        const requestedAt = data.requestedAt && data.requestedAt.toDate ? data.requestedAt.toDate().toISOString() : null;
        return { memberId, name: profile.exists ? (profile.data().gameName || profile.data().name || memberId) : (legacyNames[memberId] || memberId), requestedAt };
      }));
      requests.sort((a, b) => String(a.requestedAt || "").localeCompare(String(b.requestedAt || "")));
      return res.status(200).json({ requests });
    }

    if (req.method === "PATCH") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const memberId = String(body.memberId || "").trim().toUpperCase();
      if (!validId(memberId) || memberId === "HM001") return res.status(400).json({ error: "รหัสสมาชิกไม่ถูกต้อง" });
      const ref = db.collection("passwordResetRequests").doc(memberId);
      const snap = await ref.get();
      if (!snap.exists || snap.data().status !== "pending") return res.status(404).json({ error: "ไม่พบคำขอที่รอดำเนินการ" });
      await ref.update({
        status: "resolved",
        handledAt: admin.firestore.FieldValue.serverTimestamp(),
        handledBy: "HM001"
      });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, PATCH, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("member-password-request:", error.message);
    return res.status(error.status || 500).json({ error: error.status ? error.message : "ดำเนินการไม่สำเร็จ กรุณาลองใหม่" });
  }
};
