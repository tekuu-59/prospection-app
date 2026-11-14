import test from 'node:test';
import assert from 'node:assert/strict';
import { purge } from '../rgpd.js';
import { computeStats } from '../stats.js';

const client = (statut) => ({ heure: '10:00', client: 'Garage Dupont', commentaire: 'rappeler', statut, quand: '', pos: { lat: 1, lng: 2 } });

test('efface les prospects de plus de 3 ans, garde les compteurs', () => {
  const days = [
    { date: '2023-11-13', zone: 'Gare', portes: 10, clients: [client('r1'), client('')] },
    { date: '2023-11-14', zone: 'Gare', portes: 5, clients: [client('r2')] }, // pile 3 ans : gardé
  ];
  const contacts = [{ id: 'a', nom: 'Vieux', date: '2023-11-13' }, { id: 'b', nom: 'Récent', date: '2026-01-01' }, { id: 'c', nom: 'Sans date' }];
  const p = purge(days, contacts, '2026-11-14');
  assert.equal(p.n, 3);
  assert.deepEqual(p.days[0].clients, [{ statut: 'r1' }, { statut: '' }]);
  assert.equal(p.days[0].portes, 10);
  assert.deepEqual(p.days[1], days[1]);
  assert.deepEqual(p.contacts.map((c) => c.id), ['b', 'c']);
  assert.deepEqual(computeStats(p.days, '2026-11-14'), computeStats(days, '2026-11-14')); // statistiques intactes
});

test('rien à effacer : n = 0, et une 2e purge ne change rien', () => {
  const days = [{ date: '2020-01-01', zone: 'Z1', portes: 3, clients: [client('r1')] }];
  const once = purge(days, [], '2026-11-14');
  assert.equal(once.n, 1);
  assert.equal(purge(once.days, once.contacts, '2026-11-14').n, 0);
});
