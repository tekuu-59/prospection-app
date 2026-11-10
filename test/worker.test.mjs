import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../_worker.js';

// Petite base SQLite en mémoire qui imite l'interface D1 (prepare / bind / all / batch).
export function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => db.prepare(sql).run(...args),
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => { for (const s of list) await s.run(); } };
}

const env = () => ({ DB: fakeD1(), APP_PASSWORD: 'secret-phrase', ASSETS: { fetch: async () => new Response('asset') } });
const call = (e, body, pw = 'secret-phrase', method = 'POST') =>
  worker.fetch(new Request('https://x.test/api/sync', { method, headers: { authorization: `Bearer ${pw}` }, body: method === 'POST' ? JSON.stringify(body) : undefined }), e);
const rec = (id, data, updated, deleted = 0) => ({ id, kind: 'day', data: JSON.stringify(data), updated, deleted });

test('mauvais mot de passe, mauvaise méthode, non configuré', async () => {
  const e = env();
  assert.equal((await call(e, {}, 'nope')).status, 401);
  assert.equal((await call(e, {}, 'x', 'PUT')).status, 405);
  assert.deepEqual(await (await call(e, {}, 'x', 'GET')).json(), { worker: true, db: true, password: true, sheet: false }); // diagnostic, sans secret
  assert.equal((await call({ ...e, APP_PASSWORD: undefined }, {})).status, 503);
});

test('fichiers statiques passés à ASSETS', async () => {
  const r = await worker.fetch(new Request('https://x.test/index.html'), env());
  assert.equal(await r.text(), 'asset');
});

test('enregistre, relit, le plus récent gagne, suppression', async () => {
  const e = env();
  let r = await (await call(e, { since: 0, changes: [rec('d:2026-11-10|Gare', { portes: 3 }, 100)] })).json();
  assert.equal(r.records.length, 1);
  // une modification plus ancienne est ignorée
  r = await (await call(e, { since: 0, changes: [rec('d:2026-11-10|Gare', { portes: 1 }, 50)] })).json();
  assert.equal(JSON.parse(r.records[0].data).portes, 3);
  // une plus récente remplace
  r = await (await call(e, { since: 0, changes: [rec('d:2026-11-10|Gare', { portes: 9 }, 200)] })).json();
  assert.equal(JSON.parse(r.records[0].data).portes, 9);
  // suppression = fiche marquée supprimée, renvoyée aux autres appareils
  r = await (await call(e, { since: 0, changes: [rec('d:2026-11-10|Gare', null, 300, 1)] })).json();
  assert.equal(r.records[0].deleted, 1);
  // "since" ne renvoie que le nouveau
  const later = await (await call(e, { since: r.now, changes: [] })).json();
  assert.equal(later.records.length, 0);
});

test('entrées invalides ignorées, injection SQL inoffensive', async () => {
  const e = env();
  const bad = [{ id: 'x'.repeat(300), kind: 'day', data: '{}', updated: 1 }, { id: 'a', kind: 'evil', data: '{}', updated: 1 }, rec("d:1'; DROP TABLE records;--", { ok: 1 }, 5)];
  const r = await (await call(e, { since: 0, changes: bad })).json();
  assert.equal(r.records.length, 1);
  assert.equal((await (await call(e, { since: 0, changes: [] })).json()).records.length, 1);
});

test('le type « jour » (durée de prospection) est accepté', async () => {
  const e = env();
  const r = await (await call(e, { since: 0, changes: [{ id: 'j:2026-11-10', kind: 'jour', data: JSON.stringify({ date: '2026-11-10', minutes: 175 }), updated: 1, deleted: 0 }] })).json();
  assert.equal(JSON.parse(r.records[0].data).minutes, 175);
});

test('/api/sheet : mot de passe, configuration, relais vers le script avec jeton', async () => {
  const sheetEnv = { ...env(), SHEET_SCRIPT_URL: 'https://script.example/exec', SHEET_TOKEN: 'jeton' };
  const post = (e, body, pw = 'secret-phrase') =>
    worker.fetch(new Request('https://x.test/api/sheet', { method: 'POST', headers: { authorization: `Bearer ${pw}` }, body: JSON.stringify(body) }), e);
  assert.equal((await post(sheetEnv, {}, 'nope')).status, 401);
  assert.equal((await post(env(), { date: '2026-11-10' })).status, 503); // script non configuré
  assert.equal((await post(sheetEnv, { date: 'hier' })).status, 400);

  const realFetch = globalThis.fetch;
  let seen;
  globalThis.fetch = async (url, init) => { seen = { url, init }; return new Response(JSON.stringify({ ok: true, jour: { row: 20 } })); };
  try {
    const r = await post(sheetEnv, { date: '2026-11-10', minutes: 175, contacts: 5, r1: 1, r2: 0, zones: ['Z3'], intrus: 'x', clients: [{ client: 'Garage', statut: 'r1', quand: '2026-11-12T14:30', commentaire: 'ok', autre: 1 }] });
    assert.deepEqual(await r.json(), { ok: true, jour: { row: 20 } });
    assert.equal(seen.url, 'https://script.example/exec');
    const sent = JSON.parse(seen.init.body);
    assert.equal(sent.token, 'jeton');
    assert.equal(sent.minutes, 175);
    assert.equal('intrus' in sent || 'autre' in sent.clients[0], false); // seuls les champs connus partent
    globalThis.fetch = async () => new Response('<html>erreur Google</html>');
    assert.equal((await post(sheetEnv, { date: '2026-11-10' })).status, 502);
    globalThis.fetch = async () => { throw new Error('réseau'); };
    assert.equal((await post(sheetEnv, { date: '2026-11-10' })).status, 502);
  } finally { globalThis.fetch = realFetch; }
});
