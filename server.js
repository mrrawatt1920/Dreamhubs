const http = require("http");
const fs = require("fs");

// Stability handlers for production
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Fatal] Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[Fatal] Uncaught Exception:", err);
});

const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const { MongoClient } = require("mongodb");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const ENV_FILE = path.join(ROOT, ".env");

loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_HOURS || 168) * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = Number(process.env.RESET_LINK_TTL_MINUTES || 5) * 60 * 1000;
const LOGIN_MAX_FAILURES = Number(process.env.LOGIN_MAX_FAILURES || 5);
const LOGIN_LOCK_MS = Number(process.env.LOGIN_LOCK_MINUTES || 60) * 60 * 1000;
const RESET_REQUEST_COOLDOWN_MS = Number(process.env.RESET_REQUEST_COOLDOWN_SECONDS || 60) * 1000;
const RESET_REQUEST_LIMIT = Number(process.env.RESET_REQUEST_LIMIT_PER_HOUR || 5);
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || "dreamhubsadmin").trim().toLowerCase();
const ADMIN_EMAIL = normalizeEmail(process.env.ADMIN_EMAIL || "dreamhubsadmin@dreamhubs.local");
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "ChangeThisAdminPassword123!");
const GOOGLE_CLIENT_ID = String(
  process.env.GOOGLE_CLIENT_ID || "184790123400-pbah8rr03a6csnea4m9m4gsae7vt9bkq.apps.googleusercontent.com"
).trim();
const APP_BASE_URL = String(process.env.APP_BASE_URL || `http://localhost:${PORT}`);
const SMTP_HOST = String(process.env.SMTP_HOST || "").trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = String(process.env.SMTP_USER || "").trim();
const SMTP_PASS = String(process.env.SMTP_PASS || "").trim();
const SMTP_FROM = String(process.env.SMTP_FROM || "").trim();
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const mailTransport = createMailTransport();
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
let mongoClient = null;
let dbCollection = null;

function loadEnvFile() {
  try {
    const raw = fs.readFileSync(ENV_FILE, "utf8");
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        return;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key && !(key in process.env)) {
        process.env[key] = value;
      }
    });
  } catch {
  }
}

async function ensureDb() {
  const uri = String(process.env.MONGODB_URI || "");
  if (!uri) throw new Error("Missing MONGODB_URI in environment variables.");

  if (!mongoClient) {
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    const database = mongoClient.db();
    dbCollection = database.collection("dreamhubs_data");
  }

  const exist = await dbCollection.findOne({ _id: "main_store" });
  if (!exist) {
    const initial = createInitialDb();
    await dbCollection.insertOne({ _id: "main_store", data: initial });
  } else if (!exist.data) {
    await dbCollection.replaceOne({ _id: "main_store" }, { _id: "main_store", data: createInitialDb() });
  }
}

function createInitialDb() {
  return {
    users: [],
    sessions: [],
    adminSessions: [],
    orders: [],
    tickets: [],
    fundRequests: [],
    passwordResetTokens: [],
    loginFailures: [],
    resetRequests: [],
    services: [
      {
        id: "svc_instagram_reel_views",
        category: "Instagram - Trending Services",
        name: "Instagram Reel Views - Used By Influencers",
        ratePer1000: 0.42,
        min: 100,
        max: 2147483647,
        speed: "500K / HOUR",
        refill: "LIFETIME",
        cancel: "YES",
        quality: "REAL"
      }
    ],
    providers: []
  };
}

async function readDb() {
  const doc = await dbCollection.findOne({ _id: "main_store" });
  const parsed = doc && doc.data ? doc.data : createInitialDb();
  return normalizeDb(parsed);
}

function normalizeDb(db) {
  return {
    users: Array.isArray(db.users) ? db.users : [],
    sessions: Array.isArray(db.sessions) ? db.sessions : [],
    adminSessions: Array.isArray(db.adminSessions) ? db.adminSessions : [],
    orders: Array.isArray(db.orders) ? db.orders : [],
    tickets: Array.isArray(db.tickets) ? db.tickets : [],
    fundRequests: Array.isArray(db.fundRequests) ? db.fundRequests : [],
    passwordResetTokens: Array.isArray(db.passwordResetTokens) ? db.passwordResetTokens : [],
    loginFailures: Array.isArray(db.loginFailures) ? db.loginFailures : [],
    resetRequests: Array.isArray(db.resetRequests) ? db.resetRequests : [],
    services: Array.isArray(db.services) ? db.services : [],
    providers: Array.isArray(db.providers)
      ? db.providers.map(p => ({ ...p, exchangeRate: Number(p.exchangeRate || 1) }))
      : (db.provider && typeof db.provider === "object" && db.provider.url
          ? [{ id: generateId("pro"), name: "Master Provider", url: db.provider.url, key: db.provider.key, margin: db.provider.margin || 10, exchangeRate: 1 }]
          : [])
  };
}

async function writeDb(data) {
  await dbCollection.replaceOne(
    { _id: "main_store" },
    { _id: "main_store", data: normalizeDb(data) },
    { upsert: true }
  );
}

function send(res, status, payload, headers = {}) {
  const isBuffer = Buffer.isBuffer(payload);
  const body = isBuffer ? payload : JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": isBuffer ? "application/octet-stream" : "application/json; charset=utf-8",
    ...headers
  });
  res.end(body);
}

function sendText(res, status, text, contentType) {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(text);
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body");
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function generateId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

function generateToken(size = 24) {
  return crypto.randomBytes(size).toString("hex");
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function verifyPassword(password, stored) {
  const [salt, originalHash] = String(stored || "").split(":");
  if (!salt || !originalHash) {
    return false;
  }

  const nextHash = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(originalHash, "hex"), Buffer.from(nextHash, "hex"));
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    balance: user.balance,
    provider: user.provider,
    createdAt: user.createdAt
  };
}

function sanitizeAdmin() {
  return {
    username: ADMIN_USERNAME,
    email: ADMIN_EMAIL,
    role: "admin"
  };
}

function getToken(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return null;
  }

  return auth.slice("Bearer ".length).trim();
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  return req.socket.remoteAddress || "unknown";
}

function nowIso() {
  return new Date().toISOString();
}

function isExpired(iso, ttlMs) {
  return !iso || (Date.now() - new Date(iso).getTime()) > ttlMs;
}

function cleanupDb(db) {
  const now = Date.now();
  db.sessions = db.sessions.filter((entry) => now - new Date(entry.createdAt).getTime() <= SESSION_TTL_MS);
  db.adminSessions = db.adminSessions.filter((entry) => now - new Date(entry.createdAt).getTime() <= SESSION_TTL_MS);
  db.passwordResetTokens = db.passwordResetTokens.filter((entry) => !entry.usedAt && new Date(entry.expiresAt).getTime() > now);
  db.loginFailures = db.loginFailures.filter((entry) => now - new Date(entry.lastAttemptAt).getTime() <= LOGIN_LOCK_MS);
  db.resetRequests = db.resetRequests.filter((entry) => now - new Date(entry.createdAt).getTime() <= 60 * 60 * 1000);
}

async function requireUser(req) {
  const token = getToken(req);
  if (!token) {
    return null;
  }

  const db = await readDb();
  cleanupDb(db);
  const session = db.sessions.find((entry) => entry.token === token);
  if (!session) {
    await writeDb(db);
    return null;
  }

  const user = db.users.find((entry) => entry.id === session.userId);
  if (!user) {
    db.sessions = db.sessions.filter((entry) => entry.token !== token);
    await writeDb(db);
    return null;
  }

  await writeDb(db);
  return { db, user, token };
}

async function requireAdmin(req) {
  const token = getToken(req);
  if (!token) {
    return null;
  }

  const db = await readDb();
  cleanupDb(db);
  const session = db.adminSessions.find((entry) => entry.token === token);
  if (!session) {
    await writeDb(db);
    return null;
  }

  await writeDb(db);
  return { db, admin: sanitizeAdmin(), token };
}

function deriveUsername(nameOrEmail, existingUsers) {
  const base = String(nameOrEmail || "dreamuser")
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 14) || "dreamuser";

  let username = base;
  let count = 1;
  while (existingUsers.some((user) => user.username === username)) {
    count += 1;
    username = `${base}${count}`;
  }

  return username;
}

function findValidResetToken(db, token) {
  const tokenHash = hashToken(token);
  const now = Date.now();

  return db.passwordResetTokens.find((entry) => (
    entry.tokenHash === tokenHash &&
    !entry.usedAt &&
    new Date(entry.expiresAt).getTime() > now
  )) || null;
}

function validatePassword(password) {
  const value = String(password || "");
  if (value.length < 8) {
    return "Password must be at least 8 characters long.";
  }

  return "";
}

function validateEmail(email) {
  const value = normalizeEmail(email);
  if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return "Enter a valid email address.";
  }

  return "";
}

function validateName(name) {
  if (String(name || "").trim().length < 2) {
    return "Name must be at least 2 characters long.";
  }

  return "";
}

function validateLoginIdentifier(value) {
  if (String(value || "").trim().length < 3) {
    return "Enter your email or username.";
  }

  return "";
}

function createSession(db, userId) {
  const token = generateToken(24);
  db.sessions.push({
    token,
    userId,
    createdAt: nowIso()
  });
  return token;
}

function createAdminSession(db) {
  const token = generateToken(24);
  db.adminSessions.push({
    token,
    createdAt: nowIso()
  });
  return token;
}

function getFailureKey(identifier, ip) {
  return `${String(identifier || "").toLowerCase()}|${ip}`;
}

function getLoginFailureRecord(db, identifier, ip) {
  const key = getFailureKey(identifier, ip);
  let record = db.loginFailures.find((entry) => entry.key === key);
  if (!record) {
    record = {
      key,
      identifier: String(identifier || "").toLowerCase(),
      ip,
      count: 0,
      lockedUntil: null,
      lastAttemptAt: nowIso()
    };
    db.loginFailures.push(record);
  }

  return record;
}

function clearLoginFailures(db, identifier, ip) {
  const key = getFailureKey(identifier, ip);
  db.loginFailures = db.loginFailures.filter((entry) => entry.key !== key);
}

function registerLoginFailure(db, identifier, ip) {
  const record = getLoginFailureRecord(db, identifier, ip);
  record.count += 1;
  record.lastAttemptAt = nowIso();
  if (record.count >= LOGIN_MAX_FAILURES) {
    record.lockedUntil = new Date(Date.now() + LOGIN_LOCK_MS).toISOString();
  }
  return record;
}

function getLoginLockMessage(record) {
  if (record.lockedUntil && new Date(record.lockedUntil).getTime() > Date.now()) {
    return `Too many failed login attempts. Try again after ${new Date(record.lockedUntil).toLocaleString("en-IN")}.`;
  }

  return "";
}

function canRequestPasswordReset(db, email, ip) {
  const now = Date.now();
  const recent = db.resetRequests.filter((entry) => now - new Date(entry.createdAt).getTime() <= 60 * 60 * 1000);
  const byEmail = recent.filter((entry) => entry.email === email);
  const byIp = recent.filter((entry) => entry.ip === ip);
  const latestForEmail = byEmail[byEmail.length - 1];

  if (latestForEmail && now - new Date(latestForEmail.createdAt).getTime() < RESET_REQUEST_COOLDOWN_MS) {
    return false;
  }

  if (byEmail.length >= RESET_REQUEST_LIMIT || byIp.length >= RESET_REQUEST_LIMIT) {
    return false;
  }

  return true;
}

function trackPasswordResetRequest(db, email, ip) {
  db.resetRequests.push({
    email,
    ip,
    createdAt: nowIso()
  });
}

async function dispatchResetEmail(email, resetUrl, expiresAt) {
  if (mailTransport) {
    await mailTransport.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: "DreamHubs password reset link",
      text: [
        "You requested a password reset for your DreamHubs account.",
        `This reset link is valid for 5 minutes: ${resetUrl}`,
        `The link expires at: ${expiresAt}`,
        "If you did not request this, you can ignore this email."
      ].join("\n"),
      html: [
        "<p>You requested a password reset for your DreamHubs account.</p>",
        `<p><a href="${resetUrl}">Reset your password</a></p>`,
        "<p>This reset link is valid for 5 minutes.</p>",
        `<p>It expires at: ${expiresAt}</p>`,
        "<p>If you did not request this, you can ignore this email.</p>"
      ].join("")
    });
    console.log(`[SMTP] Reset email sent to ${email} via ${SMTP_HOST}:${SMTP_PORT}`);
    return;
  }

  console.log(`[Password Reset Fallback] ${email}: ${resetUrl} (valid for 5 minutes, until ${expiresAt})`);
}

function buildAdminStats(db) {
  const openTickets = db.tickets.filter((ticket) => ticket.status === "Open").length;
  const pendingFunds = db.fundRequests.filter((item) => item.status === "Pending").length;
  return {
    users: db.users.length,
    orders: db.orders.length,
    tickets: openTickets,
    fundRequests: pendingFunds,
    services: db.services.length
  };
}

function requireNonEmpty(value, message) {
  if (!String(value || "").trim()) {
    throw new Error(message);
  }
}

function createMailTransport() {
  let nodemailer = null;

  try {
    nodemailer = require("nodemailer");
  } catch {
    nodemailer = null;
  }

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    return null;
  }

  if (!nodemailer) {
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
}

async function handleApi(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await parseBody(req);
    const db = await readDb();
    cleanupDb(db);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const name = String(body.name || "").trim();

    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    const nameError = validateName(name);
    if (nameError || emailError || passwordError) {
      return send(res, 400, { error: nameError || emailError || passwordError });
    }

    if (db.users.some((user) => user.email === email)) {
      return send(res, 409, { error: "An account already exists with that email." });
    }

    const username = deriveUsername(body.username || name, db.users);
    const user = {
      id: generateId("usr"),
      name,
      username,
      email,
      passwordHash: hashPassword(password),
      balance: 0,
      provider: "email",
      createdAt: nowIso()
    };

    db.users.push(user);
    const token = createSession(db, user.id);
    await writeDb(db);
    return send(res, 201, { token, user: sanitizeUser(user) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await parseBody(req);
    const db = await readDb();
    cleanupDb(db);
    const identifier = String(body.emailOrUsername || "").trim().toLowerCase();
    const password = String(body.password || "");
    const ip = getClientIp(req);

    const identifierError = validateLoginIdentifier(identifier);
    if (identifierError) {
      return send(res, 400, { error: identifierError });
    }

    const lockRecord = getLoginFailureRecord(db, identifier, ip);
    const lockMessage = getLoginLockMessage(lockRecord);
    if (lockMessage) {
      await writeDb(db);
      return send(res, 429, { error: lockMessage });
    }

    const user = db.users.find(
      (entry) => entry.email === identifier || entry.username.toLowerCase() === identifier
    );

    if (!user || !verifyPassword(password, user.passwordHash)) {
      const failure = registerLoginFailure(db, identifier, ip);
      await writeDb(db);
      const failureLockMessage = getLoginLockMessage(failure);
      return send(res, failureLockMessage ? 429 : 401, {
        error: failureLockMessage || "Invalid email/username or password."
      });
    }

    clearLoginFailures(db, identifier, ip);
    const token = createSession(db, user.id);
    await writeDb(db);
    return send(res, 200, { token, user: sanitizeUser(user) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/google") {
    const body = await parseBody(req);
    const db = await readDb();
    cleanupDb(db);
    const credential = String(body.credential || "");

    if (!googleClient || !credential) {
      return send(res, 400, { error: "Google login is not configured correctly." });
    }

    let ticket;
    try {
      ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID
      });
    } catch {
      return send(res, 401, { error: "Google sign-in verification failed." });
    }

    const payload = ticket.getPayload();
    const email = normalizeEmail(payload?.email);
    const name = String(payload?.name || payload?.given_name || "Google User").trim();
    const googleSub = String(payload?.sub || "");
    const emailVerified = Boolean(payload?.email_verified);
    const emailError = validateEmail(email);

    if (emailError || !googleSub || !emailVerified) {
      return send(res, 400, { error: "Google account email is not verified." });
    }

    let user = db.users.find((entry) => entry.googleSub === googleSub || entry.email === email);
    if (!user) {
      user = {
        id: generateId("usr"),
        name,
        username: deriveUsername(name || email, db.users),
        email,
        googleSub,
        passwordHash: "",
        balance: 0,
        provider: "google",
        createdAt: nowIso()
      };
      db.users.push(user);
    } else {
      user.googleSub = googleSub;
      user.provider = "google";
      if (!user.username) {
        user.username = deriveUsername(name || email, db.users);
      }
    }

    const token = createSession(db, user.id);
    await writeDb(db);
    return send(res, 200, { token, user: sanitizeUser(user) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/forgot-password") {
    const body = await parseBody(req);
    const db = await readDb();
    cleanupDb(db);
    const email = normalizeEmail(body.email);
    const ip = getClientIp(req);

    if (!validateEmail(email) && canRequestPasswordReset(db, email, ip)) {
      const user = db.users.find((entry) => entry.email === email);
      trackPasswordResetRequest(db, email, ip);

      if (user) {
        const token = generateToken(32);
        const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
        db.passwordResetTokens = db.passwordResetTokens.filter((entry) => entry.userId !== user.id);
        db.passwordResetTokens.push({
          id: generateId("rst"),
          userId: user.id,
          tokenHash: hashToken(token),
          createdAt: nowIso(),
          expiresAt,
          usedAt: null
        });

        const resetUrl = `${APP_BASE_URL}/reset-password.html?token=${token}`;
        await dispatchResetEmail(email, resetUrl, expiresAt);
      }

      await writeDb(db);
    }

    return send(res, 200, {
      message: "If this user's email exists, we have sent a reset link."
    });
  }

  if (req.method === "GET" && url.pathname === "/api/auth/reset-password/validate") {
    const db = await readDb();
    cleanupDb(db);
    const token = String(url.searchParams.get("token") || "");
    const resetEntry = findValidResetToken(db, token);
    await writeDb(db);

    if (!resetEntry) {
      return send(res, 400, { error: "This reset link is invalid or has expired." });
    }

    return send(res, 200, { message: "This reset link is valid for 5 minutes." });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/reset-password") {
    const body = await parseBody(req);
    const db = await readDb();
    cleanupDb(db);
    const token = String(body.token || "");
    const newPassword = String(body.newPassword || "");
    const passwordError = validatePassword(newPassword);
    const resetEntry = findValidResetToken(db, token);

    if (passwordError) {
      return send(res, 400, { error: passwordError });
    }

    if (!resetEntry) {
      return send(res, 400, { error: "This reset link is invalid or has expired." });
    }

    const user = db.users.find((entry) => entry.id === resetEntry.userId);
    if (!user) {
      return send(res, 400, { error: "This reset link is invalid or has expired." });
    }

    user.passwordHash = hashPassword(newPassword);
    db.passwordResetTokens = db.passwordResetTokens.filter((entry) => entry.userId !== user.id);
    db.sessions = db.sessions.filter((entry) => entry.userId !== user.id);
    await writeDb(db);
    return send(res, 200, { message: "Password updated successfully. Redirecting to login." });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/login") {
    const body = await parseBody(req);
    const db = await readDb();
    cleanupDb(db);
    const identifier = String(body.identifier || body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    const matchesAdmin =
      identifier === ADMIN_USERNAME ||
      normalizeEmail(identifier) === ADMIN_EMAIL;

    if (!matchesAdmin || password !== ADMIN_PASSWORD) {
      await writeDb(db);
      return send(res, 401, { error: "Invalid admin credentials." });
    }

    const token = createAdminSession(db);
    await writeDb(db);
    return send(res, 200, { token, admin: sanitizeAdmin() });
  }

  if (req.method === "GET" && url.pathname === "/api/admin/dashboard") {
    const auth = await requireAdmin(req);
    if (!auth) {
      return send(res, 401, { error: "Unauthorized" });
    }

    return send(res, 200, {
      admin: auth.admin,
      stats: buildAdminStats(auth.db),
      users: auth.db.users.map(sanitizeUser),
      orders: auth.db.orders,
      tickets: auth.db.tickets,
      fundRequests: auth.db.fundRequests,
      services: auth.db.services
    });
  }

  if (req.method === "GET" && url.pathname === "/api/admin/providers") {
    const auth = await requireAdmin(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });
    return send(res, 200, { providers: auth.db.providers });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/providers") {
    const auth = await requireAdmin(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });
    const body = await parseBody(req);
    const name = String(body.name || "New Provider").trim();
    const urlStr = String(body.url || "").trim();
    const key = String(body.key || "").trim();
    const margin = Number(body.margin || 10);
    const exchangeRate = Number(body.exchangeRate || 1);

    if (!urlStr || !key) return send(res, 400, { error: "URL and Key are required." });

    const newProvider = { id: generateId("pro"), name, url: urlStr, key, margin, exchangeRate, createdAt: nowIso() };
    auth.db.providers.push(newProvider);
    await writeDb(auth.db);
    return send(res, 201, { message: "Provider added.", provider: newProvider });
  }

  if (req.method === "PATCH" && url.pathname === "/api/admin/providers") {
    const auth = await requireAdmin(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });
    const body = await parseBody(req);
    const id = String(body.id || "");
    const provider = auth.db.providers.find(p => p.id === id);
    if (!provider) return send(res, 404, { error: "Provider not found." });

    if (body.name !== undefined) provider.name = String(body.name).trim();
    if (body.url !== undefined) provider.url = String(body.url).trim();
    if (body.key !== undefined) provider.key = String(body.key).trim();
    
    const newMargin = body.margin !== undefined ? Number(body.margin) : provider.margin;
    const newExRate = body.exchangeRate !== undefined ? Number(body.exchangeRate) : (provider.exchangeRate || 1);
    
    if (body.margin !== undefined || body.exchangeRate !== undefined) {
      provider.margin = newMargin;
      provider.exchangeRate = newExRate;
      
      // Auto-update services for THIS provider
      auth.db.services.forEach(s => {
        if (s.providerId === id) {
          const originalRate = s.originalRate || s.ratePer1000 || 0;
          s.originalRate = originalRate;
          // IMPORTANT: rate = original_api_rate * exchange_rate * margin
          const baseInInr = originalRate * newExRate;
          s.ratePer1000 = Number((baseInInr + (baseInInr * (newMargin / 100))).toFixed(4));
        }
      });
    }

    await writeDb(auth.db);
    return send(res, 200, { message: "Provider updated.", provider });
  }

  if (req.method === "DELETE" && url.pathname === "/api/admin/providers") {
    const auth = await requireAdmin(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });
    const id = String(url.searchParams.get("id") || "");
    const index = auth.db.providers.findIndex(p => p.id === id);
    if (index === -1) return send(res, 404, { error: "Provider not found." });

    auth.db.providers.splice(index, 1);
    // Optionally delete services associated with this provider
    auth.db.services = auth.db.services.filter(s => s.providerId !== id);
    
    await writeDb(auth.db);
    return send(res, 200, { message: "Provider and its services removed." });
  }


  if (req.method === "POST" && url.pathname === "/api/admin/provider/sync") {
    const auth = await requireAdmin(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });
    const body = await parseBody(req);
    const providerId = String(body.providerId || "");
    const provider = auth.db.providers.find(p => p.id === providerId);
    if (!provider) return send(res, 400, { error: "Select a valid provider to sync." });
    
    const { url: api, key, margin } = provider;
    if (!api || !key) return send(res, 400, { error: "API URL and Key are required for syncing." });
    
    try {
      const fetchUrl = `${api}?key=${key}&action=services`;
      const response = await fetch(fetchUrl);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error(data.error || "Invalid response from provider.");
      
      const currentMap = new Map((auth.db.services || []).filter(s => s.providerId === providerId).map(s => [s.id, s]));
      const otherServices = (auth.db.services || []).filter(s => s.providerId !== providerId);
      const nextServices = [];
      
      data.forEach(service => {
        const id = String(service.service);
        const originalRate = Number(service.rate || 0);
        const exRate = Number(provider.exchangeRate || 1);
        const baseInInr = originalRate * exRate;
        const augmentedRate = Number((baseInInr + (baseInInr * (margin / 100))).toFixed(4));
        const extName = String(service.name);
        const extDesc = String(service.desc || "");
        const extCat = String(service.category);
        const extMin = Number(service.min || 1);
        const extMax = Number(service.max || 1000000);
        
        const existing = currentMap.get(id);
        if (existing) {
          nextServices.push({
            ...existing,
            category: existing.category || extCat,
            name: existing.name || extName,
            originalRate: originalRate,
            ratePer1000: augmentedRate,
            min: extMin,
            max: extMax,
            desc: (existing.desc !== undefined && existing.desc !== "") ? existing.desc : extDesc
          });
        } else {
          nextServices.push({
            id,
            providerId,
            category: extCat,
            name: extName,
            originalRate: originalRate,
            ratePer1000: augmentedRate,
            min: extMin,
            max: extMax,
            desc: extDesc
          });
        }
      });
      
      auth.db.services = [...otherServices, ...nextServices];
      await writeDb(auth.db);
      return send(res, 200, { message: `Successfully synced ${nextServices.length} services for ${provider.name}!` });
    } catch (e) {
      return send(res, 500, { error: "Failed to sync: " + e.message });
    }
  }

  if (req.method === "PATCH" && url.pathname === "/api/admin/services") {
    const auth = await requireAdmin(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });
    const body = await parseBody(req);
    const id = String(body.id || "");
    const service = auth.db.services.find(s => s.id === id);
    if (!service) return send(res, 404, { error: "Service not found." });
    
    if (body.name !== undefined) service.name = String(body.name).trim();
    if (body.category !== undefined) service.category = String(body.category).trim();
    if (body.desc !== undefined) service.desc = String(body.desc).trim();
    if (body.ratePer1000 !== undefined) service.ratePer1000 = Number(body.ratePer1000);
    
    await writeDb(auth.db);
    return send(res, 200, { message: "Service updated successfully.", service });
  }

  if (req.method === "DELETE" && url.pathname === "/api/admin/services") {
    const auth = await requireAdmin(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });
    const id = String(url.searchParams.get("id") || "");
    const index = auth.db.services.findIndex(s => s.id === id);
    if (index === -1) return send(res, 404, { error: "Service not found." });
    
    auth.db.services.splice(index, 1);
    await writeDb(auth.db);
    return send(res, 200, { message: "Service deleted successfully." });
  }

  if (req.method === "PATCH" && url.pathname === "/api/admin/categories") {
    const auth = await requireAdmin(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });
    const body = await parseBody(req);
    const oldName = String(body.oldName || "").trim();
    const newName = String(body.newName || "").trim();
    
    if (!oldName || !newName) return send(res, 400, { error: "Old name and new name are required." });
    
    let updatedCount = 0;
    auth.db.services.forEach(s => {
      if (s.category === oldName) {
        s.category = newName;
        updatedCount++;
      }
    });
    
    await writeDb(auth.db);
    return send(res, 200, { message: `Successfully renamed category for ${updatedCount} services.` });
  }

  if (req.method === "DELETE" && url.pathname === "/api/admin/categories") {
    const auth = await requireAdmin(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });
    const name = String(url.searchParams.get("name") || "").trim();
    if (!name) return send(res, 400, { error: "Category name is required." });
    
    const originalLength = auth.db.services.length;
    auth.db.services = auth.db.services.filter(s => s.category !== name);
    const deletedCount = originalLength - auth.db.services.length;
    
    await writeDb(auth.db);
    return send(res, 200, { message: `Successfully deleted category and ${deletedCount} associated services.` });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/logout") {
    const token = getToken(req);
    const db = await readDb();
    cleanupDb(db);
    db.adminSessions = db.adminSessions.filter((entry) => entry.token !== token);
    await writeDb(db);
    return send(res, 200, { message: "Logged out." });
  }

  if (req.method === "GET" && url.pathname === "/api/services") {
    const db = await readDb();
    cleanupDb(db);
    await writeDb(db);
    return send(res, 200, { services: db.services });
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    const auth = await requireUser(req);
    if (!auth) {
      return send(res, 401, { error: "Unauthorized" });
    }

    return send(res, 200, { user: sanitizeUser(auth.user) });
  }

  if (req.method === "PATCH" && url.pathname === "/api/me") {
    const auth = await requireUser(req);
    if (!auth) {
      return send(res, 401, { error: "Unauthorized" });
    }

    const body = await parseBody(req);
    const name = String(body.name || auth.user.name).trim();
    const email = normalizeEmail(body.email || auth.user.email);
    const nameError = validateName(name);
    const emailError = validateEmail(email);
    if (nameError || emailError) {
      return send(res, 400, { error: nameError || emailError });
    }

    if (auth.db.users.some((entry) => entry.id !== auth.user.id && entry.email === email)) {
      return send(res, 409, { error: "Another account already uses that email." });
    }

    auth.user.name = name;
    auth.user.email = email;
    await writeDb(auth.db);
    return send(res, 200, { user: sanitizeUser(auth.user) });
  }

  if (req.method === "GET" && url.pathname === "/api/orders") {
    const auth = await requireUser(req);
    if (!auth) {
      return send(res, 401, { error: "Unauthorized" });
    }

    const orders = auth.db.orders.filter((order) => order.userId === auth.user.id);
    return send(res, 200, { orders });
  }

  if (req.method === "POST" && url.pathname === "/api/orders") {
    const auth = await requireUser(req);
    if (!auth) {
      return send(res, 401, { error: "Unauthorized" });
    }

    const body = await parseBody(req);
    const category = String(body.category || "").trim();
    const service = String(body.service || "").trim();
    const target = String(body.target || "").trim();
    const quantity = Number(body.quantity || 0);
    const ratePer1000 = Number(body.ratePer1000 || 0.42);

    if (!category || !service || !target) {
      return send(res, 400, { error: "Category, service, and target are required." });
    }

    if (!Number.isFinite(quantity) || quantity < 1) {
      return send(res, 400, { error: "Enter a valid quantity." });
    }

    const charge = Number(((quantity / 1000) * ratePer1000).toFixed(2));
    const orderNumber = auth.db.orders.length + 1;
    const order = {
      id: `DH${String(orderNumber).padStart(4, "0")}`,
      userId: auth.user.id,
      service,
      category,
      target,
      quantity,
      charge,
      status: "Pending",
      startCount: 0,
      remains: quantity,
      createdAt: nowIso()
    };

    auth.db.orders.unshift(order);
    await writeDb(auth.db);
    return send(res, 201, { order });
  }

  if (req.method === "GET" && url.pathname === "/api/tickets") {
    const auth = await requireUser(req);
    if (!auth) {
      return send(res, 401, { error: "Unauthorized" });
    }

    const tickets = auth.db.tickets.filter((ticket) => ticket.userId === auth.user.id);
    return send(res, 200, { tickets });
  }

  if (req.method === "POST" && url.pathname === "/api/tickets") {
    const auth = await requireUser(req);
    if (!auth) {
      return send(res, 401, { error: "Unauthorized" });
    }

    const body = await parseBody(req);
    const subject = String(body.subject || "").trim();
    const relatedOrder = String(body.relatedOrder || "").trim();
    const message = String(body.message || "").trim();

    if (subject.length < 3 || message.length < 10) {
      return send(res, 400, { error: "Subject and message must be properly filled." });
    }

    const ticketNumber = auth.db.tickets.length + 1;
    const ticket = {
      id: `T${String(ticketNumber).padStart(4, "0")}`,
      userId: auth.user.id,
      subject,
      relatedOrder,
      message,
      status: "Open",
      createdAt: nowIso()
    };

    auth.db.tickets.unshift(ticket);
    await writeDb(auth.db);
    return send(res, 201, { ticket });
  }

  if (req.method === "GET" && url.pathname === "/api/funds") {
    const auth = await requireUser(req);
    if (!auth) {
      return send(res, 401, { error: "Unauthorized" });
    }

    const fundRequests = auth.db.fundRequests.filter((entry) => entry.userId === auth.user.id);
    return send(res, 200, { fundRequests, balance: auth.user.balance });
  }

  if (req.method === "POST" && url.pathname === "/api/funds") {
    const auth = await requireUser(req);
    if (!auth) {
      return send(res, 401, { error: "Unauthorized" });
    }

    const body = await parseBody(req);
    const amount = Number(body.amount || 0);
    const method = String(body.method || "").trim();
    const reference = String(body.reference || "").trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      return send(res, 400, { error: "Enter a valid amount." });
    }

    if (!method || !reference) {
      return send(res, 400, { error: "Payment method and reference are required." });
    }

    const fundNumber = auth.db.fundRequests.length + 1;
    const fundRequest = {
      id: `F${String(fundNumber).padStart(4, "0")}`,
      userId: auth.user.id,
      amount,
      method,
      reference,
      status: "Pending",
      createdAt: nowIso()
    };

    auth.db.fundRequests.unshift(fundRequest);
    await writeDb(auth.db);
    return send(res, 201, { fundRequest });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = getToken(req);
    const db = await readDb();
    cleanupDb(db);
    db.sessions = db.sessions.filter((entry) => entry.token !== token);
    await writeDb(db);
    return send(res, 200, { message: "Logged out." });
  }

  return send(res, 404, { error: "API route not found." });
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") {
    pathname = "/index.html";
  }

  const safePath = path.normalize(path.join(ROOT, pathname));
  if (!safePath.startsWith(ROOT)) {
    sendText(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }

  try {
    const stats = await fsp.stat(safePath);
    const filePath = stats.isDirectory() ? path.join(safePath, "index.html") : safePath;
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME_TYPES[ext] || "application/octet-stream";
    const stream = fs.createReadStream(filePath);
    res.writeHead(200, { "Content-Type": type });
    stream.pipe(res);
  } catch {
    sendText(res, 404, "Not found", "text/plain; charset=utf-8");
  }
}

async function start() {
  // Database connection background mein start karenge taaki deployment timeout na ho
  ensureDb().then(() => {
    console.log("[Database] Connected successfully to MongoDB.");
  }).catch((err) => {
    console.error("[Database] Critical Error: Connection failed.", err.message);
    // Note: We don't exit the process here to allow the server to keep running
    // for static files even if DB is temporarily down.
  });

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);

      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, url);
        return;
      }

      await serveStatic(req, res, url);
    } catch (error) {
      console.error("[Server Error]", error.message);
      send(res, 500, { error: "Internal server error" });
    }
  });

  // 0.0.0.0 par listen karenge aur port handle karenge
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] DreamHubs active on port ${PORT}`);
    console.log(`[Server] Accessible at http://0.0.0.0:${PORT}`);
  });
}

start();

