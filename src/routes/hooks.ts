/**
 * Inbound Webhook Ingress (Express)
 *
 * `POST /:provider` — one shared entry point for external services that call
 * back into a deployed app (Google Calendar watch channels, e-sign status,
 * banking callbacks, …). Mount OUTSIDE the authenticated `/api` scope: hook
 * senders cannot present a Firebase token; each provider's own verification
 * (signature / channel token) is the auth.
 *
 * A provider is a pure function over `{ headers, rawBody }` returning either
 * the canonical `{ event, payload }` to dispatch, `{ ack: true }` (valid but
 * nothing to dispatch — e.g. a channel handshake), or `{ error }`. Provider
 * implementations live in `@almadar/integrations` beside their SDKs (the
 * `stripe/webhooks.ts` pattern); this router is glue.
 *
 * Responses: 200 on dispatch/ack (so the sender stops retrying), 400 on a
 * verification error, 404 for an unknown provider.
 *
 * @packageDocumentation
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '@almadar/logger';
import type { EventPayload } from '@almadar/core';

const hooksLog = createLogger('almadar:server:routes:hooks');

export type HookProviderResult =
  | { event: string; payload: EventPayload }
  | { ack: true }
  | { error: string };

export type HookProvider = (input: {
  headers: Record<string, string | undefined>;
  rawBody: string;
}) => HookProviderResult;

export type HookDispatch = (
  event: string,
  payload: EventPayload,
) => Promise<void> | void;

export interface HooksRouterOptions {
  providers: Record<string, HookProvider>;
  dispatch: HookDispatch;
}

export function createHooksRouter(options: HooksRouterOptions): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.post('/:provider', async (req: Request, res: Response) => {
    const providerName = String(req.params.provider);
    const provider = options.providers[providerName];
    if (!provider) {
      res.status(404).json({ error: `Unknown hook provider: ${providerName}` });
      return;
    }

    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    const headers: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      headers[key] = Array.isArray(value) ? value[0] : value;
    }

    const result = provider({ headers, rawBody });
    if ('error' in result) {
      hooksLog.warn('hook rejected', { provider: providerName, error: result.error });
      res.status(400).json({ error: result.error });
      return;
    }
    if ('ack' in result) {
      res.status(200).json({ ok: true, dispatched: false });
      return;
    }

    try {
      await options.dispatch(result.event, result.payload);
      hooksLog.info('hook dispatched', { provider: providerName, event: result.event });
      res.status(200).json({ ok: true, dispatched: true, event: result.event });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      hooksLog.error('hook dispatch failed', { provider: providerName, event: result.event, error: message });
      // 500 → the sender retries; dispatch failures are transient by contract.
      res.status(500).json({ error: message });
    }
  });

  return router;
}
