'use strict';
const crypto = require('node:crypto');

const SECRET = process.env.APP_SECRET || 'codecamp-dev-secret-change-me';
const TTL = 7 * 24 * 3600 * 1000;

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(plain), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(plain, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const calc = crypto.scryptSync(String(plain), salt, 32).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(calc, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const b64u = (buf) => Buffer.from(buf).toString('base64url');

function sign(payload) {
  const body = { ...payload, exp: Date.now() + TTL };
  const data = b64u(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verify(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  const expect = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  if (sig.length !== expect.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

module.exports = { hashPassword, verifyPassword, sign, verify };
