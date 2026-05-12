/**
 * Server-side presentation wrapper around `@almadar/logger`.
 *
 * Gating (level + namespace + runtime override) lives in the shared
 * `@almadar/logger` package; this module only adds the server-local
 * presentation layer (ANSI color + ISO timestamp prefix) that's
 * meaningful for terminal output but irrelevant in browsers.
 *
 * Migration note: prior versions had their own copy of the level
 * filter (`shouldLog`) plus a `min-level=info` prod default. That is
 * now owned by `@almadar/logger`'s compile-time gate (with the
 * tightened `MIN_PRIORITY=WARN` prod default). `LOG_LEVEL=info` in
 * the environment widens it for prod debugging.
 */
import type { LogMeta } from '@almadar/core';
import { createLogger } from '@almadar/logger';

const log = createLogger('almadar:server');

const colors = {
  debug: '\x1b[36m', // Cyan
  info: '\x1b[32m', // Green
  warn: '\x1b[33m', // Yellow
  error: '\x1b[31m', // Red
  reset: '\x1b[0m',
};

type Level = 'debug' | 'info' | 'warn' | 'error';

function decorate(level: Level, message: string, meta?: LogMeta): { message: string; meta?: LogMeta } {
  const timestamp = new Date().toISOString();
  const prefix = `${colors[level]}[${level.toUpperCase()}]${colors.reset}`;
  return { message: `${timestamp} ${prefix} ${message}`, meta };
}

export const logger = {
  debug: (message: string, meta?: LogMeta) => {
    const d = decorate('debug', message, meta);
    log.debug(d.message, d.meta);
  },
  info: (message: string, meta?: LogMeta) => {
    const d = decorate('info', message, meta);
    log.info(d.message, d.meta);
  },
  warn: (message: string, meta?: LogMeta) => {
    const d = decorate('warn', message, meta);
    log.warn(d.message, d.meta);
  },
  error: (message: string, meta?: LogMeta) => {
    const d = decorate('error', message, meta);
    log.error(d.message, d.meta);
  },
};
