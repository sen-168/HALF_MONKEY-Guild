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
const CLASSES = ["Ironclad", "Sylph", "Nightwaker", "Bloodstorm", "Dragonsvelte", "Celestune", "Mystique"];
const clean = (v, n) => String(v || "").trim().slice(0, n);
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed" });
  try {
    const actor = await requireUser(req);
    const id = String(actor.memberId || "");
    if (!/^HM\d{3,}$/.test(id)) return res.status(403).json({ error: "บัญชีนี้ยังไม่รองรับการแก้โปรไฟล์" });
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const gameName = clean(body.gameName, 40);
    const nickname = clean(body.nickname, 30);
    const characterName = clean(body.characterName, 40);
    const gameClass = clean(body.gameClass, 30);
    const bio = clean(body.bio, 500);
    if (!gameName || !nickname || !characterName || !CLASSES.includes(gameClass)) {
      return res.status(400).json({ error: "กรุณากรอกชื่อในเกม ชื่อเล่น ชื่อตัวละคร และคลาสให้ครบ" });
    }
    const app = getAdminApp();
    const ref = app.firestore().collection("members").doc(id);
    const snap = await ref.get();
    if (snap.exists && snap.data().status !== "approved") return res.status(403).json({ error: "บัญชียังไม่ได้รับอนุมัติ" });
    await ref.set({ id, gameName, nickname, characterName, gameClass, bio, role:actor.role || "member", status:"approved", updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge:true });
    await app.auth().updateUser("hm-" + id, { displayName: gameName });
    await app.auth().setCustomUserClaims("hm-" + id, { memberId:id, role:actor.role || "member", displayName:gameName });
    return res.status(200).json({ ok:true });
  } catch (error) {
    console.error("member-profile:", error.message);
    return res.status(error.status || 500).json({ error: error.status ? error.message : "บันทึกโปรไฟล์ไม่สำเร็จ" });
  }
};
