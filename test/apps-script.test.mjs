import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Fausse feuille Google : une grille de cellules et les quelques méthodes utilisées par le script.
class Sheet {
  constructor(name, grid, maxRows = 80) { this.name = name; this.grid = grid; this.max = maxRows; }
  getName() { return this.name; }
  getMaxRows() { return this.max; }
  insertRowsAfter(after, n) { this.max += n; }
  getDataRange() { return { getValues: () => this.grid.map((r) => r.slice()) }; }
  getRange(row, col) {
    const sh = this;
    return {
      setValue(v) { while (sh.grid.length < row) sh.grid.push([]); const r = sh.grid[row - 1]; while (r.length < col) r.push(''); r[col - 1] = v; sh.last = [row, col]; },
      setNumberFormat(f) { (sh.formats ??= {})[`${row},${col}`] = f; },
    };
  }
}
export { Sheet, mois, projets };
const ctx = vm.createContext({
  Utilities: { formatDate: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` },
});
const { envoyer: envoyerBrut, lieuDe, weekOfMonth } = vm.runInContext(readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8') + '\n;({ envoyer, lieuDe, weekOfMonth })', ctx);
const envoyer = (ss, d) => JSON.parse(JSON.stringify(envoyerBrut(ss, d))); // objets du script -> objets ordinaires
const fake = (sheets) => ({ getSheets: () => sheets, getSpreadsheetTimeZone: () => 'Europe/Paris' });

// Onglet du mois, comme sur la capture : titres ligne 4, blocs 5-12, 14-18, 20-24, 26-30, lignes de synthèse entre les deux.
function mois(name = 'Novembre 2026') {
  const g = Array.from({ length: 34 }, () => Array(10).fill(''));
  g[3] = ['', '', 'Date', 'Type', 'Lieu', 'Durée (mn)', 'Contacts', 'R1', 'R2', 'Rendez-vous\npris'];
  for (const r of [13, 19, 25, 31]) g[r - 1][3] = 'SYNTHESE HEBDO ▶';
  g[32][3] = "1 jour d'activité ce mois ▶";
  return new Sheet(name, g);
}
function projets() {
  const g = Array.from({ length: 4 }, () => Array(11).fill(''));
  g[3] = ['', 'Date', 'Nom du\nProjet', 'Contact. Nom Fonction Mail Téléphone', 'Pour quand ?', 'R', 'Type de besoin', 'Besoin', 'Produits possibles', 'Date de\nrendez-vous', 'Budget ?'];
  return new Sheet('Projets', g, 60);
}
const jour = (o = {}) => ({ date: '2026-11-10', minutes: 175, contacts: 5, r1: 1, r2: 1, zones: ['Z3'], clients: [], ...o });

test('semaine du mois et lieu', () => {
  assert.equal(weekOfMonth(2026, 11, 1), 0); // dimanche 1er novembre
  assert.equal(weekOfMonth(2026, 11, 2), 1);
  assert.equal(weekOfMonth(2026, 11, 10), 2);
  assert.equal(lieuDe(['Z3']), 'Z3');
  assert.equal(lieuDe(['z 12']), 'Z12');
  assert.equal(lieuDe(['Z17']), '');
  assert.equal(lieuDe(['Z1', 'Z2']), '');
  assert.equal(lieuDe(['Gare']), '');
});

test('écrit la ligne du jour dans la bonne semaine, sans doublon au renvoi', () => {
  const m = mois(), ss = fake([new Sheet('Modèle Prospection', []), m, projets()]);
  let r = envoyer(ss, jour());
  assert.equal(r.ok, true);
  assert.deepEqual([r.jour.tab, r.jour.row, r.jour.action], ['Novembre 2026', 20, 'ajouté']); // semaine 3 : bloc 20-24
  assert.deepEqual(m.grid[19].slice(3), ['Prospection', 'Z3', 175, 5, 1, 1, 1]);
  assert.equal(ymd(m.grid[19][2]), '2026-11-10');
  assert.equal(m.formats['20,3'], 'dd/mm/yyyy');
  r = envoyer(ss, jour({ minutes: 200 })); // renvoi : même ligne mise à jour
  assert.deepEqual([r.jour.row, r.jour.action], [20, 'mis à jour']);
  assert.equal(m.grid[19][5], 200);
  r = envoyer(ss, jour({ date: '2026-11-11', zones: ['Gare'] })); // lendemain : ligne suivante, lieu laissé vide
  assert.equal(r.jour.row, 21);
  assert.equal(m.grid[20][4], '');
  for (const row of [13, 19, 25]) assert.equal(m.grid[row - 1][3], 'SYNTHESE HEBDO ▶'); // lignes de synthèse intactes
});
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

test('bloc plein : on passe au bloc suivant ; onglet du mois absent : erreur claire', () => {
  const m = mois();
  for (let r = 20; r <= 24; r++) m.grid[r - 1][2] = '01/11/2026'; // semaine 3 pleine
  const ss = fake([m]);
  assert.equal(envoyer(ss, jour()).jour.row, 26);
  const sans = envoyer(fake([new Sheet('Décembre', [])]), jour());
  assert.equal(sans.ok, false);
  assert.match(sans.jourErreur, /Onglet du mois introuvable.*novembre/);
});

test('onglet Projets : R1 avec date, R2 sans date, mise à jour sans doublon', () => {
  const p = projets(), ss = fake([mois(), p]);
  const clients = [
    { client: 'Garage Dupont', commentaire: 'Veut une enseigne', statut: 'r1', quand: '2026-11-12T14:30' },
    { client: 'Boulangerie Martin', commentaire: '', statut: 'r2', quand: '' },
    { client: 'Pas de suite', commentaire: 'x', statut: '', quand: '' },
  ];
  let r = envoyer(ss, jour({ clients }));
  assert.deepEqual(r.projets.map((x) => [x.nom, x.row, x.action]), [['Garage Dupont', 5, 'ajouté'], ['Boulangerie Martin', 6, 'ajouté']]);
  assert.deepEqual([p.grid[4][5], p.grid[4][7]], ['R1', 'Veut une enseigne']);
  assert.equal(p.grid[4][9].getHours(), 14);
  assert.equal(p.formats['5,10'], 'dd/mm/yyyy HH:mm');
  assert.deepEqual(p.grid[5].slice(5, 6), ['R2']);
  assert.equal(p.grid[5][9], undefined); // R2 sans date : pas de date de rendez-vous
  r = envoyer(ss, jour({ clients: [{ ...clients[1], statut: 'r1', quand: '2026-11-13T09:00' }] }));
  assert.deepEqual([r.projets[0].row, r.projets[0].action], [6, 'mis à jour']);
  assert.equal(p.grid[5][5], 'R1');
});

test('colonnes déplacées : retrouvées par leurs titres ; titres manquants : erreur', () => {
  const m = mois();
  m.grid[3] = ['Date', 'Type', 'Lieu', 'Durée (mn)', 'Contacts', 'R1', 'R2', 'Rendez-vous pris'].concat(['', '']);
  for (const r of [13, 19, 25, 31]) m.grid[r - 1][3] = 'SYNTHESE HEBDO ▶';
  assert.equal(envoyer(fake([m]), jour()).ok, true);
  assert.equal(m.grid[19][3], 175);
  m.grid[3] = ['x', 'y'];
  assert.match(envoyer(fake([m]), jour()).jourErreur, /titres introuvable/i);
});
