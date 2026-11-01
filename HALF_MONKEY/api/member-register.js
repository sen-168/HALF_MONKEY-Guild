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
const admin = require("firebase-admin");
const CLASSES = ["Ironclad", "Sylph", "Nightwaker", "Bloodstorm", "Dragonsvelte", "Celestune", "Mystique"];
const clean = (v, n) => String(v || "").trim().slice(0, n);
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  let createdUid = "";
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const gameName = clean(body.gameName, 40);
    const nickname = clean(body.nickname, 30);
    const characterName = clean(body.characterName, 40);
    const gameClass = clean(body.gameClass, 30);
    const bio = clean(body.bio, 500);
    const password = String(body.password || "");
    if (!gameName || !nickname || !characterName || !CLASSES.includes(gameClass) || password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ เลือกคลาส และตั้งรหัสผ่าน 8–128 ตัวอักษร" });
    }
    const app = getAdminApp();
    const db = app.firestore();
    const counter = db.collection("system").doc("memberCounter");
    const id = await db.runTransaction(async tx => {
      const snap = await tx.get(counter);
      const next = Math.max(6, Number(snap.exists ? snap.data().lastNumber : 6) || 6) + 1;
      tx.set(counter, { lastNumber: next }, { merge: true });
      return "HM" + String(next).padStart(3, "0");
    });
    const email = id.toLowerCase() + "@members.halfmonkey.invalid";
    const account = await app.auth().createUser({ uid: "hm-" + id, email, password, displayName: gameName });
    createdUid = account.uid;
    await db.collection("members").doc(id).set({
      id, gameName, nickname, characterName, gameClass, bio,
      role: "member", status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.status(201).json({ ok: true, id, message: "ส่งใบสมัครแล้ว กรุณารอหัวหน้ากิลด์อนุมัติ" });
  } catch (error) {
    if (createdUid) { try { await getAdminApp().auth().deleteUser(createdUid); } catch (_) {} }
    console.error("member-register:", error.message);
    const conflict = ["auth/email-already-exists", "auth/uid-already-exists"].includes(error.code);
    return res.status(conflict ? 409 : 500).json({ error: conflict ? "บัญชีนี้มีอยู่แล้ว กรุณาติดต่อหัวหน้ากิลด์" : "สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่" });
  }
};
