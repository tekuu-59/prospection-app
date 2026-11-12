// Cloudflare Pages (mode avancé) : sert l'app et une seule route d'API, /api/sync.
// Réglages à faire dans Cloudflare : base D1 liée sous le nom DB, secret APP_PASSWORD. Voir README.md.
const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

// Comparaison de mots de passe sans fuite de timing : on compare des empreintes de même taille.
async function same(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map(async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))));
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const KINDS = new Set(['day', 'contact', 'jour']);
const valid = (c) =>
  c && typeof c.id === 'string' && c.id.length <= 200 && KINDS.has(c.kind) &&
  typeof c.data === 'string' && c.data.length <= 100000 && Number.isFinite(c.updated);

// Vérifie le mot de passe ; renvoie une Response d'erreur, ou null si tout va bien.
async function refuse(request, env) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  if (!env.APP_PASSWORD) return json({ error: 'not_configured' }, 503);
  const auth = (request.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  // shortcut: pas de limitation du nombre d'essais, un mot de passe long suffit ; ajouter une règle de rate limiting Cloudflare si besoin
  return (await same(auth, env.APP_PASSWORD)) ? null : json({ error: 'unauthorized' }, 401);
}

const text = (v, n) => String(v ?? '').slice(0, n);
const num = (v) => (Number.isFinite(+v) ? +v : 0);

// Relaie un jour de prospection vers le script Google du tableau de bord (URL et jeton en secrets Cloudflare).
async function sheet(request, env) {
  const no = await refuse(request, env);
  if (no) return no;
  if (!env.SHEET_SCRIPT_URL || !env.SHEET_TOKEN) return json({ error: 'not_configured' }, 503);
  let b;
  try { b = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  if (!b || !/^\d{4}-\d{2}-\d{2}$/.test(b.date ?? '')) return json({ error: 'bad_date' }, 400);
  const payload = {
    token: env.SHEET_TOKEN,
    date: b.date,
    minutes: num(b.minutes), contacts: num(b.contacts), r1: num(b.r1), r2: num(b.r2),
    zones: (Array.isArray(b.zones) ? b.zones : []).slice(0, 50).map((z) => text(z, 100)),
    clients: (Array.isArray(b.clients) ? b.clients : []).slice(0, 200).map((c) => ({
      client: text(c.client, 200), commentaire: text(c.commentaire, 2000), statut: text(c.statut, 2), quand: text(c.quand, 16),
    })),
  };
  let res;
  try {
    // Apps Script répond par une redirection : fetch la suit (POST puis GET), comme attendu
    res = await fetch(env.SHEET_SCRIPT_URL, { method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), redirect: 'follow' });
  } catch { return json({ error: 'unreachable' }, 502); }
  try { return json(JSON.parse(await res.text())); } catch { return json({ error: 'bad_response' }, 502); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/sheet') return sheet(request, env);
    if (url.pathname !== '/api/sync') return env.ASSETS.fetch(request);
    // Diagnostic : ouvrir /api/sync dans un navigateur indique ce qui est configuré (jamais les valeurs)
    if (request.method === 'GET') return json({ worker: true, db: !!env.DB, password: !!env.APP_PASSWORD, sheet: !!(env.SHEET_SCRIPT_URL && env.SHEET_TOKEN) });
    if (!env.DB) return json({ error: 'not_configured' }, 503);
    const no = await refuse(request, env);
    if (no) return no;

    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
    const since = Number(body.since) || 0;
    const now = Date.now();
    const changes = (Array.isArray(body.changes) ? body.changes : []).filter(valid).slice(0, 2000);

    // Le plus récent gagne : une modification plus ancienne que celle déjà enregistrée est ignorée.
    const up = changes.map((c) =>
      env.DB.prepare(
        `INSERT INTO records (id, kind, data, updated, deleted, rev) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, data = excluded.data, updated = excluded.updated,
           deleted = excluded.deleted, rev = excluded.rev WHERE excluded.updated >= records.updated`,
      ).bind(c.id, c.kind, c.data, c.updated, c.deleted ? 1 : 0, now),
    );
    if (up.length) await env.DB.batch(up);

    // shortcut: 5000 enregistrements par réponse, largement assez pour un usage perso ; paginer au-delà
    const { results } = await env.DB.prepare(
      'SELECT id, kind, data, updated, deleted FROM records WHERE rev > ? ORDER BY rev LIMIT 5000',
    ).bind(since).all();
    return json({ now, records: results });
  },
};
