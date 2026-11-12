// Script Google à coller dans le tableau de bord (Extensions > Apps Script). Mode d'emploi : README.md.
// Il reçoit un jour de prospection depuis l'app et :
//   1. ajoute une ligne « synthèse du jour » dans l'onglet du mois (dans le bloc de la bonne semaine) ;
//   2. ajoute ou met à jour une ligne dans l'onglet « Projets » pour chaque client en R1 ou R2.
// Les colonnes sont retrouvées par leurs titres : on peut les déplacer sans casser le script.
// Un même jour renvoyé deux fois met à jour les mêmes lignes, sans doublon.

var MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
var TYPE_ACTIVITE = 'Prospection'; // valeur de la colonne « Type »
var TZ = 'Europe/Paris';

function norm(v) {
  return String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// 2026-11-10 ou 10/11/2026 ou Date -> « 2026-11-10 » (sinon '')
function ymd(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  var s = String(v == null ? '' : v).trim(), m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[1] + '-' + m[2] + '-' + m[3];
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}

function asDate(dateStr, timeStr) {
  var p = dateStr.split('-'), t = timeStr ? timeStr.split(':') : [0, 0];
  return new Date(+p[0], +p[1] - 1, +p[2], +t[0], +t[1]);
}

// Retrouve la ligne d'en-têtes et la colonne de chaque titre. spec : { clé: '=exact' | '^début' } (texte sans accents ni majuscules)
function findHeader(values, spec) {
  for (var r = 0; r < Math.min(values.length, 25); r++) {
    var cols = {}, ok = true;
    for (var key in spec) {
      var want = spec[key], found = -1;
      for (var c = 0; c < values[r].length; c++) {
        var cell = norm(values[r][c]);
        if (want.charAt(0) === '=' ? cell === want.slice(1) : cell.indexOf(want.slice(1)) === 0) { found = c; break; }
      }
      if (found < 0) { ok = false; break; }
      cols[key] = found;
    }
    if (ok) return { row: r, cols: cols };
  }
  var titres = Object.keys(spec).map(function (k) { return spec[k].slice(1); }).join(', ');
  throw new Error('Ligne de titres introuvable (colonnes attendues : ' + titres + ')');
}

function findMonthSheet(ss, year, month) {
  var nom = MOIS[month - 1], hits = ss.getSheets().filter(function (s) {
    var n = norm(s.getName());
    return n.indexOf(nom) >= 0 && n.indexOf('modele') < 0;
  });
  if (!hits.length) return null;
  for (var i = 0; i < hits.length; i++) if (norm(hits[i].getName()).indexOf(String(year)) >= 0) return hits[i];
  return hits[0];
}

// Blocs de lignes entre deux lignes « SYNTHESE ». Renvoie des plages [première, dernière] en indices 0.
function findBlocks(values, headerRow) {
  var blocks = [], start = headerRow + 1;
  for (var r = headerRow + 1; r < values.length; r++) {
    var texte = norm(values[r].slice(0, 8).join(' '));
    if (texte.indexOf('synthese') >= 0) { blocks.push([start, r - 1]); start = r + 1; }
  }
  return blocks;
}

// Semaine du mois (0, 1, 2…) : lundi à dimanche, la semaine 0 est celle qui contient le 1er.
function weekOfMonth(year, month, day) {
  var offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  return Math.floor((day - 1 + offset) / 7);
}

function lieuDe(zones) {
  var z = (zones || []).filter(Boolean);
  var m = z.length === 1 && String(z[0]).trim().match(/^z\s*(\d{1,2})$/i);
  return m && +m[1] >= 1 && +m[1] <= 16 ? 'Z' + +m[1] : ''; // les lieux du tableau sont Z1 à Z16
}

function ecrireJour(ss, d) {
  var p = d.date.split('-'), year = +p[0], month = +p[1], day = +p[2];
  var sh = findMonthSheet(ss, year, month);
  if (!sh) throw new Error("Onglet du mois introuvable : crée l'onglet « " + MOIS[month - 1] + " » à partir du modèle");
  var values = sh.getDataRange().getValues();
  var h = findHeader(values, { date: '=date', type: '=type', lieu: '=lieu', duree: '^duree', contacts: '=contacts', r1: '=r1', r2: '=r2', rdv: '^rendez' });
  var blocks = findBlocks(values, h.row);
  if (!blocks.length) throw new Error("Lignes « SYNTHESE HEBDO » introuvables dans l'onglet « " + sh.getName() + " »");

  var row = -1, action = 'ajouté', r, b;
  for (b = 0; b < blocks.length && row < 0; b++) {
    for (r = blocks[b][0]; r <= blocks[b][1]; r++) if (ymd(values[r][h.cols.date]) === d.date) { row = r; action = 'mis à jour'; break; }
  }
  if (row < 0) {
    var first = Math.min(weekOfMonth(year, month, day), blocks.length - 1);
    var ordre = [];
    for (b = first; b < blocks.length; b++) ordre.push(b);
    for (b = first - 1; b >= 0; b--) ordre.push(b);
    for (var i = 0; i < ordre.length && row < 0; i++) {
      for (r = blocks[ordre[i]][0]; r <= blocks[ordre[i]][1]; r++) if (norm(values[r][h.cols.date]) === '') { row = r; break; }
    }
  }
  if (row < 0) throw new Error("Plus de ligne libre dans l'onglet « " + sh.getName() + " »");

  var set = function (col, v) { if (v !== '' && v != null) sh.getRange(row + 1, col + 1).setValue(v); };
  var date = sh.getRange(row + 1, h.cols.date + 1);
  date.setValue(asDate(d.date));
  date.setNumberFormat('dd/mm/yyyy');
  set(h.cols.type, TYPE_ACTIVITE);
  set(h.cols.lieu, lieuDe(d.zones));
  set(h.cols.duree, d.minutes || 0);
  set(h.cols.contacts, d.contacts || 0);
  set(h.cols.r1, d.r1 || 0);
  set(h.cols.r2, d.r2 || 0);
  set(h.cols.rdv, d.r1 || 0); // « Rendez-vous pris » = R1, à changer ici si besoin
  return { tab: sh.getName(), row: row + 1, action: action };
}

function ecrireProjets(ss, clients, dateStr) {
  var sh = ss.getSheets().filter(function (s) { return norm(s.getName()) === 'projets'; })[0];
  if (!sh) throw new Error("Onglet « Projets » introuvable");
  var values = sh.getDataRange().getValues();
  var h = findHeader(values, { date: '=date', nom: '^nom du', r: '=r', besoin: '=besoin', rdv: '^date de rendez' });
  var out = [];
  clients.forEach(function (c) {
    var nom = String(c.client || '').trim() || 'Sans nom';
    var row = -1, action = 'ajouté', r;
    for (r = h.row + 1; r < values.length; r++) {
      if (ymd(values[r][h.cols.date]) === dateStr && norm(values[r][h.cols.nom]) === norm(nom)) { row = r; action = 'mis à jour'; break; }
    }
    if (row < 0) {
      for (r = h.row + 1; r < values.length; r++) if (norm(values[r][h.cols.date]) === '' && norm(values[r][h.cols.nom]) === '') { row = r; break; }
      if (row < 0) row = values.length; // sous les lignes déjà remplies
    }
    if (row + 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), row + 1 - sh.getMaxRows());
    var set = function (col, v) { if (v !== '' && v != null) sh.getRange(row + 1, col + 1).setValue(v); };
    var date = sh.getRange(row + 1, h.cols.date + 1);
    date.setValue(asDate(dateStr));
    date.setNumberFormat('dd/mm/yyyy');
    set(h.cols.nom, nom);
    set(h.cols.r, c.statut === 'r2' ? 'R2' : 'R1');
    set(h.cols.besoin, c.commentaire);
    if (c.quand) {
      var cell = sh.getRange(row + 1, h.cols.rdv + 1);
      cell.setValue(asDate(c.quand.slice(0, 10), c.quand.slice(11, 16)));
      cell.setNumberFormat(c.quand.length > 10 ? 'dd/mm/yyyy HH:mm' : 'dd/mm/yyyy');
    }
    // garde à jour la copie locale pour que deux clients du même envoi n'aillent pas sur la même ligne
    while (values.length <= row) values.push([]);
    values[row][h.cols.date] = dateStr;
    values[row][h.cols.nom] = nom;
    out.push({ nom: nom, row: row + 1, action: action });
  });
  return out;
}

function envoyer(ss, d) {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) throw new Error('Date invalide');
  TZ = ss.getSpreadsheetTimeZone();
  var res = { ok: true };
  try { res.jour = ecrireJour(ss, d); } catch (e) { res.ok = false; res.jourErreur = String(e.message || e); }
  var projets = (d.clients || []).filter(function (c) { return c.statut === 'r1' || c.statut === 'r2'; });
  if (projets.length) {
    try { res.projets = ecrireProjets(ss, projets, d.date); } catch (e) { res.ok = false; res.projetsErreur = String(e.message || e); }
  }
  return res;
}

function reponse(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return reponse({ ok: true, info: 'Script de prospection en ligne' });
}

function doPost(e) {
  var lock = LockService.getScriptLock(), locked = false;
  try {
    lock.waitLock(20000);
    locked = true;
    var body = JSON.parse(e.postData.contents);
    var attendu = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!attendu || body.token !== attendu) return reponse({ ok: false, error: 'Jeton invalide' });
    return reponse(envoyer(SpreadsheetApp.getActiveSpreadsheet(), body));
  } catch (err) {
    return reponse({ ok: false, error: String(err.message || err) });
  } finally {
    if (locked) lock.releaseLock();
  }
}
