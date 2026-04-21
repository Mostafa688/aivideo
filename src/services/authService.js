import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'erivion.db');
const JWT_SECRET = process.env.JWT_SECRET || 'erivion_secret_2026';

import { mkdirSync } from 'fs';
mkdirSync(path.join(process.cwd(), 'data'), { recursive: true });

const db = new Database(DB_PATH);

export const PLANS = {
  free: {
    name: 'Free', price_monthly: 0, price_yearly: 0, credits_weekly: 1600, videos_weekly: 3,
    max_duration: '30s', watermark: true, captions: true, music: true, transitions: true,
    sound_effects: false, video_effects: false, edit_after_render: false, languages: ['en', 'ar'], all_languages: false,
  },
  pro: {
    name: 'Pro', price_monthly: 50, price_first_month: 25, price_yearly: 360, credits_weekly: 10000, videos_weekly: 5,
    max_duration: '2min', watermark: false, captions: true, music: true, transitions: true,
    sound_effects: false, video_effects: false, edit_after_render: true, languages: ['en', 'ar', 'de', 'fr'], all_languages: false,
  },
  plus: {
    name: 'Plus', price_monthly: 100, price_first_month: 75, price_yearly: 840, credits_weekly: 45000, videos_weekly: 8,
    max_duration: '5min', watermark: false, captions: true, music: true, transitions: true,
    sound_effects: true, video_effects: false, edit_after_render: true, languages: null, all_languages: true,
  },
  max: {
    name: 'Max', price_monthly: 250, price_first_month: 150, price_yearly: 1440, credits_weekly: 100000, videos_weekly: null,
    max_duration: '10min', watermark: false, captions: true, music: true, transitions: true,
    sound_effects: true, video_effects: true, edit_after_render: true, languages: null, all_languages: true,
  },
};

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT,
    verified INTEGER DEFAULT 0,
    plan TEXT DEFAULT 'free',
    plan_billing TEXT DEFAULT 'monthly',
    plan_expires_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS verification_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    title TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS user_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    credits_used INTEGER DEFAULT 0,
    videos_this_week INTEGER DEFAULT 0,
    last_reset TEXT DEFAULT (date('now')),
    week_reset TEXT DEFAULT (date('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS payment_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    user_email TEXT NOT NULL,
    plan TEXT NOT NULL,
    billing TEXT NOT NULL,
    amount INTEGER NOT NULL,
    screenshot_path TEXT,
    screenshot_data TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!userCols.includes('plan'))            db.exec("ALTER TABLE users ADD COLUMN plan TEXT");
if (!userCols.includes('plan_billing'))    db.exec("ALTER TABLE users ADD COLUMN plan_billing TEXT");
if (!userCols.includes('plan_expires_at')) db.exec("ALTER TABLE users ADD COLUMN plan_expires_at TEXT");
if (!userCols.includes('name'))            db.exec("ALTER TABLE users ADD COLUMN name TEXT");
if (!userCols.includes('google_id'))       db.exec("ALTER TABLE users ADD COLUMN google_id TEXT");
if (!userCols.includes('avatar'))          db.exec("ALTER TABLE users ADD COLUMN avatar TEXT");

const usageCols = db.prepare("PRAGMA table_info(user_usage)").all().map(c => c.name);
if (!usageCols.includes('videos_this_week')) db.exec("ALTER TABLE user_usage ADD COLUMN videos_this_week INTEGER");
if (!usageCols.includes('week_reset'))       db.exec("ALTER TABLE user_usage ADD COLUMN week_reset TEXT");
if (!usageCols.includes('credits_used'))     db.exec("ALTER TABLE user_usage ADD COLUMN credits_used INTEGER");

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = (day + 1) % 7;
  const sat = new Date(now);
  sat.setDate(now.getDate() - diff);
  return sat.toISOString().split('T')[0];
}

// ✅ Check if paid plan expired → revert to free automatically
function checkPlanExpiry(userId) {
  const user = db.prepare('SELECT plan, plan_expires_at FROM users WHERE id = ?').get(userId);
  if (!user || user.plan === 'free' || !user.plan_expires_at) return;
  const now = new Date();
  const expires = new Date(user.plan_expires_at);
  if (now > expires) {
    db.prepare("UPDATE users SET plan = 'free', plan_billing = 'monthly', plan_expires_at = NULL WHERE id = ?").run(userId);
    console.log(`[Plan] User ${userId} plan expired → reverted to free`);
  }
}

function checkAndResetUsage(userId) {
  // ✅ Check plan expiry first
  checkPlanExpiry(userId);

  const weekStart = getWeekStart();
  let row = db.prepare('SELECT * FROM user_usage WHERE user_id = ?').get(userId);
  if (!row) {
    db.prepare('INSERT INTO user_usage (user_id, credits_used, videos_this_week, last_reset, week_reset) VALUES (?, 0, 0, ?, ?)').run(userId, weekStart, weekStart);
    return { credits_used: 0, videos_this_week: 0 };
  }
  if (row.week_reset !== weekStart) {
    db.prepare('UPDATE user_usage SET credits_used = 0, videos_this_week = 0, week_reset = ?, last_reset = ? WHERE user_id = ?').run(weekStart, weekStart, userId);
    return { credits_used: 0, videos_this_week: 0 };
  }
  return { credits_used: row.credits_used || 0, videos_this_week: row.videos_this_week || 0 };
}

export function getUserById(userId) {
  return db.prepare('SELECT id, email, name, avatar, plan, plan_billing, plan_expires_at, verified, created_at FROM users WHERE id = ?').get(userId);
}

export function getUserCredits(userId) {
  const user = getUserById(userId);
  const plan = PLANS[user?.plan || 'free'];
  const { credits_used, videos_this_week } = checkAndResetUsage(userId);
  const weeklyLimit = plan.credits_weekly;
  const remaining = Math.max(0, weeklyLimit - credits_used);
  return {
    used: credits_used, remaining, limit: weeklyLimit,
    percentage: Math.round((credits_used / weeklyLimit) * 100),
    videos_this_week, videos_limit: plan.videos_weekly,
    plan: user?.plan || 'free', plan_data: plan,
  };
}

export function addUserTokens(userId, tokensUsed) {
  checkAndResetUsage(userId);
  db.prepare('UPDATE user_usage SET credits_used = credits_used + ? WHERE user_id = ?').run(tokensUsed, userId);
}

export function incrementVideoCount(userId) {
  checkAndResetUsage(userId);
  db.prepare('UPDATE user_usage SET videos_this_week = videos_this_week + 1 WHERE user_id = ?').run(userId);
}

export function canUserRender(userId) {
  const user = getUserById(userId);
  const plan = PLANS[user?.plan || 'free'];
  const { credits_used, videos_this_week } = checkAndResetUsage(userId);
  if (credits_used >= plan.credits_weekly) return { allowed: false, reason: 'credits_exhausted' };
  if (plan.videos_weekly !== null && videos_this_week >= plan.videos_weekly) return { allowed: false, reason: 'videos_limit_reached' };
  return { allowed: true };
}

async function sendVerificationEmail(email, code) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
  await transporter.sendMail({
    from: '"Erivion" <' + process.env.EMAIL_USER + '>',
    to: email,
    subject: 'Your Erivion verification code',
    html: `<div style="font-family:sans-serif;max-width:400px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:12px"><h2 style="color:#7c6af7">Erivion</h2><p>Your verification code is:</p><div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#7c6af7;margin:24px 0">${code}</div><p style="color:#888;font-size:13px">This code expires in 10 minutes.</p></div>`,
  });
}

export async function sendPaymentRequestEmail(paymentData) {
  const { userEmail, plan, billing, amount, screenshotBase64 } = paymentData;
  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } });
  const planData = PLANS[plan];
  const billingLabel = billing === 'yearly' ? 'Yearly' : 'Monthly';
  const attachments = [];
  if (screenshotBase64) {
    const base64Data = screenshotBase64.replace(/^data:image\/\w+;base64,/, '');
    const ext = screenshotBase64.includes('png') ? 'png' : 'jpg';
    attachments.push({ filename: `payment_${userEmail}_${Date.now()}.${ext}`, content: base64Data, encoding: 'base64' });
  }
  await transporter.sendMail({
    from: '"Erivion Payments" <' + process.env.EMAIL_USER + '>',
    to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
    subject: `💰 Payment Request - ${planData.name} Plan - ${userEmail}`,
    html: `<div style="font-family:sans-serif;max-width:500px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:12px"><h2 style="color:#7c6af7">💰 New Payment Request</h2><table style="width:100%;border-collapse:collapse;margin:20px 0"><tr><td style="color:#888;padding:8px 0">User Email</td><td style="color:#fff;font-weight:600">${userEmail}</td></tr><tr><td style="color:#888;padding:8px 0">Plan</td><td style="color:#7c6af7;font-weight:700">${planData.name}</td></tr><tr><td style="color:#888;padding:8px 0">Billing</td><td style="color:#fff">${billingLabel}</td></tr><tr><td style="color:#888;padding:8px 0">Amount</td><td style="color:#22c55e;font-weight:700">${amount} EGP</td></tr></table><p style="color:#888;font-size:13px">Screenshot attached. Please verify and approve or reject below.</p><div style="margin-top:24px;display:flex;gap:12px"><a href="${process.env.BACKEND_URL || 'http://localhost:3001'}/api/auth/admin/approve?email=${encodeURIComponent(userEmail)}&plan=${plan}&billing=${billing}&secret=${process.env.ADMIN_SECRET || ''}" style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">✅ Approve - Open ${planData.name} Plan</a> <a href="${process.env.BACKEND_URL || 'http://localhost:3001'}/api/auth/admin/reject?email=${encodeURIComponent(userEmail)}&secret=${process.env.ADMIN_SECRET || ''}" style="background:#ef4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">❌ Reject</a></div></div>`,
    attachments,
  });
}

export function activateUserPlan(email, plan, billing = 'monthly') {
  const expiresAt = new Date();
  if (billing === 'yearly') expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  else expiresAt.setMonth(expiresAt.getMonth() + 1);
  db.prepare('UPDATE users SET plan = ?, plan_billing = ?, plan_expires_at = ? WHERE email = ?').run(plan, billing, expiresAt.toISOString(), email);
  return { success: true, plan, expires_at: expiresAt.toISOString() };
}

export function createPaymentRequest(userId, userEmail, plan, billing, amount, screenshotData) {
  const result = db.prepare('INSERT INTO payment_requests (user_id, user_email, plan, billing, amount, screenshot_data, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run(userId, userEmail, plan, billing, amount, screenshotData || null, 'pending');
  return result.lastInsertRowid;
}

export function getAllPaymentRequests(status = null) {
  if (status) return db.prepare('SELECT * FROM payment_requests WHERE status = ? ORDER BY created_at DESC').all(status);
  return db.prepare('SELECT * FROM payment_requests ORDER BY created_at DESC').all();
}

export async function signUp(email, password) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) throw new Error('Email already registered');
  const hashed = await bcrypt.hash(password, 10);
  const code = generateCode();
  const expires = Date.now() + 10 * 60 * 1000;
  db.prepare('INSERT INTO users (email, password, plan) VALUES (?, ?, ?)').run(email, hashed, 'free');
  db.prepare('DELETE FROM verification_codes WHERE email = ?').run(email);
  db.prepare('INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?)').run(email, code, expires);
  await sendVerificationEmail(email, code);
  return { message: 'Verification code sent' };
}

export async function verifyCode(email, code) {
  const row = db.prepare('SELECT * FROM verification_codes WHERE email = ? AND code = ?').get(email, code.toUpperCase());
  if (!row) throw new Error('Invalid code');
  if (Date.now() > row.expires_at) throw new Error('Code expired');
  db.prepare('UPDATE users SET verified = 1 WHERE email = ?').run(email);
  db.prepare('DELETE FROM verification_codes WHERE email = ?').run(email);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  checkAndResetUsage(user.id);
  const token = jwt.sign({ userId: user.id, email }, JWT_SECRET, { expiresIn: '30d' });
  return { token, email, plan: user.plan || 'free', isNewUser: true };
}

export async function login(email, password) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) throw new Error('Invalid email or password');
  if (!user.verified) throw new Error('Please verify your email first');
  const match = await bcrypt.compare(password, user.password);
  if (!match) throw new Error('Invalid email or password');
  checkAndResetUsage(user.id);
  const token = jwt.sign({ userId: user.id, email }, JWT_SECRET, { expiresIn: '30d' });
  return { token, email, plan: user.plan || 'free', isNewUser: !user.plan || user.plan === null };
}

// ✅ Google OAuth - login or create user automatically
export function loginOrCreateGoogleUser({ googleId, email, name, avatar }) {
  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (user) {
    if (!user.google_id) {
      db.prepare('UPDATE users SET google_id = ?, avatar = ?, verified = 1 WHERE id = ?').run(googleId, avatar, user.id);
    }
  } else {
    db.prepare('INSERT INTO users (email, password, name, google_id, avatar, verified, plan) VALUES (?, ?, ?, ?, ?, 1, ?)').run(email, 'GOOGLE_AUTH_NO_PASSWORD', name || email.split('@')[0], googleId, avatar || null, 'free');
    user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  }
  checkAndResetUsage(user.id);
  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
  return { token, email: user.email, name: user.name, avatar: user.avatar, plan: user.plan || 'free', isNewUser: !user.plan || user.plan === 'free' };
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export function saveVideo(userId, filename, title) {
  db.prepare('INSERT INTO videos (user_id, filename, title) VALUES (?, ?, ?)').run(userId, filename, title || filename);
}

export function getUserVideos(userId) {
  return db.prepare('SELECT * FROM videos WHERE user_id = ? ORDER BY created_at DESC').all(userId);
}