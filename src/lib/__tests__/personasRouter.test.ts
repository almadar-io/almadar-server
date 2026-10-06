/**
 * Dev personas exist only in the Auth emulator: without FIREBASE_AUTH_EMULATOR_HOST the router
 * serves nothing; with it (live, `ALMADAR_EMULATOR_LIVE=1`) signing in as a roster member yields a
 * custom token whose ID token verifies as that member.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { UserContext } from '@almadar/core';
import { JAVA21_CANDIDATES, findJava21Home, startFirebaseEmulators, type RunningEmulators } from '@almadar/db/emulator';
import { emulatorIdToken, firebaseVerifier } from '@almadar/auth/server';
import { personasRouter } from '../personasRouter.js';

const ROSTER: UserContext[] = [{ id: 'maya', name: 'Maya', role: 'member' }, { id: 'ola', role: 'admin' }];
const app = () => express().use(express.json()).use('/api', personasRouter(async () => ROSTER));

describe('personasRouter without the Auth emulator', () => {
  it('serves nothing: no roster, no sign-in', async () => {
    delete process.env['FIREBASE_AUTH_EMULATOR_HOST'];
    expect((await request(app()).get('/api/personas')).status).toBe(404);
    expect((await request(app()).post('/api/personas/sign-in').send({ id: 'maya' })).status).toBe(404);
  });
});

describe.runIf(process.env['ALMADAR_EMULATOR_LIVE'] === '1')('personasRouter on the Auth emulator (live)', () => {
  let emulators: RunningEmulators;
  beforeAll(async () => {
    emulators = await startFirebaseEmulators({
      projectId: 'demo-almadar-personas-test',
      dataDir: mkdtempSync(join(tmpdir(), 'personas-emu-')),
      services: ['auth'],
      ports: { firestore: 18086, auth: 19093 },
      firebaseBin: process.env['FIREBASE_TOOLS_BIN'] ?? 'firebase',
      javaHome: findJava21Home(process.env, JAVA21_CANDIDATES),
      env: { ...process.env, NODE_ENV: 'development' },
    });
    Object.assign(process.env, emulators.env);
  }, 180_000);
  afterAll(async () => { await emulators?.stop(); });

  it('lists the roster', async () => {
    const res = await request(app()).get('/api/personas');
    expect(res.body).toEqual({ success: true, personas: ROSTER, source: 'identity-entity' });
  });

  it('signs in as a roster member: the token verifies with its role', async () => {
    const res = await request(app()).post('/api/personas/sign-in').send({ id: 'ola' });
    expect(res.status).toBe(200);
    const verified = await firebaseVerifier().verify(await emulatorIdToken(res.body.customToken, res.body.authEmulatorHost), null);
    expect(verified).toMatchObject({ uid: 'ola', claims: { role: 'admin' } });
  });

  it('control: an id outside the roster is refused', async () => {
    expect((await request(app()).post('/api/personas/sign-in').send({ id: 'mallory' })).status).toBe(404);
    expect((await request(app()).post('/api/personas/sign-in').send({})).status).toBe(400);
  });
});
