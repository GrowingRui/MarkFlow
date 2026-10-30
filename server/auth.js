// Passwords, sessions, cookies and counters.
import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { query } from './db.js';

const scryptAsync = promisify(scrypt);
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 32;

const SESSION_COOKIE = 'mf_session';
const SESSION_DAYS = 30;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, N, r, p, salt, key] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await scryptAsync(password.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p, maxmem: SCRYPT.maxmem });
  return timingSafeEqual(actual, expected);
}

// Checked against when the email is unknown, so a wrong email takes as long as a wrong password.
let dummyHash;
export async function dummyVerify(password) {
  dummyHash ??= await hashPassword('markflow-dummy-password');
  await verifyPassword(password, dummyHash);
}

const sha256 = value => createHash('sha256').update(value).digest('base64url');

export async function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400e3);
  await query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [sha256(token), userId, expires.toISOString()]);
  return { token, maxAge: SESSION_DAYS * 86400 };
}

export async function sessionUser(request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const rows = await query(
    'SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()',
    [sha256(token)],
  );
  return rows[0] ?? null;
}

export async function deleteSession(request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
}

function readCookie(request, name) {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export function sessionCookie(request, token, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

// Anonymous visitors are counted by a keyed hash of their IP address; the address isn't stored.
// On Vercel the platform sets x-forwarded-for; the dev server sets it from the socket.
export function clientId(request) {
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  return createHmac('sha256', secret()).update(ip).digest('base64url').slice(0, 22);
}

function secret() {
  const value = process.env.SESSION_SECRET;
  if (value) return value;
  if (process.env.VERCEL) throw new Error('SESSION_SECRET is not set.');
  return 'markflow-dev-secret';
}

// Adds one to a counter unless it has reached the limit. Returns the new count, or null when full.
export async function bump(key, limit, expiresAt) {
  if (Math.random() < 0.01) await query('DELETE FROM counters WHERE expires_at < now()');
  const rows = await query(
    `INSERT INTO counters (key, count, expires_at) VALUES ($1, 1, $3)
     ON CONFLICT (key) DO UPDATE SET count = counters.count + 1 WHERE counters.count < $2
     RETURNING count`,
    [key, limit, expiresAt.toISOString()],
  );
  return rows[0]?.count ?? null;
}

export async function counterValue(key) {
  const rows = await query('SELECT count FROM counters WHERE key = $1 AND expires_at > now()', [key]);
  return rows[0]?.count ?? 0;
}
