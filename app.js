import { buildXlsx, XLSX_MIME } from './xlsx.js';
import { parseCard } from './parse-card.js';
import { read, write } from './store.js';

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
let contacts = read('contacts', []); // { societe, prenom, nom, email, telephone, date }
const save = () => {
  if (!write('prospection', days) || !write('contacts', contacts)) toast('⚠️ Stockage plein ou bloqué : exporte tes données');
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

// ---------- onglets ----------
const TABS = [['tab-prospection', 'screen-prospection'], ['tab-map', 'screen-map'], ['tab-cards', 'screen-cards']];
for (const [tab, screen] of TABS) {
  $(tab).onclick = () => {
    for (const [t, s] of TABS) {
      $(t).classList.toggle('on', t === tab);
      $(s).hidden = s !== screen;
    }
    if (screen === 'screen-map') showMap();
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
const entry = () => {
  let e = current();
  if (!e) days.push((e = { date: today(), zone: zone(), portes: 0, clients: [] }));
  return e;
};
const count = (rows, statut) => rows.reduce((s, r) => s + r.clients.filter((c) => c.statut === statut).length, 0);
const STATUT = { r1: 'R1 · rendez-vous', r2: 'R2 · à repasser' };

function renderProspection() {
  const e = current();
  $('portes').textContent = e?.portes ?? 0;
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
      el('small', { textContent: `R1 ${count(rows, 'r1')} · R2 ${count(rows, 'r2')} · ${rows.map((r) => `${r.zone || 'sans zone'} (${r.portes})`).join(', ')}` }),
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

$('export-prospection').onclick = () => {
  if (!days.length) return toast('Rien à exporter');
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date) || a.zone.localeCompare(b.zone));
  const jours = sorted.map((d) => [asDate(d.date), d.zone, d.portes, count([d], 'r1'), count([d], 'r2')]);
  const clients = sorted.flatMap((d) => d.clients.map((c) => [asDate(d.date), d.zone, c.client, c.statut ? STATUT[c.statut] : '', c.quand ? frWhen(c.quand) : '', c.commentaire, c.pos ? mapsLink(c.pos) : '']));
  download(buildXlsx([
    { name: 'Prospection', columns: [{ title: 'Date', width: 12 }, { title: 'Zone', width: 28 }, { title: 'Portes', width: 9 }, { title: 'R1', width: 7 }, { title: 'R2', width: 7 }], rows: jours },
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
  const c = { date: today() };
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
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
