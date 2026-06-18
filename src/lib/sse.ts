import type { ServerResponse } from 'http';

export interface SSEEvent {
  type: string;
  data?: unknown;
  timestamp?: number;
}

export function setupSSE(res: ServerResponse): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

export function formatSSEEvent(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function sendSSEEvent(res: ServerResponse, event: SSEEvent): void {
  res.write(formatSSEEvent(event));
}

export function sendSSEDone(res: ServerResponse): void {
  sendSSEEvent(res, { type: 'done', timestamp: Date.now() });
  res.end();
}

export function closeSSE(res: ServerResponse): void {
  res.end();
}
