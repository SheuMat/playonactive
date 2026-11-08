// Booking storage in Redis (Upstash, added through Vercel > Storage).
//
// Each day's bookings are one JSON document. Every change is a read-modify-write
// guarded by an atomic compare-and-set script, so two people booking the last
// place at the same moment can never both get it: one write wins, the other
// re-reads the new state and tries again.
import { HttpError } from './http.js';

// Vercel names these KV_REST_API_URL / KV_REST_API_TOKEN, sometimes with a prefix
// (e.g. STORAGE_KV_REST_API_URL), or UPSTASH_REDIS_REST_URL / _TOKEN.
const envEnding = (suffix) => {
  const key = Object.keys(process.env).find((k) => k === suffix || k.endsWith('_' + suffix));
  return key ? process.env[key] : '';
};
const restUrl = () => envEnding('KV_REST_API_URL') || envEnding('UPSTASH_REDIS_REST_URL');
const restToken = () => envEnding('KV_REST_API_TOKEN') || envEnding('UPSTASH_REDIS_REST_TOKEN');

// Tests and the local dev server use an in-memory Map instead of Redis.
const mem = () => globalThis.__poaMemStore;

export const storeReady = () => Boolean(mem() || (restUrl() && restToken()));

const CAS = "local c = redis.call('GET', KEYS[1]) if not c then c = '' end " +
  "if c == ARGV[1] then redis.call('SET', KEYS[1], ARGV[2]) return 1 end return 0";

async function redis(args) {
  if (!storeReady()) throw new HttpError(503, 'Online booking isn’t open just yet. Please try again shortly.');
  const res = await fetch(restUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${restToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    console.error('Redis error', res.status, data.error);
    throw new HttpError(503, 'We couldn’t reach our booking system just now. Please try again in a moment.');
  }
  return data.result;
}

async function getRaw(key) {
  const m = mem();
  if (m) return m.get(key) ?? '';
  return (await redis(['GET', key])) ?? '';
}

async function compareAndSet(key, expected, next) {
  const m = mem();
  if (m) {
    if ((m.get(key) ?? '') !== expected) return false;
    m.set(key, next);
    return true;
  }
  return (await redis(['EVAL', CAS, '1', key, expected, next])) === 1;
}

const empty = () => ({ bookings: [] });

export async function load(key) {
  const raw = await getRaw(key);
  return raw ? JSON.parse(raw) : empty();
}

// fn(state) changes state in place and returns a result. It may run more than
// once if someone else wrote at the same time, so it must not send emails.
export async function mutate(key, fn) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const raw = await getRaw(key);
    const state = raw ? JSON.parse(raw) : empty();
    const result = await fn(state);
    if (await compareAndSet(key, raw, JSON.stringify(state))) return result;
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 80 * (attempt + 1)));
  }
  throw new HttpError(503, 'Lots of people are booking right now. Please try again in a moment.');
}

// Set key only if it doesn't exist yet, expiring after ttl seconds. Returns true if set.
export async function setOnce(key, ttl) {
  const m = mem();
  if (m) {
    const until = m.get(key);
    if (until && Number(until) > Date.now()) return false;
    m.set(key, String(Date.now() + ttl * 1000));
    return true;
  }
  return (await redis(['SET', key, '1', 'NX', 'EX', String(ttl)])) === 'OK';
}

export async function del(key) {
  const m = mem();
  if (m) return m.delete(key);
  return redis(['DEL', key]);
}
