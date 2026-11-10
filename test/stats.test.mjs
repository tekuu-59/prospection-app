import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, tournee, daysBetween } from '../stats.js';

const cl = (statut) => ({ client: 'x', commentaire: '', statut, quand: '' });
const days = [
  { date: '2026-11-03', zone: 'Gare', portes: 40, clients: [cl('r1'), cl('r2'), cl('')] },
  { date: '2026-11-09', zone: 'Gare', portes: 20, clients: [cl('r1')] },
  { date: '2026-11-09', zone: 'Centre', portes: 30, clients: [] },
  { date: '2026-10-01', zone: 'Zone Nord', portes: 10, clients: [cl('r2')] },
];

test('jours entre deux dates, changement d\'heure compris', () => {
  assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2);
  assert.equal(daysBetween('2026-11-10', '2026-11-10'), 0);
});

test('totaux, taux et périodes', () => {
  const all = computeStats(days, '2026-11-10');
  assert.deepEqual([all.portes, all.r1, all.r2, all.clients], [100, 2, 2, 5]);
  assert.equal(all.tauxR1, 2);
  assert.equal(all.portesParR1, 50);
  const w = computeStats(days, '2026-11-10', 7); // 4 au 10 novembre : le 3 en est exclu
  assert.deepEqual([w.portes, w.r1], [50, 1]);
  assert.deepEqual(w.parZone.map((z) => z.zone), ['Centre', 'Gare']);
  assert.equal(computeStats([], '2026-11-10').portesParR1, null);
});

test('tournée : zones les plus anciennes d\'abord', () => {
  const t = tournee(days, '2026-11-10');
  assert.deepEqual(t.map((z) => [z.zone, z.ilYa, z.portes]), [['Zone Nord', 40, 10], ['Gare', 1, 60], ['Centre', 1, 30]]);
});

test('durée saisie par jour et portes par heure', () => {
  const jours = [{ date: '2026-11-03', minutes: 60 }, { date: '2026-11-09', minutes: 30 }];
  const s = computeStats(days, '2026-11-10', null, jours);
  assert.equal(s.duree, 90);
  assert.equal(s.portesParHeure, 100 / 1.5);
  assert.equal(computeStats(days, '2026-11-10', 7, jours).duree, 30); // le 3 est hors des 7 derniers jours
  assert.equal(computeStats(days, '2026-11-10').portesParHeure, null); // pas de durée saisie
});
