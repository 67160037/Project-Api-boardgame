const crypto = require("node:crypto");

const COOKIE_NAME = "staff_session";
const SESSION_SECONDS = 8 * 60 * 60;
const TOKEN_ISSUER = "meeple-mug-api";

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET ต้องมีความยาวอย่างน้อย 32 ตัวอักษร");
  return value;
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function createAccessToken(staff, now = Math.floor(Date.now() / 1000)) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: String(staff.id),
    username: staff.username,
    iss: TOKEN_ISSUER,
    iat: now,
    exp: now + SESSION_SECONDS,
  })).toString("base64url");
  const input = `${header}.${payload}`;
  const signature = crypto.createHmac("sha256", secret()).update(input).digest("base64url");
  return `${input}.${signature}`;
}

function verifyAccessToken(token, now = Math.floor(Date.now() / 1000)) {
  const parts = String(token).split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts;
  const expected = crypto.createHmac("sha256", secret()).update(`${headerPart}.${payloadPart}`).digest();
  let supplied;
  try { supplied = Buffer.from(signaturePart, "base64url"); } catch { return null; }
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
  try {
    const header = JSON.parse(Buffer.from(headerPart, "base64url").toString());
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString());
    if (header.alg !== "HS256" || header.typ !== "JWT" || payload.iss !== TOKEN_ISSUER || !/^\d+$/.test(payload.sub) || !payload.username || !Number.isInteger(payload.exp) || payload.exp <= now) return null;
    return { id: Number(payload.sub), username: payload.username, exp: payload.exp };
  } catch { return null; }
}

function readSession(req) {
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) return null;
  const cookies = (req.headers.cookie || "").split(";").map((part) => part.trim());
  const value = cookies.find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  if (!value) return null;
  const [body, supplied] = value.split(".");
  if (!body || !supplied) return null;
  const expected = crypto.createHmac("sha256", secret()).update(body).digest();
  let actual;
  try { actual = Buffer.from(supplied, "base64url"); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!payload.id || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

function setSession(res, staff) {
  const token = sign({ id: staff.id, username: staff.username, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS });
  res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: SESSION_SECONDS * 1000, path: "/" });
}

function requireStaff(req, res, next) {
  try {
    const authorization = req.headers.authorization;
    let staff;
    if (authorization !== undefined) {
      const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
      staff = match ? verifyAccessToken(match[1]) : null;
    } else {
      staff = readSession(req);
    }
    if (!staff) return res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "กรุณาเข้าสู่ระบบพนักงาน" } });
    req.staff = staff;
    next();
  } catch (err) { next(err); }
}

module.exports = { COOKIE_NAME, SESSION_SECONDS, createAccessToken, requireStaff, readSession, setSession, verifyAccessToken };
