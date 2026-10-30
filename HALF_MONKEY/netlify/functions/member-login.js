const admin = require("firebase-admin");
const crypto = require("node:crypto");

const ALLOWED_ORIGIN = "https://halfmonkeygg.netlify.app";
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

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  if (event.headers.origin && event.headers.origin !== ALLOWED_ORIGIN) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: "Origin not allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const memberId = String(body.memberId || "").trim().toUpperCase();
    const password = String(body.password || "");
    const member = MEMBERS[memberId];

    const expectedPassword = memberId === "HM001"
      ? process.env.HM_LEADER_PASSWORD
      : process.env.HM_MEMBER_PASSWORD;

    if (!member || !expectedPassword || !safeEqual(password, expectedPassword)) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: "รหัสสมาชิกหรือรหัสผ่านไม่ถูกต้อง" }) };
    }

    const app = getAdminApp();
    const uid = "hm-" + memberId;
    const customToken = await app.auth().createCustomToken(uid, {
      memberId,
      role: member.role,
      displayName: member.name
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        token: customToken,
        member: { id: memberId, name: member.name, role: member.role }
      })
    };
  } catch (error) {
    console.error("member-login error:", error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "ระบบเข้าสู่ระบบขัดข้อง กรุณาลองใหม่ภายหลัง" })
    };
  }
};
