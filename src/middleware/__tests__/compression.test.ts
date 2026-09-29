/**
 * App servers built on this package sent every response uncompressed. `compressionMiddleware()`
 * compresses what is worth compressing (brotli when the client accepts it, else gzip) and leaves
 * Server-Sent Events alone: a compressed event stream is buffered and reaches the client late.
 */
import { get, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compressionMiddleware } from '../compression.js';

const rows = Array.from({ length: 400 }, (_, i) => ({ id: `row-${i}`, title: `Row number ${i % 20}`, done: i % 2 === 0 }));

function buildApp() {
  const app = express();
  app.use(compressionMiddleware());
  app.get('/rows', (_req, res) => { res.json(rows); });
  app.get('/small', (_req, res) => { res.json({ ok: true }); });
  app.get('/events', (_req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();
    for (let i = 0; i < 50; i++) res.write(`data: ${JSON.stringify(rows[i])}\n\n`);
    res.end();
  });
  return app;
}

let server: Server;
let base = '';
beforeAll(async () => {
  server = buildApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

/** The response exactly as it crossed the wire (no client-side decoding). */
function raw(path: string, acceptEncoding: string): Promise<{ headers: Record<string, string | string[] | undefined>; body: Buffer }> {
  return new Promise((resolve, reject) => {
    get(`${base}${path}`, { headers: { 'Accept-Encoding': acceptEncoding } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

describe('compressionMiddleware', () => {
  it('sends a large JSON body brotli-compressed when the client accepts br, and it decodes to the same JSON', async () => {
    const res = await raw('/rows', 'br, gzip');
    expect(res.headers['content-encoding']).toBe('br');
    const text = brotliDecompressSync(res.body).toString('utf8');
    expect(JSON.parse(text)).toEqual(rows);
    expect(res.body.length).toBeLessThan(text.length / 4);
  });

  it('falls back to gzip for a client that does not accept br', async () => {
    const res = await raw('/rows', 'gzip');
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(JSON.parse(gunzipSync(res.body).toString('utf8'))).toEqual(rows);
  });

  it('never compresses a Server-Sent Events stream', async () => {
    const res = await raw('/events', 'br, gzip');
    expect(res.headers['content-type']).toBe('text/event-stream');
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.body.toString('utf8').split('\n\n').filter(Boolean)).toHaveLength(50);
  });

  it('control: a body under the threshold is sent as is', async () => {
    const res = await raw('/small', 'br, gzip');
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(JSON.parse(res.body.toString('utf8'))).toEqual({ ok: true });
  });

  it('edge: a client that accepts no encoding gets the plain body', async () => {
    const res = await raw('/rows', 'identity');
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(JSON.parse(res.body.toString('utf8'))).toEqual(rows);
  });
});
