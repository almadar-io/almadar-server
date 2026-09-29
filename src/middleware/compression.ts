import compression from 'compression';
import type { Request, RequestHandler, Response } from 'express';

function isEventStream(res: Response): boolean {
  return String(res.getHeader('content-type') ?? '').startsWith('text/event-stream');
}

/** Every response `compression` considers compressible, except Server-Sent Events, which must reach the client unbuffered. */
export function compressionFilter(req: Request, res: Response): boolean {
  return !isEventStream(res) && compression.filter(req, res);
}

/** brotli (or gzip) for responses of 1 KB and more; SSE streams pass through untouched. */
export function compressionMiddleware(): RequestHandler {
  return compression({ filter: compressionFilter });
}
