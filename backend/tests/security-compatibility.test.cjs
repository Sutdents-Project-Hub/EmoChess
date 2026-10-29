const assert = require('node:assert/strict');
const test = require('node:test');
const http = require('node:http');
const zlib = require('node:zlib');
const { once } = require('node:events');
const { createRequire } = require('node:module');
const express = require('express');
const compression = require('compression');

async function serve(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  return server.address().port;
}
function request(port, path, options = {}, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, ...options }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.setTimeout(3000, () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

test('Express preserves plain, gzip and Brotli JSON parsing and rejects malformed JSON', async (t) => {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.post('/echo', (req, res) => res.json(req.body));
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ rejected: true }));
  const port = await serve(t, app);
  const value = { emotion: '平靜', moves: ['e4', 'e5'] };
  for (const [encoding, encode] of [['identity', Buffer.from], ['gzip', zlib.gzipSync], ['br', zlib.brotliCompressSync]]) {
    const body = encode(Buffer.from(JSON.stringify(value)));
    const out = await request(port, '/echo', { method: 'POST', headers: { 'content-type': 'application/json', 'content-encoding': encoding } }, body);
    assert.equal(out.status, 200);
    assert.deepEqual(JSON.parse(out.body), value);
  }
  assert.equal((await request(port, '/echo', { method: 'POST', headers: { 'content-type': 'application/json' } }, '{invalid')).status, 400);
});

test('compression preserves gzip responses and service availability after a client abort', async (t) => {
  const app = express();
  app.use(compression({ threshold: 0 }));
  const expected = '平靜的棋局 '.repeat(2048);
  app.get('/data', (_req, res) => res.type('text').send(expected));
  app.get('/stream', (_req, res) => {
    res.type('text');
    res.write(expected);
    const timer = setInterval(() => { res.write(expected); res.flush(); }, 5);
    res.once('close', () => clearInterval(timer));
    res.flush();
  });
  const port = await serve(t, app);
  const out = await request(port, '/data', { headers: { 'accept-encoding': 'gzip' } });
  assert.equal(out.headers['content-encoding'], 'gzip');
  assert.equal(zlib.gunzipSync(out.body).toString(), expected);
  await new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: '/stream', headers: { 'accept-encoding': 'gzip' } }, (res) => {
      res.once('data', () => { res.destroy(); resolve(); });
      res.on('error', (err) => { if (err.code !== 'ECONNRESET') reject(err); });
    });
    req.setTimeout(3000, () => req.destroy(new Error('abort fixture timeout')));
    req.on('error', reject);
  });
  assert.equal((await request(port, '/data')).status, 200);
});

test('Prisma config merge preserves nested values and handles recursive object graphs', () => {
  const prismaRequire = createRequire(require.resolve('@prisma/config'));
  const { deepmerge } = prismaRequire('deepmerge-ts');
  assert.deepEqual(deepmerge({ nested: { a: 1 } }, { nested: { b: 2 } }), { nested: { a: 1, b: 2 } });
  const a = { label: 'a' }; a.self = a;
  const b = { label: 'b' }; b.self = b;
  const result = deepmerge(a, b);
  assert.equal(result.label, 'b');
  assert.equal(result.self, result);
});

test('Zod authentication schemas and JWT/bcrypt contracts remain compatible', async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://synthetic:synthetic@127.0.0.1:65432/isolated';
  process.env.JWT_SECRET = 'synthetic-access-secret-only-not-production';
  process.env.JWT_REFRESH_SECRET = 'synthetic-refresh-secret-only-not-production';
  const { registerSchema, loginSchema } = require('../dist/services/authService');
  const jwt = require('../dist/utils/jwt');
  const bcrypt = require('bcryptjs');
  assert.equal(registerSchema.parse({ email: ' QA@EXAMPLE.INVALID ', password: 'synthetic-only', displayName: '測試' }).email, 'qa@example.invalid');
  assert.equal(loginSchema.safeParse({ email: 'invalid', password: '' }).success, false);
  const payload = { userId: 'synthetic-user', email: 'qa@example.invalid' };
  const access = jwt.generateAccessToken(payload);
  const refresh = jwt.generateRefreshToken(payload);
  assert.equal(jwt.verifyAccessToken(access).userId, payload.userId);
  assert.equal(jwt.verifyRefreshToken(refresh).userId, payload.userId);
  assert.throws(() => jwt.verifyAccessToken(refresh));
  assert.throws(() => jwt.verifyAccessToken(access.slice(0, -8) + 'tampered'));
  const hash = await bcrypt.hash('synthetic-only', 4);
  assert.equal(await bcrypt.compare('synthetic-only', hash), true);
  assert.equal(await bcrypt.compare('wrong-password', hash), false);
});
