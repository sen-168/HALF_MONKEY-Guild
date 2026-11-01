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
const LEGACY = [
  { id:"HM001", gameName:"銀河 ` Yumeko", nickname:"Yumeko", characterName:"", gameClass:"", bio:"ผู้นำแห่ง HALF MONKEY พร้อมบัญชาการทุกศึก", role:"leader", status:"approved" },
  { id:"HM002", gameName:"銀河 ` Noriko", nickname:"Noriko", characterName:"", gameClass:"", bio:"กำลังหลักที่คอยดูแลสมาชิกและวางแผนการรบ", role:"member", status:"approved" },
  { id:"HM003", gameName:"銀河 ` Kisumi", nickname:"Kisumi", characterName:"", gameClass:"", bio:"แม่นยำ วางแผนเป็น และพร้อมสนับสนุนทีม", role:"member", status:"approved" },
  { id:"HM004", gameName:"銀河 ` Haruto", nickname:"Haruto", characterName:"", gameClass:"", bio:"ยืนหยัดเคียงข้างทีมในทุกสถานการณ์", role:"member", status:"approved" },
  { id:"HM005", gameName:"銀河 ` Hanmuenli", nickname:"Hanmuenli", characterName:"", gameClass:"", bio:"ประสานงานกิจกรรมและดูแลความพร้อมของสมาชิก", role:"member", status:"approved" },
  { id:"HM006", gameName:"銀河 ` Miyuki", nickname:"Miyuki", characterName:"", gameClass:"", bio:"วิเคราะห์สถานการณ์และช่วยทีมเลือกกลยุทธ์", role:"member", status:"approved" }
];
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const app = getAdminApp();
    const db = app.firestore();
    if (req.method === "GET") {
      const snap = await db.collection("members").where("status", "==", "approved").get();
      const all = new Map(LEGACY.map(m => [m.id, m]));
      snap.docs.forEach(d => all.set(d.id, d.data()));
      let pending = [];
      const bearer = String(req.headers.authorization || "");
      if (bearer) {
        const actor = await requireUser(req);
        if (actor.memberId === "HM001" && actor.role === "leader") {
          const waiting = await db.collection("members").where("status", "==", "pending").get();
          pending = waiting.docs.map(d => d.data());
        }
      }
      return res.status(200).json({
        members: [...all.values()].sort((a,b) => a.id.localeCompare(b.id, "en", {numeric:true})),
        pending
      });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const actor = await requireUser(req);
    if (actor.memberId !== "HM001" || actor.role !== "leader") return res.status(403).json({ error: "เฉพาะหัวหน้ากิลด์เท่านั้น" });
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const id = String(body.id || "").toUpperCase();
    const action = String(body.action || "");
    if (!/^HM\d{3,}$/.test(id) || !["approve","reject","suspend"].includes(action)) return res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง" });
    const ref = db.collection("members").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "ไม่พบสมาชิก" });
    if (action === "reject") {
      await ref.update({ status:"rejected", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      try { await app.auth().deleteUser("hm-" + id); } catch (_) {}
    } else {
      await ref.update({ status: action === "approve" ? "approved" : "suspended", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      await app.auth().updateUser("hm-" + id, { disabled: action !== "approve" });
      if (action === "approve") await app.auth().setCustomUserClaims("hm-" + id, { memberId:id, role:"member", displayName:snap.data().gameName });
    }
    return res.status(200).json({ ok:true });
  } catch (error) {
    console.error("members:", error.message);
    return res.status(error.status || 500).json({ error: error.status ? error.message : "ไม่สามารถดำเนินการได้" });
  }
};
