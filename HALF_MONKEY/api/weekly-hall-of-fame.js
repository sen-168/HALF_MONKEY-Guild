const admin = require("firebase-admin");

function getAdminApp() {
  if (admin.apps.length) return admin.app();
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const projectId = process.env.FIREBASE_PROJECT_ID || "sen-k168";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  if (!privateKey || !clientEmail) throw new Error("Firebase Admin credentials are not configured");
  return admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
}
async function verifyMember(req) {
  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!match) { const e = new Error("กรุณาเข้าสู่ระบบก่อน"); e.status = 401; throw e; }
  const decoded = await getAdminApp().auth().verifyIdToken(match[1]);
  if (!decoded.memberId || !["leader", "member"].includes(decoded.role) || decoded.uid !== "hm-" + decoded.memberId) {
    const e = new Error("บัญชีสมาชิกไม่ถูกต้อง"); e.status = 403; throw e;
  }
  return decoded;
}
function isLeader(user) {
  return user.role === "leader" && user.memberId === "HM001" && user.uid === "hm-HM001";
}
function validImage(value) {
  return typeof value === "string" && value.length <= 500 &&
    (/^https:\/\//i.test(value) || /^\/?(images|assets)\/[a-zA-Z0-9_./-]+$/.test(value));
}
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") { res.setHeader("Allow", "GET, POST, OPTIONS"); return res.status(204).end(); }
  try {
    const user = await verifyMember(req);
    const db = getAdminApp().firestore();
    const collection = db.collection("weeklyHallOfFame");
    if (req.method === "GET") {
      const weekKey = String(req.query.weekKey || "");
      if (weekKey && !/^\d{4}-W\d{2}$/.test(weekKey)) return res.status(400).json({ error: "รูปแบบสัปดาห์ไม่ถูกต้อง" });
      if (weekKey) {
        const snap = await collection.doc(weekKey).get();
        return res.status(200).json({ weekKey, rows: snap.exists ? (snap.data().rows || []) : [] });
      }
      const snap = await collection.orderBy("updatedAt", "desc").limit(60).get();
      return res.status(200).json({ weeks: snap.docs.map(d => ({ weekKey: d.id, updatedAt: d.data().updatedAt || null })) });
    }
    if (req.method === "POST") {
      if (!isLeader(user)) return res.status(403).json({ error: "เฉพาะหัวหน้ากิลด์ HM001 เท่านั้นที่แก้ไขทำเนียบได้" });
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const weekKey = String(body.weekKey || "");
      if (!/^\d{4}-W\d{2}$/.test(weekKey)) return res.status(400).json({ error: "กรุณาเลือกสัปดาห์ให้ถูกต้อง" });
      if (!Array.isArray(body.rows) || body.rows.length !== 7) return res.status(400).json({ error: "ต้องมีข้อมูลครบ 7 อันดับ" });
      const rows = body.rows.map((row, index) => ({
        rank: index + 1,
        title: String(row.title || "").trim().slice(0, 50),
        name: String(row.name || "").trim().slice(0, 60),
        score: Math.max(0, Math.min(999999999, Math.floor(Number(row.score) || 0))),
        highlight: String(row.highlight || "").trim().slice(0, 90),
        image: String(row.image || "").trim()
      }));
      if (rows.some(row => !row.title || !row.name || !validImage(row.image))) return res.status(400).json({ error: "กรุณากรอกตำแหน่ง ชื่อ และพาธรูปที่ถูกต้องให้ครบทั้ง 7 อันดับ" });
      await collection.doc(weekKey).set({ weekKey, rows, updatedBy: user.memberId, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return res.status(200).json({ ok: true, weekKey });
    }
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("weekly-hall-of-fame error:", error.message);
    return res.status(error.status || 500).json({ error: error.status ? error.message : "ระบบทำเนียบยอดฝีมือขัดข้อง กรุณาลองใหม่" });
  }
};