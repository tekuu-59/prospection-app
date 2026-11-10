import { buildXlsx, XLSX_MIME } from './xlsx.js';
import { parseCard } from './parse-card.js';
import { read, write } from './store.js';
import { createSync } from './sync.js';
import { computeStats, tournee } from './stats.js';
import { formatDuree } from './duree.js';

const $ = (id) => document.getElementById(id);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const frDate = (iso) => iso.split('-').reverse().join('/');
const frWhen = (q) => `${frDate(q.slice(0, 10))} ${q.slice(11, 16)}`;
const asDate = (iso) => new Date(`${iso}T00:00:00Z`);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids);
  return n;
};

// ---------- données ----------
let days = read('prospection', []).map((d) => ({ date: d.date, zone: d.zone, portes: d.portes, pos: d.pos, clients: d.clients ?? [] })); // { date, zone, portes, pos?: { lat, lng }, clients: [{ client, commentaire, statut: '' | 'r1' | 'r2', quand, pos? }] }
let jours = read('jours', []);
let contacts = read('contacts', []).map((c) => ({ ...c, id: c.id ?? crypto.randomUUID() })); // { id, societe, prenom, nom, email, telephone, siteweb, adresse, date }
const save = () => {
  if (!write('prospection', days) || !write('contacts', contacts) || !write('jours', jours)) toast('⚠️ Stockage plein ou bloqué : exporte tes données');
  sync.schedule();
};
navigator.storage?.persist?.();

let toastTimer;
function toast(msg) {
  $('toast').textContent = msg;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2600);
}

function download(bytes, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: XLSX_MIME }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// ---------- sauvegarde en ligne ----------
const records = () => {
  const m = new Map();
  for (const d of days) m.set(`d:${d.date}|${d.zone}`, { kind: 'day', data: d });
  for (const c of contacts) m.set(`c:${c.id}`, { kind: 'contact', data: c });
  for (const j of jours) m.set(`j:${j.date}`, { kind: 'jour', data: j });
  return m;
};
function applyRemote(list) {
  for (const { id, kind, data } of list) {
    if (kind === 'day') {
      const key = id.slice(2);
      days = days.filter((d) => `${d.date}|${d.zone}` !== key);
      if (data) days.push({ clients: [], ...data });
    } else if (kind === 'jour') {
      jours = jours.filter((j) => `j:${j.date}` !== id);
      if (data) jours.push(data);
    } else {
      contacts = contacts.filter((c) => `c:${c.id}` !== id);
      if (data) contacts.push(data);
    }
  }
  write('prospection', days);
  write('contacts', contacts);
  write('jours', jours);
  renderProspection();
  renderContacts();
  if (!$('screen-stats').hidden) renderStats();
}
const hhmm = (t) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const sync = createSync({
  records,
  apply: applyRemote,
  onStatus(state, detail) {
    const text = {
      local: 'Mode local : aucun serveur de sauvegarde détecté',
      unconfigured: '☁️ Serveur trouvé, mais la base ou le mot de passe n\'est pas configuré dans Cloudflare',
      login: '☁️ Saisis le mot de passe pour activer la sauvegarde en ligne',
      'bad-password': '☁️ Mot de passe incorrect',
      ok: `☁️ Sauvegardé en ligne · ${detail ? hhmm(detail) : ''}`,
      offline: `☁️ En attente de réseau${detail ? ` · ${detail} modification(s)` : ''}`,
      syncing: '☁️ Synchronisation…',
    }[state];
    $('sync-status').textContent = text;
    $('sync-form').hidden = !['login', 'bad-password'].includes(state);
    $('sync-now').hidden = !['ok', 'offline'].includes(state);
  },
});
$('sync-now').onclick = () => sync.run();
$('sync-form').onsubmit = (ev) => {
  ev.preventDefault();
  write('syncPw', $('sync-pw').value);
  $('sync-pw').value = '';
  sync.run();
};
document.addEventListener('visibilitychange', () => { if (!document.hidden) sync.schedule(500); });

// ---------- onglets ----------
const TABS = [['tab-prospection', 'screen-prospection'], ['tab-map', 'screen-map'], ['tab-stats', 'screen-stats'], ['tab-cards', 'screen-cards']];
for (const [tab, screen] of TABS) {
  $(tab).onclick = () => {
    for (const [t, s] of TABS) {
      $(t).classList.toggle('on', t === tab);
      $(s).hidden = s !== screen;
    }
    if (screen === 'screen-map') showMap();
    if (screen === 'screen-stats') renderStats();
  };
}

// ---------- position GPS ----------
// Meilleur effort : null si refusée, indisponible ou trop longue (8 s).
const getPos = () =>
  new Promise((ok) => {
    if (!navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }),
      () => ok(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  });

// Nom de rue + commune via OpenStreetMap (Nominatim) ; la position part vers ce service.
async function streetName({ lat, lng }) {
  const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&accept-language=fr&lat=${lat}&lon=${lng}`);
  const a = (await r.json()).address ?? {};
  return [a.road ?? a.pedestrian ?? a.suburb, a.city ?? a.town ?? a.village].filter(Boolean).join(', ');
}

// ---------- prospection ----------
$('zone').value = read('zone', '');
const zone = () => $('zone').value.trim();
const current = () => days.find((e) => e.date === today() && e.zone === zone());
const entryFor = (date, z) => {
  let e = days.find((d) => d.date === date && d.zone === z);
  if (!e) days.push((e = { date, zone: z, portes: 0, clients: [] }));
  return e;
};
const entry = () => entryFor(today(), zone());

// ---------- durée de prospection du jour (saisie à la main) ----------
// jours : [{ date, minutes }], une durée par jour
const minutesOf = (date) => jours.find((j) => j.date === date)?.minutes ?? 0;
const count = (rows, statut) => rows.reduce((s, r) => s + r.clients.filter((c) => c.statut === statut).length, 0);
const STATUT = { r1: 'R1 · rendez-vous', r2: 'R2 · à repasser' };

function renderProspection() {
  const e = current();
  $('portes').textContent = e?.portes ?? 0;
  const min = minutesOf(today());
  $('duree-h').value = Math.floor(min / 60);
  $('duree-m').value = min % 60;
  $('r1').textContent = e ? count([e], 'r1') : 0;
  $('r2').textContent = e ? count([e], 'r2') : 0;
  $('client-list').replaceChildren(...(e?.clients ?? []).map((c, i) => {
    const del = el('button', { textContent: '🗑', ariaLabel: 'Supprimer ce client' });
    del.onclick = () => { e.clients.splice(i, 1); save(); renderProspection(); };
    const tag = c.statut ? `${STATUT[c.statut]}${c.quand ? ' · ' + frWhen(c.quand) : ''}` : '';
    return el('li', {}, el('div', { className: 'main' },
      el('b', { textContent: c.client || 'Sans nom' }),
      ...(tag ? [el('small', { textContent: tag })] : []),
      ...(c.commentaire ? [el('small', { textContent: c.commentaire })] : [])), del);
  }));
  $('zones').replaceChildren(...[...new Set(days.map((d) => d.zone).filter(Boolean))].map((z) => el('option', { value: z })));

  const byDay = Object.groupBy ? Object.groupBy(days, (d) => d.date) : days.reduce((m, d) => ((m[d.date] ??= []).push(d), m), {});
  const items = Object.keys(byDay).sort().reverse().map((date) => {
    const rows = byDay[date];
    const del = el('button', { textContent: '🗑', ariaLabel: `Supprimer le ${frDate(date)}` });
    del.onclick = () => {
      if (confirm(`Supprimer toutes les données du ${frDate(date)} ?`)) {
        days = days.filter((d) => d.date !== date);
        save();
        renderProspection();
      }
    };
    return el('li', {}, el('div', { className: 'main' },
      el('b', { textContent: `${frDate(date)} · ${rows.reduce((s, r) => s + r.portes, 0)} portes` }),
      el('small', { textContent: `R1 ${count(rows, 'r1')} · R2 ${count(rows, 'r2')}${minutesOf(date) ? ` · ${formatDuree(minutesOf(date))}` : ''} · ${rows.map((r) => `${r.zone || 'sans zone'} (${r.portes})`).join(', ')}` }),
      el('small', { textContent: `${rows.reduce((s, r) => s + r.clients.length, 0)} client(s) noté(s)` })), del);
  });
  $('history').replaceChildren(...(items.length ? items : [el('li', { className: 'empty', textContent: 'Rien pour le moment' })]));
}

$('push').onclick = () => {
  entry().portes++;
  save();
  renderProspection();
  navigator.vibrate?.(15);
};
$('undo').onclick = () => {
  const e = current();
  if (e?.portes) { e.portes--; save(); renderProspection(); }
};

const cf = $('client-form');
const syncQuand = () => {
  const st = cf.elements.statut.value;
  $('quand-label').hidden = !st;
  $('quand-text').textContent = st === 'r1' ? 'Date et heure du rendez-vous' : 'À repasser le (facultatif)';
  cf.elements.quand.required = st === 'r1';
};
cf.onchange = syncQuand;
let pendingPos = null;
$('add-client').onclick = () => {
  cf.hidden = false;
  syncQuand();
  cf.elements.client.focus();
  pendingPos = null;
  getPos().then((p) => { pendingPos = p; });
};
$('client-cancel').onclick = () => { cf.hidden = true; };
cf.onsubmit = (ev) => {
  ev.preventDefault();
  const f = cf.elements;
  const c = { client: f.client.value.trim(), commentaire: f.commentaire.value.trim(), statut: f.statut.value, quand: f.statut.value ? f.quand.value : '', pos: pendingPos ?? undefined };
  if (!c.client && !c.commentaire) return toast('Note au moins le client ou un commentaire');
  entry().clients.push(c);
  save();
  cf.reset();
  cf.hidden = true;
  renderProspection();
};
$('locate').onclick = async () => {
  $('locate').disabled = true;
  try {
    const pos = await getPos();
    if (!pos) return toast('Position indisponible : autorise la localisation');
    if (!zone()) {
      try { $('zone').value = await streetName(pos); write('zone', $('zone').value); } catch { toast('Nom de rue indisponible (réseau ?)'); }
    }
    entry().pos = pos;
    save();
    renderProspection();
    toast(zone() ? 'Position enregistrée pour cette zone' : 'Position enregistrée : donne un nom à la zone');
  } finally {
    $('locate').disabled = false;
  }
};
$('zone').oninput = () => { write('zone', $('zone').value); renderProspection(); };
// Menus déroulants heures / minutes (roulette sur téléphone), comme pour l'heure d'un rendez-vous
$('duree-h').replaceChildren(...Array.from({ length: 17 }, (_, h) => el('option', { value: h, textContent: h })));
$('duree-m').replaceChildren(...Array.from({ length: 60 }, (_, m) => el('option', { value: m, textContent: String(m).padStart(2, '0') })));
$('duree-h').onchange = $('duree-m').onchange = () => {
  const m = Number($('duree-h').value) * 60 + Number($('duree-m').value);
  jours = jours.filter((j) => j.date !== today());
  if (m) jours.push({ date: today(), minutes: m });
  save();
  renderProspection();
};

$('export-prospection').onclick = () => {
  if (!days.length) return toast('Rien à exporter');
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date) || a.zone.localeCompare(b.zone));
  const lignes = sorted.map((d) => [asDate(d.date), d.zone, d.portes, count([d], 'r1'), count([d], 'r2')]);
  const dates = [...new Set([...days.map((d) => d.date), ...jours.map((j) => j.date)])].sort();
  const parJour = dates.map((date) => {
    const rows = days.filter((d) => d.date === date);
    return [asDate(date), minutesOf(date), rows.reduce((s, d) => s + d.portes, 0), rows.reduce((s, d) => s + d.clients.length, 0), count(rows, 'r1'), count(rows, 'r2')];
  });
  const clients = sorted.flatMap((d) => d.clients.map((c) => [asDate(d.date), d.zone, c.client, c.statut ? STATUT[c.statut] : '', c.quand ? frWhen(c.quand) : '', c.commentaire, c.pos ? mapsLink(c.pos) : '']));
  download(buildXlsx([
    { name: 'Prospection', columns: [{ title: 'Date', width: 12 }, { title: 'Zone', width: 28 }, { title: 'Portes', width: 9 }, { title: 'R1', width: 7 }, { title: 'R2', width: 7 }], rows: lignes },
    { name: 'Jours', columns: [{ title: 'Date', width: 12 }, { title: 'Durée (min)', width: 12 }, { title: 'Portes', width: 9 }, { title: 'Clients notés', width: 14 }, { title: 'R1', width: 7 }, { title: 'R2', width: 7 }], rows: parJour },
    { name: 'Clients', columns: [{ title: 'Date', width: 12 }, { title: 'Zone', width: 28 }, { title: 'Client', width: 30 }, { title: 'Statut', width: 18 }, { title: 'RDV / à repasser le', width: 20 }, { title: 'Commentaire', width: 60 }, { title: 'Lien carte', width: 40 }], rows: clients },
  ]), `prospection-${today()}.xlsx`);
};

// ---------- carte (Leaflet + OpenStreetMap) ----------
let leafletReady, map, layer, mapAll = false;
function loadLeaflet() {
  leafletReady ??= new Promise((ok, ko) => {
    if (window.L) return ok(window.L);
    const css = el('link', { rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css' });
    // shortcut: pas d'intégrité SRI ni de copie locale, à ajouter si l'app sort de l'usage perso
    const js = el('script', { src: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js' });
    js.onload = () => ok(window.L);
    js.onerror = () => { leafletReady = null; ko(new Error('offline')); };
    document.head.append(css, js);
  });
  return leafletReady;
}
const COULEUR = { r1: '#1a9850', r2: '#f59e0b', '': '#3b82f6' };
const mapsLink = (p) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;

async function showMap() {
  $('map-status').textContent = '';
  let L;
  try { L = await loadLeaflet(); } catch { $('map-status').textContent = 'La carte demande une connexion.'; return; }
  if (!map) {
    map = L.map('map').setView([49.027, 1.151], 12); // Évreux, tant qu'aucun point n'est connu
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© contributeurs OpenStreetMap' }).addTo(map);
    layer = L.layerGroup().addTo(map);
  }
  map.invalidateSize();
  layer.clearLayers();
  const bounds = [];
  const popup = (title, ...lines) => el('div', {}, el('b', { textContent: title }), ...lines.filter(Boolean).flatMap((t) => [el('br'), document.createTextNode(t)]));
  const link = (p) => el('a', { href: mapsLink(p), target: '_blank', rel: 'noopener', textContent: 'Ouvrir dans Maps' });
  const zoneBox = (d) => {
    const box = popup(d.zone || 'Zone', `${frDate(d.date)} · ${d.portes} portes`);
    box.append(el('br'), link(d.pos));
    return box;
  };
  for (const d of days.filter((d) => mapAll || d.date === today())) {
    if (d.pos) {
      bounds.push([d.pos.lat, d.pos.lng]);
      L.circleMarker([d.pos.lat, d.pos.lng], { radius: 14, color: '#B01F30', weight: 3, fill: false })
        .bindPopup(zoneBox(d))
        .addTo(layer);
    }
    for (const c of d.clients.filter((c) => c.pos)) {
      bounds.push([c.pos.lat, c.pos.lng]);
      const box = popup(c.client || 'Sans nom', c.statut ? `${c.statut === 'r1' ? 'R1 · rendez-vous' : 'R2 · à repasser'}${c.quand ? ' · ' + frWhen(c.quand) : ''}` : '', c.commentaire, `${frDate(d.date)} · ${d.zone}`);
      box.append(el('br'), link(c.pos));
      L.circleMarker([c.pos.lat, c.pos.lng], { radius: 9, color: '#fff', weight: 2, fillColor: COULEUR[c.statut], fillOpacity: 1 }).bindPopup(box).addTo(layer);
    }
  }
  if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 });
  else $('map-status').textContent = mapAll ? 'Aucun point : autorise la localisation en ajoutant un client, ou touche « 📍 Utiliser ma position ».' : 'Rien aujourd\'hui. Essaie « Tout ».';
}
for (const [id, all] of [['map-today', false], ['map-all', true]]) {
  $(id).onclick = () => {
    mapAll = all;
    $('map-today').classList.toggle('on', !all);
    $('map-all').classList.toggle('on', all);
    showMap();
  };
}

// ---------- statistiques et tournée ----------
let period = null;
const pct = (x) => `${x.toFixed(1).replace('.', ',')} %`;
function renderStats() {
  const s = computeStats(days, today(), period, jours);
  const kpi = (v, label) => el('div', { className: 'kpi' }, el('b', { textContent: v }), el('span', { textContent: label }));
  $('kpis').replaceChildren(kpi(s.portes, 'portes'), kpi(s.clients, 'clients notés'), kpi(`${s.r1}`, 'R1 · rendez-vous'), kpi(`${s.r2}`, 'R2 · à repasser'), kpi(`${Math.floor(s.duree / 60)}h${String(s.duree % 60).padStart(2, '0')}`, 'temps de prospection'), kpi(s.portesParHeure ? Math.round(s.portesParHeure) : '–', 'portes par heure'));
  $('kpi-note').textContent = s.portes ? `Taux de rendez-vous : ${pct(s.tauxR1)}${s.portesParR1 ? ` · 1 rendez-vous toutes les ${Math.round(s.portesParR1)} portes` : ''}` : 'Pas encore de données sur cette période.';

  const last = s.parJour.slice(-14);
  const max = Math.max(1, ...last.map((j) => j.portes));
  $('bars').replaceChildren(...last.map((j) => el('div', { className: 'bar', title: `${frDate(j.date)} : ${j.portes} portes, ${j.r1} R1` },
    el('em', { textContent: j.portes }), el('i', { style: `height:${Math.round((100 * j.portes) / max)}%` }), document.createTextNode(j.date.slice(8)))));
  if (!last.length) $('bars').replaceChildren(el('span', { className: 'empty', textContent: 'Rien pour le moment' }));

  $('by-zone').replaceChildren(...(s.parZone.length ? s.parZone : [null]).map((z) => z
    ? el('li', {}, el('div', { className: 'main' }, el('b', { textContent: z.zone }), el('small', { textContent: `${z.portes} portes · R1 ${z.r1} · R2 ${z.r2}` })),
        el('span', { className: 'tag', textContent: z.portes ? pct((100 * z.r1) / z.portes) : '' }))
    : el('li', { className: 'empty', textContent: 'Rien pour le moment' })));

  const t = tournee(days, today());
  $('tour').replaceChildren(...(t.length ? t : [null]).map((z) => {
    if (!z) return el('li', { className: 'empty', textContent: 'Aucune zone enregistrée' });
    const go = el('button', { className: 'go', textContent: 'Reprendre' });
    go.onclick = () => {
      $('zone').value = z.zone;
      write('zone', z.zone);
      renderProspection();
      $('tab-prospection').click();
    };
    const quand = z.ilYa === 0 ? "aujourd'hui" : z.ilYa === 1 ? 'hier' : `il y a ${z.ilYa} j`;
    return el('li', {}, el('div', { className: 'main' }, el('b', { textContent: z.zone }),
      el('small', { textContent: `${quand} · ${z.portes} portes en ${z.passages} passage(s)` })), go);
  }));
}
for (const b of document.querySelectorAll('.chips [data-p]')) {
  b.onclick = () => {
    period = b.dataset.p ? Number(b.dataset.p) : null;
    for (const o of document.querySelectorAll('.chips [data-p]')) o.classList.toggle('on', o === b);
    renderStats();
  };
}

// ---------- effacer les données ----------
$('reset').onclick = () => {
  if (prompt('Effacer TOUTES les données (portes, clients, contacts, durées) ?\nSi la sauvegarde en ligne est active, elles seront aussi effacées en ligne.\nTape EFFACER pour confirmer.') !== 'EFFACER') return;
  days = [];
  jours = [];
  contacts = [];
  write('zone', '');
  $('zone').value = '';
  save();
  renderProspection();
  renderContacts();
  if (!$('screen-stats').hidden) renderStats();
  toast('Données effacées');
};

// ---------- envoi vers le tableau de bord Google ----------
$('send-date').value = today();
$('send-sheet').onclick = async () => {
  const date = $('send-date').value || today();
  const rows = days.filter((d) => d.date === date);
  const out = (t) => { $('send-status').textContent = t; };
  if (!rows.length && !minutesOf(date)) return out('Rien à envoyer pour ce jour.');
  const pw = read('syncPw', '');
  if (!pw) return out('Active d\'abord la sauvegarde en ligne (mot de passe en bas de l\'écran).');
  const payload = {
    date,
    minutes: minutesOf(date),
    contacts: rows.reduce((s, d) => s + d.clients.length, 0), // contacts = clients notés
    r1: count(rows, 'r1'),
    r2: count(rows, 'r2'),
    zones: rows.map((d) => d.zone).filter(Boolean),
    clients: rows.flatMap((d) => d.clients),
  };
  $('send-sheet').disabled = true;
  out('Envoi…');
  try {
    const res = await fetch('/api/sheet', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${pw}` }, body: JSON.stringify(payload) });
    if (res.status === 401) return out('Mot de passe refusé : reconnecte la sauvegarde en ligne.');
    if (res.status === 503 || res.status === 404 || res.status === 405 || res.status === 501) return out('Envoi vers Google non configuré (voir DEPLOIEMENT.md).');
    const r = await res.json().catch(() => ({}));
    const lines = [];
    if (r.jour) lines.push(`Onglet « ${r.jour.tab} », ligne ${r.jour.row} (${r.jour.action})`);
    if (r.jourErreur) lines.push(`⚠️ Jour : ${r.jourErreur}`);
    if (r.projets) lines.push(`Projets : ${r.projets.map((p) => `${p.nom} (ligne ${p.row}, ${p.action})`).join(', ')}`);
    if (r.projetsErreur) lines.push(`⚠️ Projets : ${r.projetsErreur}`);
    if (r.error) lines.push(`⚠️ ${r.error === 'unreachable' || r.error === 'bad_response' ? 'Le script Google ne répond pas correctement' : r.error}`);
    out(`${r.ok ? '✅ Envoyé · ' : ''}${lines.join(' · ') || 'Réponse inattendue.'}`);
  } catch {
    out('Pas de réseau : réessaie plus tard.');
  } finally {
    $('send-sheet').disabled = false;
  }
};

// ---------- cartes de visite ----------
let tesseractReady;
function loadTesseract() {
  tesseractReady ??= new Promise((ok, ko) => {
    if (window.Tesseract) return ok(window.Tesseract);
    const s = document.createElement('script');
    // shortcut: pas d'intégrité SRI ni de copie locale, à ajouter si l'app sort de l'usage perso
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.onload = () => ok(window.Tesseract);
    s.onerror = () => { tesseractReady = null; ko(new Error('offline')); };
    document.head.append(s);
  });
  return tesseractReady;
}

// Réduit la photo (≈1600 px) : plus rapide pour l'OCR, et la photo n'est jamais stockée.
async function toCanvas(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

$('photo').onchange = async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  $('card-form').hidden = true;
  try {
    $('status').textContent = 'Chargement du lecteur de texte…';
    const T = await loadTesseract();
    const canvas = await toCanvas(file);
    $('status').textContent = 'Lecture de la carte… (la 1re fois, c\'est plus long)';
    const worker = await T.createWorker('fra+eng');
    let text;
    try { ({ data: { text } } = await worker.recognize(canvas)); } finally { await worker.terminate(); }
    fillForm(parseCard(text), text);
    $('status').textContent = 'Vérifie les champs, corrige si besoin, puis enregistre.';
  } catch (e) {
    $('status').textContent = e.message === 'offline'
      ? 'Connexion nécessaire pour la première lecture. Réessaie avec du réseau.'
      : 'Lecture impossible. Réessaie avec une photo plus nette, bien éclairée.';
  }
};

const FIELDS = ['societe', 'prenom', 'nom', 'email', 'telephone', 'siteweb', 'adresse'];
function fillForm(card, rawText) {
  const f = $('card-form');
  for (const k of FIELDS) f.elements[k].value = card[k];
  $('raw').textContent = rawText;
  f.hidden = false;
}

$('cancel').onclick = () => { $('card-form').hidden = true; $('status').textContent = ''; };

$('card-form').onsubmit = (ev) => {
  ev.preventDefault();
  const f = ev.target.elements;
  const c = { id: crypto.randomUUID(), date: today() };
  for (const k of FIELDS) c[k] = f[k].value.trim();
  if (!c.email && !c.telephone && !c.nom) return toast('Renseigne au moins un nom, un e-mail ou un téléphone');
  if (c.email && contacts.some((x) => x.email === c.email.toLowerCase()) && !confirm('Cet e-mail est déjà dans la liste. L\'ajouter quand même ?')) return;
  c.email = c.email.toLowerCase();
  contacts.push(c);
  save();
  $('card-form').hidden = true;
  $('status').textContent = '';
  renderContacts();
  toast('Contact enregistré');
};

function renderContacts() {
  $('count').textContent = contacts.length ? `(${contacts.length})` : '';
  const items = contacts.map((c, i) => {
    const del = el('button', { textContent: '🗑', ariaLabel: 'Supprimer ce contact' });
    del.onclick = () => {
      if (confirm('Supprimer ce contact ?')) { contacts.splice(i, 1); save(); renderContacts(); }
    };
    return el('li', {}, el('div', { className: 'main' },
      el('b', { textContent: [c.prenom, c.nom].filter(Boolean).join(' ') || c.societe || c.email }),
      el('small', { textContent: [c.societe, c.email, c.telephone, c.siteweb].filter(Boolean).join(' · ') })), del);
  }).reverse();
  $('contacts').replaceChildren(...(items.length ? items : [el('li', { className: 'empty', textContent: 'Aucune carte pour le moment' })]));
}

$('export-contacts').onclick = () => {
  if (!contacts.length) return toast('Rien à exporter');
  const cols = [{ title: 'Société', width: 26 }, { title: 'Prénom', width: 16 }, { title: 'Nom', width: 16 }, { title: 'E-mail', width: 30 }, { title: 'Téléphone', width: 16 }, { title: 'Site web', width: 26 }, { title: 'Adresse', width: 40 }, { title: 'Date', width: 12 }];
  const rows = contacts.map((c) => [c.societe, c.prenom, c.nom, c.email, c.telephone, c.siteweb ?? '', c.adresse ?? '', asDate(c.date)]);
  download(buildXlsx([{ name: 'Contacts', columns: cols, rows }]), `contacts-${today()}.xlsx`);
};

renderProspection();
renderContacts();
sync.run();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
