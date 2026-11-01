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
const LEGACY = {
  HM001: { name: "銀河 ` Yumeko", role: "leader" },
  HM002: { name: "銀河 ` Noriko", role: "member" },
  HM003: { name: "銀河 ` Kisumi", role: "member" },
  HM004: { name: "銀河 ` Haruto", role: "member" },
  HM005: { name: "銀河 ` Hanmuenli", role: "member" },
  HM006: { name: "銀河 ` Miyuki", role: "member" }
};
function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") { res.setHeader("Allow", "POST, OPTIONS"); return res.status(204).end(); }
  if (req.method !== "POST") { res.setHeader("Allow", "POST, OPTIONS"); return res.status(405).json({ error: "Method not allowed" }); }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const memberId = String(body.memberId || "").trim().toUpperCase();
    const password = String(body.password || "");
    const app = getAdminApp();
    let member = LEGACY[memberId];
    let profile = null;

    if (member) {
      const expected = memberId === "HM001" ? process.env.HM_LEADER_PASSWORD : process.env.HM_MEMBER_PASSWORD;
      if (!expected) {
        console.error("Missing legacy password environment variable:", memberId === "HM001" ? "HM_LEADER_PASSWORD" : "HM_MEMBER_PASSWORD");
        return res.status(500).json({ error: "ระบบยังไม่ได้ตั้งค่ารหัสผ่านบัญชีเดิม กรุณาแจ้งผู้ดูแลระบบ" });
      }
      if (!safeEqual(password, expected)) return res.status(401).json({ error: "รหัสสมาชิกหรือรหัสผ่านไม่ถูกต้อง" });
    } else {
      if (!/^HM\d{3,}$/.test(memberId)) return res.status(401).json({ error: "รหัสสมาชิกหรือรหัสผ่านไม่ถูกต้อง" });
      const snap = await app.firestore().collection("members").doc(memberId).get();
      if (!snap.exists || snap.data().status !== "approved") {
        return res.status(403).json({ error: snap.exists && snap.data().status === "pending" ? "บัญชียังรอหัวหน้ากิลด์อนุมัติ" : "ไม่พบบัญชีที่อนุมัติแล้ว" });
      }
      profile = snap.data();
      if (!profile.passwordSalt || !profile.passwordHash) {
        return res.status(401).json({ error: "บัญชีนี้ยังไม่มีข้อมูลรหัสผ่าน กรุณาติดต่อหัวหน้ากิลด์" });
      }
      const actual = crypto.scryptSync(password, profile.passwordSalt, 64);
      const expected = Buffer.from(profile.passwordHash, "hex");
      if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
        return res.status(401).json({ error: "รหัสสมาชิกหรือรหัสผ่านไม่ถูกต้อง" });
      }
      member = { name:profile.gameName, role:"member" };
    }

    const uid = "hm-" + memberId;
    const customToken = await app.auth().createCustomToken(uid, {
      memberId, role:member.role, displayName:member.name
    });
    return res.status(200).json({
      token:customToken,
      member:{ id:memberId, name:member.name, role:member.role, ...(profile ? { nickname:profile.nickname, characterName:profile.characterName, gameClass:profile.gameClass, bio:profile.bio, gameName:profile.gameName } : {}) }
    });
  } catch (error) {
    console.error("member-login error:", error.message);
    return res.status(500).json({ error:"ระบบเข้าสู่ระบบขัดข้อง กรุณาลองใหม่ภายหลัง" });
  }
};
