/**
 * The event bus WebSocket broadcast every event to every client uncompressed. The server now offers
 * permessage-deflate (RFC 7692), so a client that supports it receives compressed frames.
 *
 * It is also the one implementation behind `@almadar/server-hono` (which kept a copy): a client
 * message reaches the server bus only when its payload is an object, the bus's payload shape.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { afterEach, describe, expect, it } from 'vitest';
import { closeWebSocketServer, setupEventBroadcast } from '../websocket.js';
import { getServerEventBus } from '../eventBus.js';

let server: Server | null = null;
let client: WebSocket | null = null;

afterEach(async () => {
  client?.terminate();
  client = null;
  await closeWebSocketServer();
  server?.closeAllConnections();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = null;
});

async function connect(perMessageDeflate: boolean): Promise<WebSocket> {
  server = createServer();
  setupEventBroadcast(server);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/events`, { perMessageDeflate });
  client = ws;
  await new Promise<void>((resolve, reject) => { ws.once('open', () => resolve()); ws.once('error', reject); });
  return ws;
}

describe('event broadcast WebSocket compression', () => {
  it('negotiates permessage-deflate with a client that offers it', async () => {
    const ws = await connect(true);
    expect(ws.extensions).toContain('permessage-deflate');
  });

  it('control: a client that does not offer it still connects, uncompressed', async () => {
    const ws = await connect(false);
    expect(ws.extensions).toBe('');
  });

  it('a client message with an object payload reaches the server bus', async () => {
    const ws = await connect(true);
    const seen = new Promise((resolve) => { const off = getServerEventBus().on('CLIENT_PING', (e) => { off(); resolve(e.payload); }); });
    ws.send(JSON.stringify({ type: 'CLIENT_PING', payload: { n: 1 } }));
    expect(await seen).toEqual({ n: 1 });
  });

  it('control: a message whose payload is not an object is dropped', async () => {
    const ws = await connect(true);
    let received = 0;
    const off = getServerEventBus().on('CLIENT_TEXT', () => { received++; });
    ws.send(JSON.stringify({ type: 'CLIENT_TEXT', payload: 'hello' }));
    ws.send(JSON.stringify({ type: 'CLIENT_TEXT', payload: [1, 2] }));
    ws.send('not json');
    const marker = new Promise((resolve) => { const o = getServerEventBus().on('CLIENT_DONE', () => { o(); resolve(true); }); });
    ws.send(JSON.stringify({ type: 'CLIENT_DONE', payload: {} }));
    await marker;
    off();
    expect(received).toBe(0);
  });
});
