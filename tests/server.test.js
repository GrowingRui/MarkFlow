// @vitest-environment node
// API handlers against an in-memory PGlite database (PGLITE_DIR=memory:// in vite.config.js).
import { describe, expect, it } from 'vitest';
import { me, recordConversion, signin, signout, signup } from '../server/handlers.js';
import { LIMITS } from '../server/plans.js';

const ORIGIN = 'https://markflow.test';
let ipCounter = 0;

// Each test gets its own client IP, so anonymous counters and sign-in throttles don't collide.
function client() {
  const ip = `10.0.0.${++ipCounter}`;
  let cookie = '';
  const call = async (handler, method, path, body, headers = {}) => {
    const res = await handler(new Request(ORIGIN + path, {
      method,
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, origin: ORIGIN, cookie, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }));
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json(), setCookie: set };
  };
  return {
    signup: body => call(signup, 'POST', '/api/signup', body),
    signin: body => call(signin, 'POST', '/api/signin', body),
    signout: () => call(signout, 'POST', '/api/signout'),
    me: () => call(me, 'GET', '/api/me'),
    convert: headers => call(recordConversion, 'POST', '/api/usage', undefined, headers),
  };
}

let emailCounter = 0;
const newEmail = () => `person${++emailCounter}@example.com`;

describe('accounts', () => {
  it('signs up, stays signed in, signs out', async () => {
    const c = client();
    const email = newEmail();
    const up = await c.signup({ email: ` ${email.toUpperCase()} `, password: 'correct horse' });
    expect(up.status).toBe(200);
    expect(up.body.user).toEqual({ email });
    expect(up.setCookie).toMatch(/^mf_session=[\w-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure$/);

    expect((await c.me()).body.user).toEqual({ email });
    await c.signout();
    expect((await c.me()).body.user).toBeNull();
  });

  it('signs in with the right password only', async () => {
    const email = newEmail();
    await client().signup({ email, password: 'correct horse' });
    const c = client();
    expect((await c.signin({ email, password: 'wrong horse' })).status).toBe(401);
    expect((await c.signin({ email: newEmail(), password: 'correct horse' })).status).toBe(401);
    const ok = await c.signin({ email, password: 'correct horse' });
    expect(ok.status).toBe(200);
    expect((await c.me()).body.user).toEqual({ email });
  });

  it('rejects duplicate emails, bad emails and short passwords', async () => {
    const c = client();
    const email = newEmail();
    expect((await c.signup({ email, password: 'correct horse' })).status).toBe(200);
    expect((await c.signup({ email, password: 'another one' })).status).toBe(409);
    expect((await c.signup({ email: 'not-an-email', password: 'correct horse' })).body.error).toBe('Enter a valid email address.');
    expect((await c.signup({ email: newEmail(), password: 'short' })).body.error).toBe('Use a password of at least 8 characters.');
  });

  it('refuses posts from other sites', async () => {
    const res = await signin(new Request(ORIGIN + '/api/signin', {
      method: 'POST', headers: { origin: 'https://evil.test' }, body: '{}',
    }));
    expect(res.status).toBe(403);
  });

  it('throttles repeated sign-in attempts', async () => {
    const c = client();
    const statuses = [];
    for (let i = 0; i < 21; i++) statuses.push((await c.signin({ email: newEmail(), password: 'nope nope' })).status);
    expect(statuses.slice(0, 20).every(s => s === 401)).toBe(true);
    expect(statuses[20]).toBe(429);
  }, 30_000);
});

describe('conversion limits', () => {
  it('counts anonymous conversions up to the anonymous limit', async () => {
    const c = client();
    expect((await c.me()).body.usage).toEqual({ used: 0, limit: LIMITS.anonymous });
    for (let i = 1; i <= LIMITS.anonymous; i++) expect((await c.convert()).body.usage.used).toBe(i);
    const over = await c.convert();
    expect(over.status).toBe(429);
    expect(over.body.usage).toEqual({ used: LIMITS.anonymous, limit: LIMITS.anonymous });
  });

  it('gives signed-in people the free limit, counted per account', async () => {
    const c = client();
    await c.convert();
    await c.signup({ email: newEmail(), password: 'correct horse' });
    expect((await c.me()).body.usage).toEqual({ used: 0, limit: LIMITS.free });
    expect((await c.convert()).body.usage).toEqual({ used: 1, limit: LIMITS.free });
  });
});
