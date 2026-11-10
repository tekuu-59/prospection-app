// Sauvegarde en ligne : envoie les changements à /api/sync et reçoit ceux des autres appareils.
// L'app marche sans (hors ligne, ou testée en local sans serveur) ; la synchro est un plus.
import { read, write } from './store.js';

// Empreinte rapide (cyrb53) d'une fiche, indépendante de l'ordre de ses champs : deux appareils qui
// écrivent les mêmes données dans un ordre différent ne doivent pas se croire en désaccord.
const sorted = (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v);
const hash = (obj) => {
  const s = JSON.stringify(obj, sorted);
  let a = 0xdeadbeef, b = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 2654435761);
    b = Math.imul(b ^ c, 1597334677);
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return (4294967296 * (2097151 & b) + (a >>> 0)).toString(36);
};

// records() : Map id → { kind, data } ; apply(list) : list de { id, kind, data | null si supprimé }
// onStatus(état, détail) : 'local' | 'unconfigured' | 'login' | 'bad-password' | 'ok' | 'offline' | 'syncing'
export function createSync({ records, apply, onStatus }) {
  let busy = false, again = false, timer;

  async function run() {
    if (busy) { again = true; return; }
    busy = true;
    try {
      const pw = read('syncPw', '');
      const st = read('sync', { since: 0, synced: {} });
      const cur = records();
      const sent = {};
      const changes = [];
      const stamp = Date.now();
      for (const [id, r] of cur) {
        const data = JSON.stringify(r.data);
        const h = hash(r.data);
        if (st.synced[id] !== h) { changes.push({ id, kind: r.kind, data, updated: stamp, deleted: 0 }); sent[id] = h; }
      }
      for (const id of Object.keys(st.synced)) {
        if (!cur.has(id)) changes.push({ id, kind: { d: 'day', c: 'contact', j: 'jour' }[id[0]], data: 'null', updated: stamp, deleted: 1 });
      }
      onStatus('syncing', changes.length);

      let res;
      try {
        res = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${pw}` },
          body: JSON.stringify({ since: st.since, changes: pw ? changes : [] }),
        });
      } catch {
        return onStatus('offline', changes.length);
      }
      if (res.status === 503) return onStatus('unconfigured'); // le serveur répond mais la base ou le mot de passe manque
      if (res.status === 404 || res.status === 405 || res.status === 501) return onStatus('local');
      if (res.status === 401) { write('syncPw', ''); return onStatus(pw ? 'bad-password' : 'login'); }
      if (!res.ok) return onStatus('offline', changes.length);

      const { now, records: remote } = await res.json();
      Object.assign(st.synced, sent); // d'abord nos envois : une version distante plus récente les remplace ensuite
      const incoming = [];
      for (const r of remote) {
        if (r.id in sent && !r.deleted && hash(JSON.parse(r.data)) === sent[r.id]) continue; // notre propre envoi qui nous revient
        if (r.deleted && !cur.has(r.id)) { delete st.synced[r.id]; continue; }
        incoming.push({ id: r.id, kind: r.kind, data: r.deleted ? null : JSON.parse(r.data) });
        if (r.deleted) delete st.synced[r.id]; else st.synced[r.id] = hash(JSON.parse(r.data));
      }
      if (incoming.length) apply(incoming);
      for (const c of changes) if (c.deleted) delete st.synced[c.id];
      st.since = Math.max(0, now - 5000); // petit recouvrement : on retélécharge 5 s, sans risque
      write('sync', st);
      onStatus('ok', Date.now());
    } catch {
      onStatus('offline');
    } finally {
      busy = false;
      if (again) { again = false; schedule(500); }
    }
  }

  function schedule(ms = 3000) {
    clearTimeout(timer);
    timer = setTimeout(run, ms);
  }

  addEventListener('online', () => schedule(500));
  return { run, schedule };
}
