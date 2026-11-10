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
let days = read('prospection', []).map((d) => ({ date: d.date, zone: d.zone, portes: d.portes, clients: d.clients ?? [] })); // { date, zone, portes, clients: [{ client, commentaire, statut: '' | 'r1' | 'r2', quand }] }
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
for (const [tab, screen] of [['tab-prospection', 'screen-prospection'], ['tab-cards', 'screen-cards']]) {
  $(tab).onclick = () => {
    for (const [t, s] of [['tab-prospection', 'screen-prospection'], ['tab-cards', 'screen-cards']]) {
      $(t).classList.toggle('on', t === tab);
      $(s).hidden = s !== screen;
    }
  };
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
$('add-client').onclick = () => { cf.hidden = false; syncQuand(); cf.elements.client.focus(); };
$('client-cancel').onclick = () => { cf.hidden = true; };
cf.onsubmit = (ev) => {
  ev.preventDefault();
  const f = cf.elements;
  const c = { client: f.client.value.trim(), commentaire: f.commentaire.value.trim(), statut: f.statut.value, quand: f.statut.value ? f.quand.value : '' };
  if (!c.client && !c.commentaire) return toast('Note au moins le client ou un commentaire');
  entry().clients.push(c);
  save();
  cf.reset();
  cf.hidden = true;
  renderProspection();
};
$('zone').oninput = () => { write('zone', $('zone').value); renderProspection(); };

$('export-prospection').onclick = () => {
  if (!days.length) return toast('Rien à exporter');
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date) || a.zone.localeCompare(b.zone));
  const jours = sorted.map((d) => [asDate(d.date), d.zone, d.portes, count([d], 'r1'), count([d], 'r2')]);
  const clients = sorted.flatMap((d) => d.clients.map((c) => [asDate(d.date), d.zone, c.client, c.statut ? STATUT[c.statut] : '', c.quand ? frWhen(c.quand) : '', c.commentaire]));
  download(buildXlsx([
    { name: 'Prospection', columns: [{ title: 'Date', width: 12 }, { title: 'Zone', width: 28 }, { title: 'Portes', width: 9 }, { title: 'R1', width: 7 }, { title: 'R2', width: 7 }], rows: jours },
    { name: 'Clients', columns: [{ title: 'Date', width: 12 }, { title: 'Zone', width: 28 }, { title: 'Client', width: 30 }, { title: 'Statut', width: 18 }, { title: 'RDV / à repasser le', width: 20 }, { title: 'Commentaire', width: 60 }], rows: clients },
  ]), `prospection-${today()}.xlsx`);
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
