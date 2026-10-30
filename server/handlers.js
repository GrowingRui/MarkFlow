// API handlers. Each takes a Web Request and returns a Response, so the same code runs as a
// Vercel Function (api/*.js) and inside the Vite dev server (server/vite-plugin.js).
import { randomUUID } from 'node:crypto';
import { query } from './db.js';
import {
  bump, clientId, counterValue, createSession, deleteSession, dummyVerify,
  hashPassword, sessionCookie, sessionUser, verifyPassword,
} from './auth.js';
import { AUTH_ATTEMPTS_PER_HOUR, LIMITS } from './plans.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
const problem = (status, error) => json({ error }, status);

function usageKey(request, user) {
  const day = new Date().toISOString().slice(0, 10);
  return `conv:${user ? `u:${user.id}` : `a:${clientId(request)}`}:${day}`;
}
const limitFor = user => user ? LIMITS.free : LIMITS.anonymous;

async function usage(request, user) {
  return { used: await counterValue(usageKey(request, user)), limit: limitFor(user) };
}

function endOfDay() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

// Rejects posts made from other sites. Browsers send Origin on every POST.
function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

async function readCredentials(request) {
  let body;
  try { body = await request.json(); } catch { return { error: 'Enter your email and password.' }; }
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');
  if (!EMAIL.test(email) || email.length > 254) return { error: 'Enter a valid email address.' };
  if (!password) return { error: 'Enter your password.' };
  if (password.length > 256) return { error: 'Use a password of 256 characters or fewer.' };
  return { email, password };
}

function throttle(request) {
  const hour = new Date().toISOString().slice(0, 13);
  return bump(`auth:${clientId(request)}:${hour}`, AUTH_ATTEMPTS_PER_HOUR, new Date(Date.now() + 3600e3));
}

function guard(handler) {
  return async request => {
    if (request.method === 'POST' && !sameOrigin(request)) return problem(403, 'Requests must come from MarkFlow itself.');
    try {
      return await handler(request);
    } catch (err) {
      console.error(err);
      return problem(500, 'Something went wrong on our side. Try again in a moment.');
    }
  };
}

async function startSession(request, user) {
  const { token, maxAge } = await createSession(user.id);
  return json({ user: { email: user.email }, usage: await usage(request, user) }, 200, { 'set-cookie': sessionCookie(request, token, maxAge) });
}

export const signup = guard(async request => {
  const creds = await readCredentials(request);
  if (creds.error) return problem(400, creds.error);
  if (creds.password.length < 8) return problem(400, 'Use a password of at least 8 characters.');
  if (await throttle(request) === null) return problem(429, 'Too many attempts. Try again in an hour.');
  const user = { id: randomUUID(), email: creds.email };
  const rows = await query(
    'INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING RETURNING id',
    [user.id, user.email, await hashPassword(creds.password)],
  );
  if (!rows.length) return problem(409, 'An account with this email already exists. Sign in instead.');
  return startSession(request, user);
});

export const signin = guard(async request => {
  const creds = await readCredentials(request);
  if (creds.error) return problem(400, creds.error);
  if (await throttle(request) === null) return problem(429, 'Too many attempts. Try again in an hour.');
  const [row] = await query('SELECT id, email, password_hash FROM users WHERE email = $1', [creds.email]);
  const ok = row ? await verifyPassword(creds.password, row.password_hash) : (await dummyVerify(creds.password), false);
  if (!ok) return problem(401, 'That email and password don’t match.');
  return startSession(request, row);
});

export const signout = guard(async request => {
  await deleteSession(request);
  return json({ user: null, usage: await usage(request, null) }, 200, { 'set-cookie': sessionCookie(request, '', 0) });
});

export const me = guard(async request => {
  const user = await sessionUser(request);
  return json({ user: user && { email: user.email }, usage: await usage(request, user) });
});

// Counts one finished conversion. Answers 429 when today's limit is already used up.
export const recordConversion = guard(async request => {
  const user = await sessionUser(request);
  const limit = limitFor(user);
  const used = await bump(usageKey(request, user), limit, endOfDay());
  if (used === null) return json({ error: 'You’ve used today’s conversions.', usage: { used: limit, limit } }, 429);
  return json({ usage: { used, limit } });
});

export const routes = {
  'POST /api/signup': signup,
  'POST /api/signin': signin,
  'POST /api/signout': signout,
  'GET /api/me': me,
  'POST /api/usage': recordConversion,
};
