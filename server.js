const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const { MongoClient } = require("mongodb");

// Stability handlers for production
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Fatal] Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[Fatal] Uncaught Exception:", err);
});

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const ENV_FILE = path.join(ROOT, ".env");

function loadEnvFile() {
  try {
    if (!fs.existsSync(ENV_FILE)) return;
    const raw = fs.readFileSync(ENV_FILE, "utf8");
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) return;
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key && !(key in process.env)) {
        process.env[key] = value;
      }
    });
  } catch (e) {
    console.warn("[Env] Could not load .env file:", e.message);
  }
}

loadEnvFile();
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const PORT = Number(process.env.PORT || 3000);
const FORCE_LOCAL_DB = String(process.env.FORCE_LOCAL_DB || "").toLowerCase() === "true";
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_HOURS || 168) * 60 * 60 * 1000;
const LOGIN_MAX_FAILURES = Number(process.env.LOGIN_MAX_FAILURES || 5);
const LOGIN_LOCK_MS = Number(process.env.LOGIN_LOCK_MINUTES || 60) * 60 * 1000;
const RESET_LINK_TTL_MS = Number(process.env.RESET_LINK_TTL_MINUTES || 5) * 60 * 1000;
const RESET_REQUEST_COOLDOWN_MS = Number(process.env.RESET_REQUEST_COOLDOWN_SECONDS || 60) * 1000;
const RESET_REQUEST_LIMIT = Number(process.env.RESET_REQUEST_LIMIT_PER_HOUR || 5);



const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || "dreamhubsadmin").trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeThisAdminPassword123!";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "dreamhubsadmin@dreamhubs.local").trim().toLowerCase();

const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || "").trim();
const APP_BASE_URL = String(process.env.APP_BASE_URL || `http://localhost:${PORT}`);

const SMTP_HOST = String(process.env.SMTP_HOST || "").trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = String(process.env.SMTP_USER || "").trim();
const SMTP_PASS = String(process.env.SMTP_PASS || "").trim();
const SMTP_FROM = String(process.env.SMTP_FROM || "").trim();
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";

const THEMES = {
  classic: {
    name: "Classic Cream",
    vars: {
      "--bg": "#f5f1e8", "--bg-soft": "#fffaf0", "--surface": "rgba(255, 252, 246, 0.82)", "--surface-strong": "#fffdfa",
      "--text": "#1f1d1a", "--muted": "#645d55", "--line": "rgba(59, 45, 28, 0.12)", "--accent": "#4834d4",
      "--accent-strong": "#3725b4", "--accent-soft": "rgba(72, 52, 212, 0.16)", "--shadow": "0 24px 70px rgba(74, 50, 24, 0.12)",
      "--hero-gradient": "linear-gradient(135deg, #f6efe2 0%, #f8f4ed 55%, #f1eadf 100%)"
    }
  },
  midnight: {
    name: "Midnight Purple",
    vars: {
      "--bg": "#0c0a1e", "--bg-soft": "#121029", "--surface": "rgba(20, 18, 43, 0.9)", "--surface-strong": "#181631",
      "--text": "#eceafb", "--muted": "#9692c3", "--line": "rgba(255, 255, 255, 0.1)", "--accent": "#c678ff",
      "--accent-strong": "#a65fe0", "--accent-soft": "rgba(198, 120, 255, 0.12)", "--shadow": "0 24px 70px rgba(0, 0, 0, 0.4)",
      "--hero-gradient": "linear-gradient(135deg, #0c0a1e 0%, #121029 100%)"
    }
  },
  emerald: {
    name: "Emerald Dark",
    vars: {
      "--bg": "#08100e", "--bg-soft": "#0d1a17", "--surface": "rgba(13, 26, 23, 0.9)", "--surface-strong": "#122521",
      "--text": "#e2f2ef", "--muted": "#8baca4", "--line": "rgba(255, 255, 255, 0.1)", "--accent": "#2ecc71",
      "--accent-strong": "#27ae60", "--accent-soft": "rgba(46, 204, 113, 0.12)", "--shadow": "0 24px 70px rgba(0, 0, 0, 0.45)",
      "--hero-gradient": "linear-gradient(135deg, #08100e 0%, #0d1a17 100%)"
    }
  },
  ocean: {
    name: "Deep Ocean",
    vars: {
      "--bg": "#0a1321", "--bg-soft": "#0f1c2f", "--surface": "rgba(15, 28, 47, 0.92)", "--surface-strong": "#13243d",
      "--text": "#eaf2ff", "--muted": "#90abbf", "--line": "rgba(255, 255, 255, 0.1)", "--accent": "#3498db",
      "--accent-strong": "#2980b9", "--accent-soft": "rgba(52, 152, 219, 0.12)", "--shadow": "0 24px 70px rgba(0, 0, 0, 0.4)",
      "--hero-gradient": "linear-gradient(135deg, #0a1321 0%, #0f1c2f 100%)"
    }
  },
  sunset: {
    name: "Desert Sunset",
    vars: {
      "--bg": "#1a0f0e", "--bg-soft": "#241615", "--surface": "rgba(36, 22, 21, 0.9)", "--surface-strong": "#2f1d1c",
      "--text": "#fde4e2", "--muted": "#af8c8a", "--line": "rgba(255, 255, 255, 0.1)", "--accent": "#e67e22",
      "--accent-strong": "#d35400", "--accent-soft": "rgba(230, 126, 34, 0.12)", "--shadow": "0 24px 70px rgba(0, 0, 0, 0.45)",
      "--hero-gradient": "linear-gradient(135deg, #1a0f0e 0%, #241615 100%)"
    }
  },
  minimal: {
    name: "Clean White",
    vars: {
      "--bg": "#ffffff", "--bg-soft": "#f9fafb", "--surface": "#ffffff", "--surface-strong": "#f3f4f6",
      "--text": "#111827", "--muted": "#4b5563", "--line": "rgba(0, 0, 0, 0.1)", "--accent": "#000000",
      "--accent-strong": "#1a1a1a", "--accent-soft": "rgba(0, 0, 0, 0.05)", "--shadow": "0 1px 3px rgba(0,0,0,0.1)",
      "--hero-gradient": "#ffffff"
    }
  },
  cyber: {
    name: "Cyber Neon",
    vars: {
      "--bg": "#050505", "--bg-soft": "#0f0f0f", "--surface": "rgba(15, 15, 15, 0.95)", "--surface-strong": "#1a1a1a",
      "--text": "#00ffcc", "--muted": "#00a382", "--line": "rgba(0, 255, 204, 0.2)", "--accent": "#ff007f",
      "--accent-strong": "#d6006b", "--accent-soft": "rgba(255, 0, 127, 0.1)", "--shadow": "0 0 15px rgba(255, 0, 127, 0.3)",
      "--hero-gradient": "linear-gradient(135deg, #050505 0%, #0f0f0f 100%)"
    }
  },
  obsidian: {
    name: "Total Dark",
    vars: {
      "--bg": "#000000", "--bg-soft": "#050505", "--surface": "#0a0a0a", "--surface-strong": "#111111",
      "--text": "#ffffff", "--muted": "#888888", "--line": "#222222", "--accent": "#ffffff",
      "--accent-strong": "#eeeeee", "--accent-soft": "rgba(255, 255, 255, 0.1)", "--shadow": "0 0 20px rgba(255,255,255,0.05)",
      "--hero-gradient": "#000000"
    }
  },
  emerald_glass: {
    name: "Emerald Glass",
    vars: {
      "--bg": "#f0fdf4", "--bg-soft": "#dcfce7", "--surface": "rgba(255, 255, 255, 0.9)", "--surface-strong": "#ffffff",
      "--text": "#166534", "--muted": "#3f6212", "--line": "rgba(22, 101, 52, 0.1)", "--accent": "#16a34a",
      "--accent-strong": "#15803d", "--accent-soft": "rgba(22, 163, 74, 0.1)", "--shadow": "0 4px 6px rgba(0,0,0,0.05)",
      "--hero-gradient": "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)"
    }
  },
  nordic: {
    name: "Nordic Frost",
    vars: {
      "--bg": "#f1f5f9", "--bg-soft": "#e2e8f0", "--surface": "rgba(255, 255, 255, 0.9)", "--surface-strong": "#ffffff",
      "--text": "#334155", "--muted": "#64748b", "--line": "rgba(51, 65, 85, 0.1)", "--accent": "#2563eb",
      "--accent-strong": "#1d4ed8", "--accent-soft": "rgba(37, 99, 235, 0.1)", "--shadow": "0 10px 15px rgba(0,0,0,0.05)",
      "--hero-gradient": "linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)"
    }
  },
  royal: {
    name: "Royal Navy",
    vars: {
      "--bg": "#1e3a8a", "--bg-soft": "#1e40af", "--surface": "rgba(30, 58, 138, 0.95)", "--surface-strong": "#1d4ed8",
      "--text": "#ffffff", "--muted": "#bfdbfe", "--line": "rgba(255, 255, 255, 0.15)", "--accent": "#fbbf24",
      "--accent-strong": "#f59e0b", "--accent-soft": "rgba(251, 191, 36, 0.15)", "--shadow": "0 20px 40px rgba(0,0,0,0.3)",
      "--hero-gradient": "linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)"
    }
  },
  gold_dark: {
    name: "Gold & Charcoal",
    vars: {
      "--bg": "#121212", "--bg-soft": "#1a1a1a", "--surface": "rgba(26, 26, 26, 0.95)", "--surface-strong": "#222222",
      "--text": "#f1c40f", "--muted": "#c29d0b", "--line": "rgba(241, 196, 15, 0.15)", "--accent": "#f39c12",
      "--accent-strong": "#e67e22", "--accent-soft": "rgba(243, 156, 18, 0.12)", "--shadow": "0 10px 30px rgba(0,0,0,0.5)",
      "--hero-gradient": "linear-gradient(135deg, #121212 0%, #1a1a1a 100%)"
    }
  },
  coffee: {
    name: "Rich Espresso",
    vars: {
      "--bg": "#fafaf9", "--bg-soft": "#f5f5f4", "--surface": "rgba(255, 255, 255, 0.95)", "--surface-strong": "#ffffff",
      "--text": "#44403c", "--muted": "#78716c", "--line": "rgba(68, 64, 60, 0.1)", "--accent": "#78350f",
      "--accent-strong": "#451a03", "--accent-soft": "rgba(120, 53, 15, 0.08)", "--shadow": "0 4px 6px rgba(0,0,0,0.05)",
      "--hero-gradient": "linear-gradient(135deg, #fafaf9 0%, #f5f5f4 100%)"
    }
  },
  slate_storm: {
    name: "Slate Storm",
    vars: {
      "--bg": "#0f172a", "--bg-soft": "#1e293b", "--surface": "rgba(30, 41, 59, 0.9)", "--surface-strong": "#334155",
      "--text": "#f8fafc", "--muted": "#94a3b8", "--line": "rgba(255, 255, 255, 0.1)", "--accent": "#38bdf8",
      "--accent-strong": "#0ea5e9", "--accent-soft": "rgba(56, 189, 248, 0.12)", "--shadow": "0 20px 50px rgba(0,0,0,0.3)",
      "--hero-gradient": "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)"
    }
  },
  rose: {
    name: "Rose Quartz",
    vars: {
      "--bg": "#fff1f2", "--bg-soft": "#ffe4e6", "--surface": "rgba(255, 255, 255, 0.9)", "--surface-strong": "#ffffff",
      "--text": "#9f1239", "--muted": "#be123c", "--line": "rgba(159, 18, 57, 0.1)", "--accent": "#e11d48",
      "--accent-strong": "#be123c", "--accent-soft": "rgba(225, 29, 72, 0.1)", "--shadow": "0 4px 6px rgba(0,0,0,0.05)",
      "--hero-gradient": "linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)"
    }
  },
  lavender: {
    name: "Dreamy Purple",
    vars: {
      "--bg": "#fdf4ff", "--bg-soft": "#fae8ff", "--surface": "#ffffff", "--surface-strong": "#faf5ff",
      "--text": "#701a75", "--muted": "#86198f", "--line": "rgba(112, 26, 117, 0.1)", "--accent": "#d946ef",
      "--accent-strong": "#c026d3", "--accent-soft": "rgba(217, 70, 239, 0.1)", "--shadow": "0 4px 10px rgba(0,0,0,0.05)",
      "--hero-gradient": "linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%)"
    }
  },
  solar: {
    name: "Solar Energy",
    vars: {
      "--bg": "#fffbeb", "--bg-soft": "#fef3c7", "--surface": "#ffffff", "--surface-strong": "#fffdfa",
      "--text": "#92400e", "--muted": "#b45309", "--line": "rgba(146, 64, 14, 0.1)", "--accent": "#f59e0b",
      "--accent-strong": "#d97706", "--accent-soft": "rgba(245, 158, 11, 0.1)", "--shadow": "0 4px 6px rgba(0,0,0,0.05)",
      "--hero-gradient": "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)"
    }
  },
  sepia: {
    name: "Warm Sepia",
    vars: {
      "--bg": "#fefaf3", "--bg-soft": "#fdf1e1", "--surface": "#ffffff", "--surface-strong": "#fffdfa",
      "--text": "#433422", "--muted": "#7c6a4e", "--line": "rgba(67, 52, 34, 0.1)", "--accent": "#a0522d",
      "--accent-strong": "#8b4513", "--accent-soft": "rgba(160, 82, 45, 0.1)", "--shadow": "0 4px 10px rgba(0,0,0,0.05)",
      "--hero-gradient": "linear-gradient(135deg, #fefaf3 0%, #fdf1e1 100%)"
    }
  },
  crimson: {
    name: "Crimson Night",
    vars: {
      "--bg": "#2d0a0a", "--bg-soft": "#3d1111", "--surface": "rgba(61, 17, 17, 0.95)", "--surface-strong": "#4d1d1d",
      "--text": "#ffebeb", "--muted": "#ffcccc", "--line": "rgba(255, 235, 235, 0.1)", "--accent": "#ff4d4d",
      "--accent-strong": "#b91c1c", "--accent-soft": "rgba(255, 77, 77, 0.15)", "--shadow": "0 20px 40px rgba(0,0,0,0.3)",
      "--hero-gradient": "linear-gradient(135deg, #2d0a0a 0%, #3d1111 100%)"
    }
  },
  nebula: {
    name: "Stellar Nebula",
    vars: {
      "--bg": "#020617", "--bg-soft": "#0f172a", "--surface": "rgba(15, 23, 42, 0.95)", "--surface-strong": "#1e293b",
      "--text": "#f1f5f9", "--muted": "#94a3b8", "--line": "rgba(241, 245, 249, 0.1)", "--accent": "#6366f1",
      "--accent-strong": "#4f46e5", "--accent-soft": "rgba(99, 102, 241, 0.15)", "--shadow": "0 20px 40px rgba(0,0,0,0.3)",
      "--hero-gradient": "linear-gradient(135deg, #020617 0%, #0f172a 100%)"
    }
  }
};

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

function createMailTransport() {
  let nodemailer = null;
  try { nodemailer = require("nodemailer"); } catch (e) { return null; }
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

const mailTransport = createMailTransport();
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

let cachedMongoClient = null;
let dbCollection = null;
let useLocalDb = false;

async function ensureDb() {
  if (useLocalDb || FORCE_LOCAL_DB) { useLocalDb = true; return; }
  if (dbCollection) return;
  const uri = String(process.env.MONGODB_URI || "");
  if (!uri) {
    console.warn("[Database] No MONGODB_URI provided. Switching to Local JSON Storage.");
    useLocalDb = true;
    return;
  }
  try {
    if (!cachedMongoClient) {
      // Use reasonable timeouts for production
      cachedMongoClient = new MongoClient(uri, {
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000,
      });
      await cachedMongoClient.connect();
    }
    dbCollection = cachedMongoClient.db().collection("dreamhubs_data");
    const exist = await dbCollection.findOne({ _id: "main_store" });
    if (!exist) await dbCollection.insertOne({ _id: "main_store", data: createInitialDb() });
    console.log("[Database] Connected successfully to MongoDB Production Cluster.");
  } catch (err) {
    console.error("[Database] Mongo Error:", err.message);
    if (err.message.toLowerCase().includes("auth failed") || err.message.toLowerCase().includes("bad auth")) {
      console.error("[Database] Authentication Failure: Verify your MONGODB_URI credentials on Render.");
      const passwordPart = uri.split(":")[2]?.split("@")[0];
      if (passwordPart && (passwordPart.includes("@") || passwordPart.includes(":") || passwordPart.includes("/") || passwordPart.includes("?"))) {
        console.error("[Database] Tip: Your password contains special characters. You MUST URL-encode them (e.g., @ becomes %40).");
      }
    }
    console.warn("[Database] CRITICAL: Falling back to Local JSON Storage. DATA WILL BE LOST ON RENDER RESTARTS.");
    useLocalDb = true;
  }
}

function createInitialDb() {
  return {
    users: [], sessions: [], adminSessions: [], orders: [], tickets: [], fundRequests: [],
    passwordResetTokens: [], emailVerificationTokens: [], loginFailures: [], resetRequests: [],
    services: [], providers: [], popularCategories: [],
    settings: { activeTheme: "classic" }
  };
}

async function readDb() {
  if (useLocalDb) {
    try {
      if (!fs.existsSync(DB_FILE)) {
        const initial = createInitialDb();
        await fsp.writeFile(DB_FILE, JSON.stringify(initial, null, 2));
        return normalizeDb(initial);
      }
      return normalizeDb(JSON.parse(await fsp.readFile(DB_FILE, "utf-8")));
    } catch (e) { return normalizeDb(createInitialDb()); }
  }
  try {
    const doc = await dbCollection.findOne({ _id: "main_store" });
    return normalizeDb(doc && doc.data ? doc.data : createInitialDb());
  } catch (e) { useLocalDb = true; return readDb(); }
}

async function writeDb(db) {
  if (useLocalDb) {
    try { await fsp.writeFile(DB_FILE, JSON.stringify(db, null, 2)); } catch (e) {}
    return;
  }
  try { await dbCollection.replaceOne({ _id: "main_store" }, { _id: "main_store", data: db }, { upsert: true }); } catch (e) { useLocalDb = true; await writeDb(db); }
}

function normalizeDb(db) {
  return {
    ...db,
    users: (db.users || []).map(u => ({
      ...u,
      balance: Number(u.balance || 0),
      isEmailVerified: true
    })),
    services: db.services || [],
    popularCategories: db.popularCategories || []
  };
}

function send(res, status, payload, headers = {}) {
  const isBuffer = Buffer.isBuffer(payload);
  const body = isBuffer ? payload : JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": isBuffer ? "application/octet-stream" : "application/json; charset=utf-8", ...headers });
  res.end(body);
}

function sendText(res, status, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(text);
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new Error("Invalid JSON"); }
}

function normalizeEmail(email) { return String(email || "").trim().toLowerCase(); }
function generateId(prefix) { return `${prefix}_${crypto.randomBytes(6).toString("hex")}`; }
function generateToken(size = 24) { return crypto.randomBytes(size).toString("hex"); }
function hashPassword(pass, salt = crypto.randomBytes(16).toString("hex")) {
  return `${salt}:${crypto.scryptSync(pass, salt, 64).toString("hex")}`;
}
function hashToken(t) { return crypto.createHash("sha256").update(String(t || "")).digest("hex"); }
function verifyPassword(pass, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), crypto.scryptSync(pass, salt, 64));
}

function sanitizeUser(u) {
  return { id: u.id, name: u.name, username: u.username, email: u.email, balance: u.balance, isEmailVerified: true, provider: u.provider, createdAt: u.createdAt };
}
function sanitizeAdmin() { return { username: ADMIN_USERNAME, email: ADMIN_EMAIL, role: "admin" }; }

function getToken(req) {
  const auth = req.headers["authorization"] || "";
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return req.headers["x-admin-token"] || null;
}

function getClientIp(req) {
  const f = req.headers["x-forwarded-for"];
  return (typeof f === "string" ? f.split(",")[0].trim() : req.socket.remoteAddress) || "unknown";
}

function nowIso() { return new Date().toISOString(); }
function cleanupDb(db) {
  const now = Date.now();
  db.sessions = (db.sessions || []).filter(s => now - new Date(s.createdAt).getTime() <= SESSION_TTL_MS);
  db.adminSessions = (db.adminSessions || []).filter(s => now - new Date(s.createdAt).getTime() <= SESSION_TTL_MS);
  db.passwordResetTokens = (db.passwordResetTokens || []).filter(t => !t.usedAt && new Date(t.expiresAt).getTime() > now);
}

async function requireUser(req) {
  const token = getToken(req);
  if (!token) return null;
  const db = await readDb();
  cleanupDb(db);
  const session = db.sessions.find(s => s.token === token);
  if (!session) { await writeDb(db); return null; }
  const user = db.users.find(u => u.id === session.userId);
  if (!user) { db.sessions = db.sessions.filter(s => s.token !== token); await writeDb(db); return null; }
  await writeDb(db);
  return { db, user, token };
}

async function requireAdmin(req) {
  const token = getToken(req);
  if (!token) return null;
  const db = await readDb();
  cleanupDb(db);
  const session = db.adminSessions.find(s => s.token === token);
  if (!session) { await writeDb(db); return null; }
  await writeDb(db);
  return { db, admin: sanitizeAdmin(), token };
}

function deriveUsername(name, users) {
  const base = String(name || "user").split("@")[0].toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 14) || "user";
  let username = base, count = 1;
  while (users.some(u => u.username === username)) username = `${base}${++count}`;
  return username;
}

const validateEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(e)) ? "" : "Invalid email.";
const validatePassword = (p) => String(p || "").length >= 8 ? "" : "Password min 8 chars.";
const validateName = (n) => String(n || "").trim().length >= 2 ? "" : "Name min 2 chars.";

function createSession(db, userId) {
  const token = generateToken(24);
  db.sessions.push({ token, userId, createdAt: nowIso() });
  return token;
}

function createAdminSession(db) {
  const token = generateToken(24);
  db.adminSessions.push({ token, createdAt: nowIso() });
  return token;
}

function getLoginFailureRecord(db, id, ip) {
  const key = `${id.toLowerCase()}|${ip}`;
  let r = db.loginFailures.find(f => f.key === key);
  if (!r) { r = { key, identifier: id.toLowerCase(), ip, count: 0, lockedUntil: null, lastAttemptAt: nowIso() }; db.loginFailures.push(r); }
  return r;
}

function buildAdminStats(db) {
  return {
    users: db.users.length, orders: db.orders.length,
    tickets: db.tickets.filter(t => t.status === "Open").length,
    fundRequests: db.fundRequests.filter(f => f.status === "Pending").length,
    services: db.services.length,
    totalSpend: Number(db.orders.reduce((s, o) => s + Number(o.charge || 0), 0).toFixed(2)),
    totalBalance: Number(db.users.reduce((s, u) => s + Number(u.balance || 0), 0).toFixed(2))
  };
}

function withUserStats(db, user) {
  const orders = db.orders.filter(o => o.userId === user.id);
  const spend = orders.filter(o => !["Cancelled", "Refunded", "Failed"].includes(o.status)).reduce((s, o) => s + Number(o.charge || 0), 0);
  const funds = db.fundRequests.filter(f => f.userId === user.id && f.status === "Approved").reduce((s, f) => s + Number(f.amount || 0), 0);
  return { ...sanitizeUser(user), totalSpend: Number(spend.toFixed(2)), totalFundsAdded: Number(funds.toFixed(2)), totalOrders: orders.length, completedOrders: orders.filter(o => o.status === "Completed").length };
}



async function callProvider(prov, action, params = {}) {
  const url = new URL(prov.url);
  const search = new URLSearchParams({ key: prov.key, action, ...params });
  // Most SMM APIs accept both GET and POST with query params or form data.
  // Using POST for safety with API keys.
  try {
    const response = await fetch(`${url.origin}${url.pathname}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: search.toString()
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data;
  } catch (err) {
    console.error(`[API] Provider ${prov.name} error:`, err.message);
    throw err;
  }
}

async function handleApi(req, res, url) {
  // CORS (Simple)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return send(res, 204, null);

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await parseBody(req);
    const db = await readDb();
    const email = normalizeEmail(body.email);
    const err = validateEmail(email) || validatePassword(body.password) || validateName(body.name);
    if (err) return send(res, 400, { error: err });
    if (db.users.some(u => u.email === email)) return send(res, 409, { error: "Email exists." });

    const user = { id: generateId("usr"), name: body.name, username: deriveUsername(body.username || body.name, db.users), email, passwordHash: hashPassword(body.password), balance: 0, isEmailVerified: true, signupIp: getClientIp(req), provider: "email", createdAt: nowIso() };
    db.users.push(user);

    const session = createSession(db, user.id);
    await writeDb(db);
    return send(res, 201, { token: session, user: withUserStats(db, user) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await parseBody(req);
    const db = await readDb();
    const identifier = String(body.emailOrUsername || "").trim().toLowerCase();
    const ip = getClientIp(req);
    const r = getLoginFailureRecord(db, identifier, ip);
    if (r.lockedUntil && new Date(r.lockedUntil) > new Date()) return send(res, 429, { error: "Locked." });

    const user = db.users.find(u => u.email === identifier || u.username.toLowerCase() === identifier);
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      r.count++;
      if (r.count >= LOGIN_MAX_FAILURES) r.lockedUntil = new Date(Date.now() + LOGIN_LOCK_MS).toISOString();
      await writeDb(db);
      return send(res, 401, { error: "Invalid credentials." });
    }
    r.count = 0; r.lockedUntil = null;
    const token = createSession(db, user.id);
    await writeDb(db);
    return send(res, 200, { token, user: withUserStats(db, user) });
  }



  if (req.method === "GET" && url.pathname === "/api/auth/google-config") {
    if (!GOOGLE_CLIENT_ID) {
      return send(res, 503, { error: "Google login is not configured on server." });
    }
    return send(res, 200, { clientId: GOOGLE_CLIENT_ID });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/google") {
    const { credential } = await parseBody(req);
    if (!GOOGLE_CLIENT_ID || !googleClient) {
      return send(res, 503, { error: "Google login is not configured on server." });
    }
    if (!credential) {
      return send(res, 400, { error: "Google credential is missing." });
    }
    try {
      const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();
      const email = normalizeEmail(payload.email);
      const db = await readDb();
      let user = db.users.find(u => u.email === email);
      if (!user) {
        user = { id: generateId("usr"), name: payload.name, username: deriveUsername(email, db.users), email, balance: 0, isEmailVerified: true, provider: "google", createdAt: nowIso() };
        db.users.push(user);
      } else { user.isEmailVerified = true; }
      const token = createSession(db, user.id);
      await writeDb(db);
      return send(res, 200, { token, user: withUserStats(db, user) });
    } catch (e) {
      console.error("[Google Auth] verifyIdToken failed:", e.message);
      return send(res, 400, { error: "Google verification failed. Check server GOOGLE_CLIENT_ID." });
    }
  }

  if (url.pathname === "/api/me") {
    const auth = await requireUser(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });
    if (req.method === "PATCH") {
      const body = await parseBody(req);
      if (body.name) auth.user.name = String(body.name).trim();
      if (body.email) {
        const next = normalizeEmail(body.email);
        const err = validateEmail(next);
        if (err) return send(res, 400, { error: err });
        if (next !== auth.user.email && auth.db.users.some(u => u.email === next)) return send(res, 409, { error: "Email exists." });
        auth.user.email = next;
      }
      await writeDb(auth.db);
      return send(res, 200, { user: withUserStats(auth.db, auth.user) });
    }
    return send(res, 200, { user: withUserStats(auth.db, auth.user) });
  }

  if (url.pathname === "/api/services") {
    const db = await readDb();
    return send(res, 200, { services: db.services || [] });
  }

  if (req.method === "GET" && url.pathname === "/api/popular-categories") {
    const db = await readDb();
    const allCats = [...new Set((db.services || []).map(s => s.category))];
    return send(res, 200, { 
      popularCategories: db.popularCategories || [],
      allCategories: allCats
    });
  }

  if (req.method === "POST" && url.pathname === "/api/orders") {
    const auth = await requireUser(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });
    const body = await parseBody(req);
    const service = auth.db.services.find(s => (body.serviceId && s.id === body.serviceId) || (s.name === body.service && s.category === body.category));
    if (!service) return send(res, 404, { error: "Service not found." });
    
    const quantity = Number(body.quantity);
    if (quantity < service.min || quantity > service.max) return send(res, 400, { error: `Quantity must be ${service.min}-${service.max}` });
    const charge = Number(((quantity / 1000) * service.ratePer1000).toFixed(2));
    if (auth.user.balance < charge) return send(res, 400, { error: "Insufficient balance." });

    // Deduct balance first (safety)
    auth.user.balance = Number((auth.user.balance - charge).toFixed(2));
    
    const order = { id: generateId("ord"), userId: auth.user.id, serviceId: service.id, target: body.target, quantity, charge, status: "Pending", createdAt: nowIso() };
    
    // Forward to Provider if applicable
    if (service.providerId) {
      const prov = auth.db.providers.find(p => p.id === service.providerId);
      if (prov) {
        try {
          const result = await callProvider(prov, "add", { service: service.originalId, link: body.target, quantity });
          if (result && result.order) {
            order.externalOrderId = String(result.order);
            order.providerName = prov.name;
          }
        } catch (err) {
          console.error("[Order] Provider forward failed:", err.message);
          // We still keep the order but mark it as failure/pending for admin review
          order.status = "Failed";
          order.error = `Provider Error: ${err.message}`;
        }
      }
    }
    
    auth.db.orders.unshift(order);
    await writeDb(auth.db);
    return send(res, 201, { order, balance: auth.user.balance });
  }

  if (req.method === "GET" && url.pathname === "/api/orders") {
    const auth = await requireUser(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });
    const orders = auth.db.orders.filter(o => o.userId === auth.user.id);
    return send(res, 200, { orders });
  }





  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = getToken(req);
    if (token) {
      const db = await readDb();
      db.sessions = db.sessions.filter(s => s.token !== token);
      db.adminSessions = db.adminSessions.filter(s => s.token !== token);
      await writeDb(db);
    }
    return send(res, 200, { message: "Logged out." });
  }

  if (url.pathname === "/api/tickets") {
    const auth = await requireUser(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });
    if (req.method === "POST") {
      const body = await parseBody(req);
      const ticket = { id: generateId("tk"), userId: auth.user.id, subject: body.subject, relatedOrder: body.relatedOrder, message: body.message, status: "Open", replies: [], createdAt: nowIso() };
      auth.db.tickets.unshift(ticket);
      await writeDb(auth.db);
      return send(res, 201, { ticket });
    }
    return send(res, 200, { tickets: auth.db.tickets.filter(t => t.userId === auth.user.id) });
  }

  if (url.pathname === "/api/funds") {
    const auth = await requireUser(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });
    if (req.method === "POST") {
      const body = await parseBody(req);
      const request = { id: generateId("fund"), userId: auth.user.id, amount: Number(body.amount), method: body.method, reference: body.reference, status: "Pending", createdAt: nowIso() };
      auth.db.fundRequests.unshift(request);
      await writeDb(auth.db);
      return send(res, 201, { request });
    }
    return send(res, 200, { fundRequests: auth.db.fundRequests.filter(f => f.userId === auth.user.id), balance: auth.user.balance });
  }

  // Admin routes
  if (req.method === "POST" && url.pathname === "/api/admin/login") {
    const body = await parseBody(req);
    const user = String(body.identifier || body.username || "").trim().toLowerCase();
    const pass = String(body.password || "");

    if (user === ADMIN_USERNAME && pass === ADMIN_PASSWORD) {
      const db = await readDb();
      const token = createAdminSession(db);
      await writeDb(db);
      return send(res, 200, { token, admin: sanitizeAdmin() });
    }
    return send(res, 401, { error: "Invalid admin credentials." });
  }

  if (url.pathname.startsWith("/api/admin")) {
    const auth = await requireAdmin(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });

    if (url.pathname === "/api/admin/dashboard") {
      const stats = buildAdminStats(auth.db);
      const orders = auth.db.orders.slice(0, 50);
      const tickets = auth.db.tickets.filter(t => t.status !== "Closed");
      const users = auth.db.users.map(u => withUserStats(auth.db, u));
      const fundRequests = auth.db.fundRequests;
      const providers = auth.db.providers || [];
      const services = auth.db.services || [];
      
      return send(res, 200, { admin: auth.admin, stats, orders, tickets, users, fundRequests, providers, services });
    }

    if (url.pathname === "/api/admin/stats") return send(res, 200, buildAdminStats(auth.db));
    if (url.pathname === "/api/admin/users") {
      if (req.method === "DELETE") {
        const id = url.searchParams.get("id");
        auth.db.users = auth.db.users.filter(u => u.id !== id);
        auth.db.sessions = auth.db.sessions.filter(s => s.userId !== id);
        await writeDb(auth.db);
        return send(res, 200, { message: "User deleted." });
      }
      return send(res, 200, { users: auth.db.users.map(u => withUserStats(auth.db, u)) });
    }

    if (req.method === "PATCH" && url.pathname === "/api/admin/users/fund") {
      const { userId, balance } = await parseBody(req);
      const user = auth.db.users.find(u => u.id === userId);
      if (!user) return send(res, 404, { error: "User not found." });
      user.balance = Number(balance);
      await writeDb(auth.db);
      return send(res, 200, { message: "Balance updated." });
    }

    if (req.method === "GET" && url.pathname === "/api/admin/providers") return send(res, 200, { providers: auth.db.providers || [] });
    if (req.method === "POST" && url.pathname === "/api/admin/providers") {
      const body = await parseBody(req);
      const prov = { id: generateId("prov"), ...body, createdAt: nowIso() };
      auth.db.providers.push(prov);
      await writeDb(auth.db);
      return send(res, 201, { provider: prov });
    }
    if (req.method === "PATCH" && url.pathname === "/api/admin/providers") {
      const body = await parseBody(req);
      const prov = auth.db.providers.find(p => p.id === body.id);
      if (!prov) return send(res, 404, { error: "Provider not found." });
      Object.assign(prov, body);
      await writeDb(auth.db);
      return send(res, 200, { message: "Provider updated." });
    }
    if (req.method === "DELETE" && url.pathname === "/api/admin/providers") {
      const id = url.searchParams.get("id");
      auth.db.providers = auth.db.providers.filter(p => p.id !== id);
      auth.db.services = auth.db.services.filter(s => s.providerId !== id);
      await writeDb(auth.db);
      return send(res, 200, { message: "Provider and its services removed." });
    }

    if (url.pathname === "/api/admin/services") {
      if (req.method === "PATCH") {
        const body = await parseBody(req);
        const svc = auth.db.services.find(s => s.id === body.id);
        if (!svc) return send(res, 404, { error: "Service not found." });
        Object.assign(svc, body);
        await writeDb(auth.db);
        return send(res, 200, { message: "Service updated." });
      }
      if (req.method === "DELETE") {
        const id = url.searchParams.get("id");
        auth.db.services = auth.db.services.filter(s => s.id !== id);
        await writeDb(auth.db);
        return send(res, 200, { message: "Service deleted." });
      }
    }

    if (req.method === "DELETE" && url.pathname === "/api/admin/services/all") {
      auth.db.services = [];
      await writeDb(auth.db);
      return send(res, 200, { message: "All services deleted." });
    }

    if (req.method === "PATCH" && url.pathname === "/api/admin/categories") {
      const { oldName, newName } = await parseBody(req);
      auth.db.services.forEach(s => { if (s.category === oldName) s.category = newName; });
      await writeDb(auth.db);
      return send(res, 200, { message: "Category renamed." });
    }

    if (req.method === "DELETE" && url.pathname === "/api/admin/categories") {
      const name = url.searchParams.get("name");
      auth.db.services = auth.db.services.filter(s => s.category !== name);
      await writeDb(auth.db);
      return send(res, 200, { message: "Category deleted." });
    }

    if (req.method === "POST" && url.pathname === "/api/admin/provider/sync") {
      const { providerId } = await parseBody(req);
      const prov = auth.db.providers.find(p => p.id === providerId);
      if (!prov) return send(res, 404, { error: "Provider not found." });
      
      try {
        const services = await callProvider(prov, "services");
        if (!Array.isArray(services)) throw new Error("Invalid services response format.");
        
        // To avoid HUGE DB growth, we filter existing services for this provider
        auth.db.services = auth.db.services.filter(s => s.providerId !== providerId);
        
        services.forEach(s => {
          const rate = Number(s.rate || 0);
          const finalRate = Number(((rate * (prov.exchangeRate || 1)) * (1 + (prov.margin || 0) / 100)).toFixed(4));
          auth.db.services.push({
            id: generateId("svc"),
            originalId: String(s.service),
            name: s.name,
            category: s.category,
            ratePer1000: finalRate,
            originalRate: rate,
            min: Number(s.min || 10),
            max: Number(s.max || 10000),
            desc: s.type || "",
            providerId: prov.id,
            createdAt: nowIso()
          });
        });
        
        await writeDb(auth.db);
        return send(res, 200, { message: `Successfully synced ${services.length} services from ${prov.name}!` });
      } catch (err) {
        return send(res, 500, { error: `Provider Sync Failed: ${err.message}` });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/admin/funds/action") {
      const { id, action, amount } = await parseBody(req);
      const request = auth.db.fundRequests.find(f => f.id === id);
      if (!request) return send(res, 404, { error: "Request not found." });
      if (request.status !== "Pending") return send(res, 400, { error: "Already processed." });
      
      if (action === "approve") {
        const user = auth.db.users.find(u => u.id === request.userId);
        if (user) {
          user.balance = Number((user.balance + (amount || request.amount)).toFixed(2));
          request.status = "Approved";
          if (amount) request.amount = amount;
        }
      } else {
        request.status = "Rejected";
      }
      await writeDb(auth.db);
      return send(res, 200, { message: `Request ${action}d.` });
    }

    if (req.method === "DELETE" && url.pathname === "/api/admin/funds") {
      const id = url.searchParams.get("id");
      auth.db.fundRequests = auth.db.fundRequests.filter(f => f.id !== id);
      await writeDb(auth.db);
      return send(res, 200, { message: "Fund request deleted." });
    }

    if (req.method === "POST" && url.pathname === "/api/admin/tickets/reply") {
      const { id, message } = await parseBody(req);
      const ticket = auth.db.tickets.find(t => t.id === id);
      if (!ticket) return send(res, 404, { error: "Ticket not found." });
      ticket.replies.push({ from: "Admin", message, createdAt: nowIso() });
      ticket.status = "Answered";
      await writeDb(auth.db);
      return send(res, 200, { message: "Reply sent." });
    }

    if (req.method === "PATCH" && url.pathname === "/api/admin/tickets/status") {
      const { id, status } = await parseBody(req);
      const ticket = auth.db.tickets.find(t => t.id === id);
      if (!ticket) return send(res, 404, { error: "Ticket not found." });
      ticket.status = status;
      await writeDb(auth.db);
      return send(res, 200, { message: "Status updated." });
    }

    if (req.method === "PATCH" && url.pathname === "/api/admin/popular-categories") {
      const { categories } = await parseBody(req);
      auth.db.popularCategories = categories;
      await writeDb(auth.db);
      return send(res, 200, { message: "Popular categories updated." });
    }

    if (req.method === "PATCH" && url.pathname === "/api/admin/appearance") {
      const { themeId } = await parseBody(req);
      if (!THEMES[themeId]) return send(res, 400, { error: "Invalid theme." });
      auth.db.settings.activeTheme = themeId;
      await writeDb(auth.db);
      return send(res, 200, { message: "Theme updated." });
    }



    if (req.method === "POST" && url.pathname === "/api/admin/orders/sync-status") {
      const pending = auth.db.orders.filter(o => o.externalOrderId && !["Completed", "Cancelled", "Refunded", "Failed"].includes(o.status));
      if (!pending.length) return send(res, 200, { message: "No pending provider-linked orders to sync." });
      
      let syncedCount = 0;
      const providers = auth.db.providers || [];
      
      for (const prov of providers) {
        const provOrders = pending.filter(o => {
          const svc = auth.db.services.find(s => s.id === o.serviceId);
          return svc && svc.providerId === prov.id;
        });
        
        if (!provOrders.length) continue;
        
        try {
          const ids = provOrders.map(o => o.externalOrderId).join(",");
          const statuses = await callProvider(prov, "status", { orders: ids });
          
          Object.entries(statuses).forEach(([extId, s]) => {
            const order = provOrders.find(o => o.externalOrderId === extId);
            if (order && s.status) {
              const oldStatus = order.status;
              // Clean up status string (e.g. "In progress" -> "In Progress")
              let finalStatus = s.status;
              if (finalStatus === "In progress") finalStatus = "In Progress";
              
              order.status = finalStatus;
              order.remains = s.remains;
              order.startCount = s.start_count;
              
              if (oldStatus !== order.status) {
                syncedCount++;
              }
            }
          });
        } catch (e) {
          console.error(`[Sync Status] Failed for ${prov.name}:`, e.message);
        }
      }
      
      await writeDb(auth.db);
      return send(res, 200, { message: `Checked ${pending.length} orders. Updated ${syncedCount} status changes!` });
    }
  }

  if (url.pathname === "/api/appearance") {
    const db = await readDb();
    const act = db.settings?.activeTheme || "classic";
    return send(res, 200, { active: act, theme: THEMES[act].vars, themes: Object.keys(THEMES).map(k => ({ id: k, name: THEMES[k].name })) });
  }

  return send(res, 404, { error: "Not found." });
}

async function serverHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  await ensureDb();
  if (url.pathname.startsWith("/api/")) return handleApi(req, res, url);
  
  let p = path.join(ROOT, url.pathname === "/" ? "index.html" : url.pathname);
  try {
    const s = await fsp.stat(p);
    const f = s.isDirectory() ? path.join(p, "index.html") : p;
    res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(f)] || "text/plain" });
    fs.createReadStream(f).pipe(res);
  } catch (e) { sendText(res, 404, "Not found"); }
}

if (process.env.VERCEL || process.env.AWS_LAMBDA) {
  module.exports = serverHandler;
} else {
  http.createServer(serverHandler).listen(PORT, () => console.log(`[Server] Port ${PORT}`));
}
