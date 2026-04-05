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
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const PORT = Number(process.env.PORT || 3000);
const FORCE_LOCAL_DB = String(process.env.FORCE_LOCAL_DB || "").toLowerCase() === "true";
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_HOURS || 168) * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = Number(process.env.RESET_LINK_TTL_MINUTES || 5) * 60 * 1000;
const LOGIN_MAX_FAILURES = Number(process.env.LOGIN_MAX_FAILURES || 5);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeThisAdminPassword123!";
const REFERRAL_COMMISSION_RATE = Number(process.env.REFERRAL_COMMISSION_RATE || 0.1);
const REFERRAL_MIN_PAYOUT = Number(process.env.REFERRAL_MIN_PAYOUT || 500);
const REFERRAL_PAYOUT_DAY = String(process.env.REFERRAL_PAYOUT_DAY || "Sunday");
const REFERRAL_PAYOUT_TIMEZONE = String(process.env.REFERRAL_PAYOUT_TIMEZONE || "Asia/Kolkata");

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

const LOGIN_LOCK_MS = Number(process.env.LOGIN_LOCK_MINUTES || 60) * 60 * 1000;
const RESET_REQUEST_COOLDOWN_MS = Number(process.env.RESET_REQUEST_COOLDOWN_SECONDS || 60) * 1000;
const RESET_REQUEST_LIMIT = Number(process.env.RESET_REQUEST_LIMIT_PER_HOUR || 5);
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || "dreamhubsadmin").trim().toLowerCase();
const ADMIN_EMAIL = normalizeEmail(process.env.ADMIN_EMAIL || "dreamhubsadmin@dreamhubs.local");
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

// [Optimization] Global Connection Caching for Vercel/Serverless
let cachedMongoClient = null;
let dbCollection = null;
let useLocalDb = false;

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
  if (useLocalDb || FORCE_LOCAL_DB) {
    useLocalDb = true;
    return;
  }

  if (dbCollection) return; // Pooled connection already exists

  const uri = String(process.env.MONGODB_URI || "");
  if (!uri) {
    useLocalDb = true;
    return;
  }

  try {
    if (!cachedMongoClient) {
      cachedMongoClient = new MongoClient(uri);
      await cachedMongoClient.connect();
    }
    const database = cachedMongoClient.db();
    dbCollection = database.collection("dreamhubs_data");

    // Initialize if needed
    const exist = await dbCollection.findOne({ _id: "main_store" });
    if (!exist) {
      await dbCollection.insertOne({ _id: "main_store", data: createInitialDb() });
    }
  } catch (err) {
    console.error("[Database] Mongo Connection Error:", err.message);
    useLocalDb = true;
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
    providers: [],
    popularCategories: [],
    referralVisits: [],
    referralCommissions: [],
    referralPayouts: [],
    referralSettings: {
      commissionRate: REFERRAL_COMMISSION_RATE,
      minPayout: REFERRAL_MIN_PAYOUT,
      payoutDay: REFERRAL_PAYOUT_DAY,
      payoutTimezone: REFERRAL_PAYOUT_TIMEZONE,
      payoutMode: "weekly",
      firstClick: true,
      lifetime: true,
      selfReferralAllowed: false
    },
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
      const raw = await fsp.readFile(DB_FILE, "utf-8");
      return normalizeDb(JSON.parse(raw));
    } catch (e) {
      console.error("[Local DB] Error reading:", e.message);
      return normalizeDb(createInitialDb());
    }
  }

  try {
    const doc = await dbCollection.findOne({ _id: "main_store" });
    const parsed = doc && doc.data ? doc.data : createInitialDb();
    return normalizeDb(parsed);
  } catch (e) {
    console.error("[MongoDB] Connection lost, switching to local DB.");
    useLocalDb = true;
    return readDb();
  }
}

async function writeDb(db) {
  if (useLocalDb) {
    try {
      await fsp.writeFile(DB_FILE, JSON.stringify(db, null, 2));
      return;
    } catch (e) {
      console.error("[Local DB] Error writing:", e.message);
      return;
    }
  }

  try {
    await dbCollection.replaceOne({ _id: "main_store" }, { _id: "main_store", data: db }, { upsert: true });
  } catch (e) {
    console.error("[MongoDB] Write failed, switching to local DB.");
    useLocalDb = true;
    await writeDb(db);
  }
}

function normalizeDb(db) {
  return {
    users: Array.isArray(db.users)
      ? db.users.map((user) => ({
          ...user,
          balance: Number(user.balance || 0),
          referralCode: String(user.referralCode || "").trim().toUpperCase(),
          referredByUserId: user.referredByUserId || null
        }))
      : [],
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
          : []),
    popularCategories: Array.isArray(db.popularCategories) ? db.popularCategories : [],
    referralVisits: Array.isArray(db.referralVisits) ? db.referralVisits : [],
    referralCommissions: Array.isArray(db.referralCommissions) ? db.referralCommissions : [],
    referralPayouts: Array.isArray(db.referralPayouts) ? db.referralPayouts : [],
    referralSettings: {
      commissionRate: Number(db.referralSettings?.commissionRate ?? REFERRAL_COMMISSION_RATE),
      minPayout: Number(db.referralSettings?.minPayout ?? REFERRAL_MIN_PAYOUT),
      payoutDay: String(db.referralSettings?.payoutDay || REFERRAL_PAYOUT_DAY),
      payoutTimezone: String(db.referralSettings?.payoutTimezone || REFERRAL_PAYOUT_TIMEZONE),
      payoutMode: "weekly",
      firstClick: true,
      lifetime: true,
      selfReferralAllowed: false
    },
    settings: (db.settings && typeof db.settings === "object") ? db.settings : { activeTheme: "classic" }
  };
}

// NOTE: writeDb is defined above (line ~369) â€” duplicate removed.

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
    referralCode: user.referralCode || "",
    referredByUserId: user.referredByUserId || null,
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
  const totalSpend = db.orders.reduce((sum, order) => sum + Number(order.charge || 0), 0);
  const totalBalance = db.users.reduce((sum, user) => sum + Number(user.balance || 0), 0);
  return {
    users: db.users.length,
    orders: db.orders.length,
    tickets: openTickets,
    fundRequests: pendingFunds,
    services: db.services.length,
    totalSpend: Number(totalSpend.toFixed(2)),
    totalBalance: Number(totalBalance.toFixed(2))
  };
}

function getUserTotalSpend(db, userId) {
  return Number(
    db.orders
      .filter((order) => order.userId === userId && !["Cancelled", "Refunded", "Failed"].includes(order.status))
      .reduce((sum, order) => sum + Number(order.charge || 0), 0)
      .toFixed(2)
  );
}

function getUserTotalFundsAdded(db, userId) {
  return Number(
    db.fundRequests
      .filter((entry) => entry.userId === userId && entry.status === "Approved")
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
      .toFixed(2)
  );
}

function getUserOrderCounts(db, userId) {
  const userOrders = db.orders.filter((order) => order.userId === userId);
  const completed = userOrders.filter((order) => order.status === "Completed").length;
  return { total: userOrders.length, completed };
}

function withUserStats(db, user) {
  const spend = getUserTotalSpend(db, user.id);
  const funds = getUserTotalFundsAdded(db, user.id);
  const counts = getUserOrderCounts(db, user.id);
  return {
    ...sanitizeUser(user),
    totalSpend: spend,
    totalFundsAdded: funds,
    totalOrders: counts.total,
    completedOrders: counts.completed
  };
}

function generateReferralCode(db, user) {
  const rawBase = String(user.username || user.email || user.id || "DH")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 6) || "DHUSER";
  let code = `${rawBase}${Math.floor(1000 + Math.random() * 9000)}`;
  const existing = new Set((db.users || []).map((entry) => String(entry.referralCode || "").toUpperCase()));
  while (existing.has(code)) {
    code = `${rawBase}${Math.floor(1000 + Math.random() * 9000)}`;
  }
  return code;
}

function ensureUserReferralCode(db, user) {
  if (!user.referralCode) {
    user.referralCode = generateReferralCode(db, user);
  }
}

function normalizeOrderStatus(status, fallback = "Pending") {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return fallback;
  const map = {
    pending: "Pending",
    inprogress: "Processing",
    "in progress": "Processing",
    processing: "Processing",
    progress: "Processing",
    completed: "Completed",
    complete: "Completed",
    partial: "Partial",
    partially: "Partial",
    canceled: "Cancelled",
    cancelled: "Cancelled",
    refunded: "Refunded",
    failed: "Failed"
  };
  return map[normalized] || fallback;
}

function isFinalOrderStatus(status) {
  return ["Completed", "Partial", "Cancelled", "Refunded", "Failed"].includes(String(status || ""));
}

function parseProviderStatusResponse(payload) {
  const status = normalizeOrderStatus(
    payload?.status || payload?.order_status || payload?.state || payload?.data?.status || ""
  );
  const remainsRaw = payload?.remains ?? payload?.remain ?? payload?.data?.remains;
  const startRaw = payload?.start_count ?? payload?.startCount ?? payload?.data?.start_count;
  const remains = Number(remainsRaw);
  const startCount = Number(startRaw);
  return {
    status,
    remains: Number.isFinite(remains) ? remains : null,
    startCount: Number.isFinite(startCount) ? startCount : null
  };
}

function getReferralSettings(db) {
  return db.referralSettings || {
    commissionRate: REFERRAL_COMMISSION_RATE,
    minPayout: REFERRAL_MIN_PAYOUT,
    payoutDay: REFERRAL_PAYOUT_DAY,
    payoutTimezone: REFERRAL_PAYOUT_TIMEZONE,
    payoutMode: "weekly",
    firstClick: true,
    lifetime: true,
    selfReferralAllowed: false
  };
}

function updateReferralForOrder(db, order, prevStatus, nextStatus) {
  const referredUser = db.users.find((user) => user.id === order.userId);
  if (!referredUser || !referredUser.referredByUserId) return;
  const referrer = db.users.find((user) => user.id === referredUser.referredByUserId);
  if (!referrer) return;
  const settings = getReferralSettings(db);
  const existing = db.referralCommissions.find((item) => item.orderId === order.id);

  if (nextStatus === "Completed" && prevStatus !== "Completed" && !existing) {
    const fraudBlocked =
      referrer.id === referredUser.id ||
      (referredUser.signupIp && referrer.signupIp && referredUser.signupIp === referrer.signupIp);
    db.referralCommissions.push({
      id: generateId("refc"),
      referrerUserId: referrer.id,
      referredUserId: referredUser.id,
      orderId: order.id,
      amount: Number((Number(order.charge || 0) * Number(settings.commissionRate || REFERRAL_COMMISSION_RATE)).toFixed(2)),
      rate: Number(settings.commissionRate || REFERRAL_COMMISSION_RATE),
      orderCharge: Number(order.charge || 0),
      status: fraudBlocked ? "Blocked" : "Approved",
      reason: fraudBlocked ? "Suspicious self-referral or shared-signup signal" : "Completed order commission",
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
    return;
  }

  if (["Cancelled", "Refunded", "Failed"].includes(nextStatus) && existing && !["Reversed", "Blocked"].includes(existing.status)) {
    existing.status = "Reversed";
    existing.reason = `Auto-reversed because order became ${nextStatus}`;
    existing.updatedAt = nowIso();
  }
}

function buildReferralStatsForUser(db, userId) {
  const settings = getReferralSettings(db);
  const visits = db.referralVisits.filter((item) => item.referrerUserId === userId);
  const registrations = db.users.filter((user) => user.referredByUserId === userId);
  const commissions = db.referralCommissions.filter((item) => item.referrerUserId === userId);
  const approved = commissions.filter((item) => item.status === "Approved");
  const paid = commissions.filter((item) => item.status === "Paid");
  const lifetime = commissions.filter((item) => ["Approved", "Paid"].includes(item.status));
  const conversionRate = visits.length ? (registrations.length / visits.length) * 100 : 0;
  const totals = {
    visits: visits.length,
    registrations: registrations.length,
    conversionRate: Number(conversionRate.toFixed(2)),
    approvedEarnings: Number(approved.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2)),
    paidEarnings: Number(paid.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2)),
    lifetimeEarnings: Number(lifetime.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2)),
    minPayout: Number(settings.minPayout || REFERRAL_MIN_PAYOUT)
  };
  return { totals, commissions };
}

function processWeeklyReferralPayouts(db, { byAdmin = "system" } = {}) {
  const settings = getReferralSettings(db);
  const minPayout = Number(settings.minPayout || REFERRAL_MIN_PAYOUT);
  const created = [];

  db.users.forEach((user) => {
    const pending = db.referralCommissions.filter((item) => item.referrerUserId === user.id && item.status === "Approved");
    const amount = Number(pending.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2));
    if (amount < minPayout) return;

    const payout = {
      id: generateId("refp"),
      referrerUserId: user.id,
      amount,
      status: "Paid",
      mode: "Weekly",
      weekDay: settings.payoutDay || REFERRAL_PAYOUT_DAY,
      timezone: settings.payoutTimezone || REFERRAL_PAYOUT_TIMEZONE,
      createdAt: nowIso(),
      paidAt: nowIso(),
      processedBy: byAdmin
    };
    db.referralPayouts.push(payout);
    pending.forEach((entry) => {
      entry.status = "Paid";
      entry.updatedAt = nowIso();
      entry.payoutId = payout.id;
    });
    created.push(payout);
  });

  return created;
}

async function refreshOrdersFromProviders(db, options = {}) {
  const maxOrders = Number(options.maxOrders || 50);
  const userId = options.userId || null;
  const candidates = db.orders
    .filter((order) => order.providerOrderId && order.providerId && !isFinalOrderStatus(order.status))
    .filter((order) => (userId ? order.userId === userId : true))
    .slice(0, maxOrders);

  let updates = 0;
  for (const order of candidates) {
    const provider = db.providers.find((item) => item.id === order.providerId);
    if (!provider || !provider.url || !provider.key) continue;

    try {
      const body = new URLSearchParams({
        key: provider.key,
        action: "status",
        order: String(order.providerOrderId)
      });
      const response = await fetch(provider.url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString()
      });
      const payload = await response.json();
      const parsed = parseProviderStatusResponse(payload);
      const previous = order.status || "Pending";
      let changed = false;

      if (parsed.status && parsed.status !== previous) {
        order.status = parsed.status;
        changed = true;
      }
      if (parsed.remains !== null && Number(order.remains) !== parsed.remains) {
        order.remains = parsed.remains;
        changed = true;
      }
      if (parsed.startCount !== null && Number(order.startCount) !== parsed.startCount) {
        order.startCount = parsed.startCount;
        changed = true;
      }

      if (changed) {
        order.lastSyncedAt = nowIso();
        updateReferralForOrder(db, order, previous, order.status);
        updates += 1;
      }
    } catch {
      // Ignore provider sync errors for now and keep last known status.
    }
  }

  return updates;
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
    const referralCode = String(body.referralCode || "").trim().toUpperCase();
    const ip = getClientIp(req);

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
    const referrer = referralCode
      ? db.users.find((entry) => String(entry.referralCode || "").toUpperCase() === referralCode)
      : null;

    const user = {
      id: generateId("usr"),
      name,
      username,
      email,
      passwordHash: hashPassword(password),
      balance: 0,
      referralCode: "",
      referredByUserId: referrer ? referrer.id : null,
      signupIp: ip,
      provider: "email",
      createdAt: nowIso()
    };
    ensureUserReferralCode(db, user);

    db.users.push(user);

    if (referrer) {
      const firstTouch = db.referralVisits.find(
        (entry) => entry.code === referralCode && !entry.convertedUserId
      );
      if (firstTouch) {
        firstTouch.convertedUserId = user.id;
        firstTouch.updatedAt = nowIso();
      }
    }

    const token = createSession(db, user.id);
    await writeDb(db);
    return send(res, 201, { token, user: withUserStats(db, user) });
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
    ensureUserReferralCode(db, user);
    const token = createSession(db, user.id);
    await writeDb(db);
    return send(res, 200, { token, user: withUserStats(db, user) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/google") {
    const body = await parseBody(req);
    const db = await readDb();
    cleanupDb(db);
    const credential = String(body.credential || "");
    const referralCode = String(body.referralCode || "").trim().toUpperCase();
    const ip = getClientIp(req);

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
      const referrer = referralCode
        ? db.users.find((entry) => String(entry.referralCode || "").toUpperCase() === referralCode)
        : null;
      user = {
        id: generateId("usr"),
        name,
        username: deriveUsername(name || email, db.users),
        email,
        googleSub,
        passwordHash: "",
        balance: 0,
        referralCode: "",
        referredByUserId: referrer ? referrer.id : null,
        signupIp: ip,
        provider: "google",
        createdAt: nowIso()
      };
      ensureUserReferralCode(db, user);
      db.users.push(user);
    } else {
      user.googleSub = googleSub;
      user.provider = "google";
      if (!user.username) {
        user.username = deriveUsername(name || email, db.users);
      }
      ensureUserReferralCode(db, user);
    }

    const token = createSession(db, user.id);
    await writeDb(db);
    return send(res, 200, { token, user: withUserStats(db, user) });
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

    await refreshOrdersFromProviders(auth.db, { maxOrders: 120 });
    auth.db.users.forEach((user) => ensureUserReferralCode(auth.db, user));
    await writeDb(auth.db);

    const usersWithStats = auth.db.users.map((user) => withUserStats(auth.db, user));
    const ordersWithProvider = auth.db.orders.map((order) => {
      const provider = auth.db.providers.find((item) => item.id === order.providerId);
      return {
        ...order,
        providerName: provider ? provider.name : "Manual"
      };
    });
    const referralOverview = {
      totalCommissions: Number(
        auth.db.referralCommissions.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2)
      ),
      pendingCommissions: Number(
        auth.db.referralCommissions
          .filter((item) => item.status === "Approved")
          .reduce((sum, item) => sum + Number(item.amount || 0), 0)
          .toFixed(2)
      ),
      totalPayouts: Number(
        auth.db.referralPayouts.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2)
      )
    };

    return send(res, 200, {
      admin: auth.admin,
      stats: buildAdminStats(auth.db),
      users: usersWithStats,
      orders: ordersWithProvider,
      tickets: auth.db.tickets,
      fundRequests: auth.db.fundRequests,
      services: auth.db.services,
      providers: auth.db.providers,
      referralOverview
    });
  }

  if (req.method === "PATCH" && url.pathname === "/api/admin/users/fund") {
    const auth = await requireAdmin(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });

    const body = await parseBody(req);
    const userId = String(body.userId || "").trim();
    const balance = Number(body.balance);

    if (!userId) return send(res, 400, { error: "User ID is required." });
    if (!Number.isFinite(balance) || balance < 0) {
      return send(res, 400, { error: "Balance must be a valid number (0 or more)." });
    }

    const user = auth.db.users.find((entry) => entry.id === userId);
    if (!user) return send(res, 404, { error: "User not found." });

    user.balance = Number(balance.toFixed(2));
    await writeDb(auth.db);
    return send(res, 200, { message: "User fund updated successfully.", user: sanitizeUser(user) });
  }

  if (req.method === "DELETE" && url.pathname === "/api/admin/users") {
    const auth = await requireAdmin(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });

    const userId = String(url.searchParams.get("id") || "").trim();
    if (!userId) return send(res, 400, { error: "User ID is required." });

    const userIndex = auth.db.users.findIndex((entry) => entry.id === userId);
    if (userIndex === -1) return send(res, 404, { error: "User not found." });

    auth.db.users.splice(userIndex, 1);
    auth.db.sessions = auth.db.sessions.filter((entry) => entry.userId !== userId);
    auth.db.passwordResetTokens = auth.db.passwordResetTokens.filter((entry) => entry.userId !== userId);
    auth.db.fundRequests = auth.db.fundRequests.filter((entry) => entry.userId !== userId);
    auth.db.orders = auth.db.orders.filter((entry) => entry.userId !== userId);
    auth.db.tickets = auth.db.tickets.filter((entry) => entry.userId !== userId);
    auth.db.referralVisits = auth.db.referralVisits.filter((entry) => entry.referrerUserId !== userId && entry.convertedUserId !== userId);
    auth.db.referralCommissions = auth.db.referralCommissions.filter(
      (entry) => entry.referrerUserId !== userId && entry.referredUserId !== userId
    );
    auth.db.referralPayouts = auth.db.referralPayouts.filter((entry) => entry.referrerUserId !== userId);
    auth.db.users.forEach((entry) => {
      if (entry.referredByUserId === userId) {
        entry.referredByUserId = null;
      }
    });

    await writeDb(auth.db);
    return send(res, 200, { message: "User deleted successfully." });
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
          // Use originalRate if exists, otherwise fallback to current ratePer1000
          const baseRate = (s.originalRate !== undefined && s.originalRate !== null) ? s.originalRate : s.ratePer1000;
          
          // Save the baseRate back to originalRate if it wasn't there to prevent compounding in future
          if (s.originalRate === undefined || s.originalRate === null) s.originalRate = baseRate;
          
          // Recalculate: rate = original_api_rate * exchange_rate * (1 + margin/100)
          const baseInInr = baseRate * newExRate;
          const marginedPrice = baseInInr + (baseInInr * (newMargin / 100));
          s.ratePer1000 = Number(marginedPrice.toFixed(4));
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
    const provider = auth.db.providers.find((p) => p.id === providerId);
    if (!provider) return send(res, 400, { error: "Select a valid provider to sync." });

    const { url: api, key, margin } = provider;
    if (!api || !key) return send(res, 400, { error: "API URL and Key are required for syncing." });

    try {
      const fetchUrl = `${api}?key=${key}&action=services`;
      const response = await fetch(fetchUrl);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error(data.error || "Invalid response from provider.");

      const currentMap = new Map(
        (auth.db.services || []).filter((s) => s.providerId === providerId).map((s) => [s.id, s])
      );
      const otherServices = (auth.db.services || []).filter((s) => s.providerId !== providerId);
      const nextServices = [];

      const exRate = Number(provider.exchangeRate || 1);

      data.forEach((service) => {
        const providerServiceId = String(service.service);
        const internalId = `${providerId}_${providerServiceId}`;
        const originalRate = Number(service.rate || 0);
        const baseInInr = originalRate * exRate;
        const augmentedRate = Number((baseInInr + (baseInInr * (margin / 100))).toFixed(4));
        const extName = String(service.name || "");
        const extDesc = String(service.desc || "");
        const extCat = String(service.category || "Other");
        const extMin = Number(service.min || 1);
        const extMax = Number(service.max || 1000000);

        const existing = currentMap.get(providerServiceId) || currentMap.get(internalId);
        const customDesc = String(existing?.customDesc || "").trim();

        nextServices.push({
          ...(existing || {}),
          id: internalId,
          providerServiceId,
          providerId,
          category: (existing?.category || extCat).trim(),
          name: (existing?.name || extName).trim(),
          originalRate,
          ratePer1000: augmentedRate,
          min: extMin,
          max: extMax,
          providerDesc: extDesc,
          customDesc,
          desc: customDesc || extDesc
        });
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
    const service = auth.db.services.find((s) => s.id === id);
    if (!service) return send(res, 404, { error: "Service not found." });

    if (body.name !== undefined) service.name = String(body.name).trim();
    if (body.category !== undefined) service.category = String(body.category).trim();
    if (body.desc !== undefined) {
      service.customDesc = String(body.desc).trim();
      service.desc = service.customDesc;
    }

    if (body.ratePer1000 !== undefined) {
      const newRate = Number(body.ratePer1000);
      service.ratePer1000 = newRate;

      const provider = auth.db.providers.find((p) => p.id === service.providerId);
      if (provider) {
        const margin = Number(provider.margin || 0);
        const exRate = Number(provider.exchangeRate || 1);
        service.originalRate = Number((newRate / (exRate * (1 + (margin / 100)))).toFixed(4));
      } else {
        service.originalRate = newRate;
      }
    }

    await writeDb(auth.db);
    return send(res, 200, { message: "Service updated successfully.", service });
  }
  if (req.method === "DELETE" && url.pathname === "/api/admin/services/all") {
    const auth = await requireAdmin(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });
    auth.db.services = [];
    await writeDb(auth.db);
    return send(res, 200, { message: "All services deleted successfully. You can now re-sync providers." });
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

  if (req.method === "POST" && url.pathname === "/api/admin/funds/action") {
    const auth = await requireAdmin(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });
    const body = await parseBody(req);
    const { id, action } = body; // action: 'approve' or 'reject'
    const newAmount = body.amount !== undefined ? Number(body.amount) : null;
    
    const fundRequest = auth.db.fundRequests.find(f => f.id === id);
    if (!fundRequest) return send(res, 404, { error: "Fund request not found." });
    if (fundRequest.status !== "Pending") return send(res, 400, { error: "Request is already processed." });
    
    const user = auth.db.users.find(u => u.id === fundRequest.userId);
    if (!user) return send(res, 404, { error: "User not found." });
    
    if (action === "approve") {
      const finalAmount = newAmount !== null ? newAmount : Number(fundRequest.amount);
      fundRequest.status = "Approved";
      fundRequest.amount = finalAmount; // Update the record with the final approved amount
      user.balance = (Number(user.balance) || 0) + finalAmount;
      
      // Sending Email Notification
      const transport = createMailTransport();
      if (transport) {
        try {
          await transport.sendMail({
            from: SMTP_FROM,
            to: user.email,
            subject: "Funds Added Successfully - DreamHubs",
            html: `
              <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #4834d4;">Funds Added!</h2>
                <p>Hello <strong>${user.name}</strong>,</p>
                <p>Your payment request of <strong>â‚¹${fundRequest.amount}</strong> has been approved.</p>
                <p>Your new balance is now available in your dashboard.</p>
                <p>Thank you for choosing DreamHubs!</p>
              </div>
            `
          });
          console.log(`[Funds] Approval email sent to ${user.email}`);
        } catch (e) {
          console.error("[Funds] Email failed:", e.message);
        }
      }
    } else {
      fundRequest.status = "Rejected";
    }
    
    await writeDb(auth.db);
    return send(res, 200, { message: `Request ${action}d successfully.`, balance: user.balance });
  }

  if (req.method === "DELETE" && url.pathname === "/api/admin/funds") {
    const auth = await requireAdmin(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });
    const id = String(url.searchParams.get("id") || "");
    
    const index = auth.db.fundRequests.findIndex(f => f.id === id);
    if (index === -1) return send(res, 404, { error: "Fund request not found." });
    
    auth.db.fundRequests.splice(index, 1);
    await writeDb(auth.db);
    return send(res, 200, { message: "Fund request deleted successfully." });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/tickets/reply") {
    const auth = await requireAdmin(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });
    const body = await parseBody(req);
    const { id, message } = body;
    
    const ticket = auth.db.tickets.find(t => t.id === id);
    if (!ticket) return send(res, 404, { error: "Ticket not found." });
    
    const user = auth.db.users.find(u => u.id === ticket.userId);
    if (!user) return send(res, 404, { error: "User not found." });
    
    if (!ticket.replies) ticket.replies = [];
    ticket.replies.push({
      from: "Admin",
      message,
      createdAt: nowIso()
    });
    ticket.status = "Answered";
    
    // Email alert
    const transport = createMailTransport();
    if (transport) {
      try {
        await transport.sendMail({
          from: SMTP_FROM,
          to: user.email,
          subject: `Re: ${ticket.subject} - Support Ticket Answered`,
          html: `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
              <h2 style="color: #4834d4;">Support Answered</h2>
              <p>Hello <strong>${user.name}</strong>,</p>
              <p>The support team has replied to your ticket <strong>#${ticket.id}</strong>.</p>
              <div style="background: #f9f9f9; padding: 15px; border-left: 4px solid #4834d4; margin: 15px 0;">
                <em>"${message}"</em>
              </div>
              <p>You can view the full conversation in your dashboard.</p>
              <p>Thank you for choosing DreamHubs!</p>
            </div>
          `
        });
      } catch (e) {
        console.error("[Tickets] Email failed:", e.message);
      }
    }
    
    await writeDb(auth.db);
    return send(res, 200, { message: "Reply sent successfully." });
  }

  if (req.method === "PATCH" && url.pathname === "/api/admin/tickets/status") {
    const auth = await requireAdmin(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });
    const body = await parseBody(req);
    const { id, status } = body;
    
    const ticket = auth.db.tickets.find(t => t.id === id);
    if (!ticket) return send(res, 404, { error: "Ticket not found." });
    
    ticket.status = status;
    await writeDb(auth.db);
    return send(res, 200, { message: `Ticket marked as ${status}.` });
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

  if (req.method === "POST" && url.pathname === "/api/referral/visit") {
    const db = await readDb();
    cleanupDb(db);
    const body = await parseBody(req);
    const code = String(body.code || "").trim().toUpperCase();
    if (!code) {
      return send(res, 400, { error: "Referral code is required." });
    }

    const referrer = db.users.find((entry) => String(entry.referralCode || "").toUpperCase() === code);
    if (!referrer) {
      return send(res, 404, { error: "Referral code not found." });
    }

    db.referralVisits.push({
      id: generateId("refv"),
      code,
      referrerUserId: referrer.id,
      ip: getClientIp(req),
      userAgent: String(req.headers["user-agent"] || "").slice(0, 256),
      createdAt: nowIso(),
      convertedUserId: null
    });
    await writeDb(db);
    return send(res, 200, { message: "Referral tracked.", code });
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    const auth = await requireUser(req);
    if (!auth) {
      return send(res, 401, { error: "Unauthorized" });
    }

    ensureUserReferralCode(auth.db, auth.user);
    await writeDb(auth.db);
    return send(res, 200, { user: withUserStats(auth.db, auth.user) });
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
    return send(res, 200, { user: withUserStats(auth.db, auth.user) });
  }

  if (req.method === "GET" && url.pathname === "/api/orders") {
    const auth = await requireUser(req);
    if (!auth) {
      return send(res, 401, { error: "Unauthorized" });
    }

    if (url.searchParams.get("sync") === "1") {
      await refreshOrdersFromProviders(auth.db, { userId: auth.user.id, maxOrders: 40 });
      await writeDb(auth.db);
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

    // ðŸ” Find the service record from DB
    const svcRecord = auth.db.services.find(s => s.name === service && s.category === category);

    // âœ… Validate min/max from the actual service record
    if (svcRecord) {
      if (svcRecord.min && quantity < svcRecord.min) {
        return send(res, 400, { error: `Minimum order quantity is ${svcRecord.min}.` });
      }
      if (svcRecord.max && quantity > svcRecord.max) {
        return send(res, 400, { error: `Maximum order quantity is ${svcRecord.max}.` });
      }
    }

    const charge = Number(((quantity / 1000) * ratePer1000).toFixed(2));

    // âœ… Check user has enough balance
    const currentBalance = Number(auth.user.balance) || 0;
    if (currentBalance < charge) {
      return send(res, 400, { error: `Insufficient balance. Required: â‚¹${charge}, Available: â‚¹${currentBalance.toFixed(2)}` });
    }

    // âœ… Deduct balance immediately (will refund if provider fails)
    auth.user.balance = Number((currentBalance - charge).toFixed(2));

    let providerOrderId = null;
    let finalStatus = "Pending";
    let providerIdStored = null;

    // âœ… Forward to API provider if service has a provider linked
    if (svcRecord && svcRecord.providerId) {
      const provider = auth.db.providers.find(p => p.id === svcRecord.providerId);
      if (provider && provider.url && provider.key) {
        providerIdStored = provider.id;
        try {
          // âœ… Use providerServiceId (provider's numeric ID like "1234")
          // Falls back to svcRecord.id for backward compatibility
          const providerServiceId = svcRecord.providerServiceId || svcRecord.id;
          console.log(`[Order] Forwarding to provider. Service ID: ${providerServiceId}, Qty: ${quantity}, Link: ${target}`);

          const providerBody = new URLSearchParams({
            key: provider.key,
            action: "add",
            service: providerServiceId,   // â† provider's numeric service ID
            link: target,
            quantity: String(quantity)
          });

          const providerResp = await fetch(provider.url, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: providerBody.toString()
          });

          const providerData = await providerResp.json();

          if (providerData && providerData.order) {
            providerOrderId = String(providerData.order);
            finalStatus = "Processing";
            console.log(`[Order] âœ… Provider accepted. Provider Order ID: ${providerOrderId}`);
          } else {
            // âŒ Provider returned error â€” REFUND balance
            auth.user.balance = Number((auth.user.balance + charge).toFixed(2));
            const providerError = providerData?.error || "Provider rejected the order.";
            console.error(`[Order] âŒ Provider error: ${providerError}`);
            await writeDb(auth.db);
            return send(res, 400, { error: `Order failed: ${providerError}` });
          }
        } catch (provErr) {
          // âŒ Network error â€” REFUND balance
          auth.user.balance = Number((auth.user.balance + charge).toFixed(2));
          console.error(`[Order] âŒ Provider API unreachable: ${provErr.message}`);
          await writeDb(auth.db);
          return send(res, 500, { error: "Could not reach provider. Your balance was not deducted. Please try again." });
        }
      } else {
        // Provider config missing â€” save as Pending, admin will handle
        console.warn(`[Order] âš ï¸ Provider config missing for service: ${service}. Saving as Pending.`);
      }
    } else {
      // No provider linked â€” manual fulfillment by admin
      console.log(`[Order] â„¹ï¸ No provider linked for service: ${service}. Saved as Pending for manual fulfillment.`);
    }

    const orderNumber = auth.db.orders.length + 1;
    const order = {
      id: `DH${String(orderNumber).padStart(4, "0")}`,
      userId: auth.user.id,
      service,
      category,
      target,
      quantity,
      charge,
      status: finalStatus,
      providerOrderId,
      providerId: providerIdStored,
      startCount: 0,
      remains: quantity,
      createdAt: nowIso()
    };

    auth.db.orders.unshift(order);
    updateReferralForOrder(auth.db, order, "Pending", order.status);
    await writeDb(auth.db);
    return send(res, 201, { order, balance: auth.user.balance });
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

  if (req.method === "GET" && url.pathname === "/api/referrals/me") {
    const auth = await requireUser(req);
    if (!auth) {
      return send(res, 401, { error: "Unauthorized" });
    }
    ensureUserReferralCode(auth.db, auth.user);
    const stats = buildReferralStatsForUser(auth.db, auth.user.id);
    const referralLink = `${APP_BASE_URL}/register.html?ref=${encodeURIComponent(auth.user.referralCode)}`;
    const payouts = auth.db.referralPayouts
      .filter((entry) => entry.referrerUserId === auth.user.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    await writeDb(auth.db);
    return send(res, 200, {
      referralCode: auth.user.referralCode,
      referralLink,
      policy: getReferralSettings(auth.db),
      stats: stats.totals,
      commissions: stats.commissions,
      payouts
    });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/orders/sync-status") {
    const auth = await requireAdmin(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });
    const updated = await refreshOrdersFromProviders(auth.db, { maxOrders: 250 });
    await writeDb(auth.db);
    return send(res, 200, { message: `Synced ${updated} orders from provider APIs.`, updated });
  }

  if (req.method === "GET" && url.pathname === "/api/admin/referrals") {
    const auth = await requireAdmin(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });

    const users = auth.db.users.map((user) => {
      const summary = buildReferralStatsForUser(auth.db, user.id).totals;
      return {
        ...withUserStats(auth.db, user),
        referral: summary
      };
    });

    return send(res, 200, {
      policy: getReferralSettings(auth.db),
      users,
      payouts: auth.db.referralPayouts
    });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/referrals/payouts/process") {
    const auth = await requireAdmin(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });
    const created = processWeeklyReferralPayouts(auth.db, { byAdmin: auth.admin.username || "admin" });
    await writeDb(auth.db);
    return send(res, 200, { message: `Processed ${created.length} weekly payouts.`, payouts: created });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = getToken(req);
    const db = await readDb();
    cleanupDb(db);
    db.sessions = db.sessions.filter((entry) => entry.token !== token);
    await writeDb(db);
    return send(res, 200, { message: "Logged out." });
  }

  if (req.method === "GET" && url.pathname === "/api/appearance") {
    const db = await readDb();
    const active = db.settings?.activeTheme || "classic";
    const theme = THEMES[active] || THEMES.classic;
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return send(res, 200, { active, theme: theme.vars, themes: Object.keys(THEMES).map(k => ({ id: k, name: THEMES[k].name })) });
  }

  if (req.method === "PATCH" && url.pathname === "/api/admin/appearance") {
    const auth = await requireAdmin(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });
    const body = await parseBody(req);
    const { themeId } = body;
    if (!THEMES[themeId]) return send(res, 400, { error: "Invalid theme ID." });
    
    if (!auth.db.settings) auth.db.settings = {};
    auth.db.settings.activeTheme = themeId;
    await writeDb(auth.db);
    return send(res, 200, { message: "Theme updated globally." });
  }

  if (req.method === "GET" && url.pathname === "/api/popular-categories") {
    const db = await readDb();
    const allCategories = [...new Set((db.services || []).map(s => s.category))];
    return send(res, 200, {
      popularCategories: db.popularCategories || [],
      allCategories
    });
  }

  if (req.method === "PATCH" && url.pathname === "/api/admin/popular-categories") {
    const auth = await requireAdmin(req);
    if (!auth) return send(res, 401, { error: "Unauthorized" });
    const body = await parseBody(req);
    const categories = Array.isArray(body.categories) ? body.categories : [];
    auth.db.popularCategories = categories;
    await writeDb(auth.db);
    return send(res, 200, { message: `Popular categories updated (${categories.length} selected).` });
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

async function serverHandler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    
    // Ensure DB is ready for every request (uses pooled connection)
    await ensureDb();

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(req, res, url);
  } catch (error) {
    console.error("[Server Error]", error.message);
    send(res, 500, { error: "Internal server error" });
  }
}

// [Optimization] Export for Vercel Serverless
if (process.env.VERCEL || process.env.AWS_LAMBDA) {
  module.exports = serverHandler;
} else {
  // [Standard] Run as a regular server for Render, Docker, or Local
  const start = async () => {
    const server = http.createServer(serverHandler);
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`[Server] DreamHubs active on port ${PORT}`);
      console.log(`[Server] Persistent Connection Caching Enabled.`);
    });
  };
  start();
}



