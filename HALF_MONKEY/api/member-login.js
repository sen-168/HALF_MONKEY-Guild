const admin = require("firebase-admin");
const crypto = require("node:crypto");

const MEMBERS = {
  HM001: { name: "銀河 ` Yumeko", role: "leader" },
  HM002: { name: "銀河 ` Noriko", role: "member" },
  HM003: { name: "銀河 ` Kisumi", role: "member" },
  HM004: { name: "銀河 ` Haruto", role: "member" },
  HM005: { name: "銀河 ` Hanmuenli", role: "member" },
  HM006: { name: "銀河 ` Miyuki", role: "member" }
};

function getAdminApp() {
  if (admin.apps.length) return admin.app();

  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const projectId = process.env.FIREBASE_PROJECT_ID || "sen-k168";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (!privateKey || !clientEmail) {
    throw new Error("Firebase Admin credentials are not configured");
  }

  return admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey })
  });
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const memberId = String(body.memberId || "").trim().toUpperCase();
    const password = String(body.password || "");
    const member = MEMBERS[memberId];

    const expectedPassword = memberId === "HM001"
      ? process.env.HM_LEADER_PASSWORD
      : process.env.HM_MEMBER_PASSWORD;

    if (!member || !expectedPassword || !safeEqual(password, expectedPassword)) {
      return res.status(401).json({ error: "รหัสสมาชิกหรือรหัสผ่านไม่ถูกต้อง" });
    }

    const app = getAdminApp();
    const uid = "hm-" + memberId;
    const customToken = await app.auth().createCustomToken(uid, {
      memberId,
      role: member.role,
      displayName: member.name
    });

    return res.status(200).json({
      token: customToken,
      member: { id: memberId, name: member.name, role: member.role }
    });
  } catch (error) {
    console.error("member-login error:", error.message);
    return res.status(500).json({
      error: "ระบบเข้าสู่ระบบขัดข้อง กรุณาลองใหม่ภายหลัง"
    });
  }
};
