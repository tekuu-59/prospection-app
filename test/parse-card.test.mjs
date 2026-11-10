import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCard } from '../parse-card.js';

test('carte classique', () => {
  const r = parseCard(`ACME INDUSTRIES SAS
Jean DUPONT
Directeur commercial
Tél : 02 32 12 34 56
Mob : 06 12 34 56 78
jean.dupont@acme-industries.fr
www.acme-industries.fr
12 rue des Fleurs
27000 Évreux`);
  assert.deepEqual(r, { societe: 'ACME INDUSTRIES SAS', prenom: 'Jean', nom: 'Dupont', email: 'jean.dupont@acme-industries.fr', telephone: '06 12 34 56 78', siteweb: 'www.acme-industries.fr', adresse: '12 rue des Fleurs, 27000 Évreux' });
});

test('nom en premier, e-mail prenom.nom', () => {
  const r = parseCard('Boulangerie Martin\nMARTIN Sophie\n+33 6 98 76 54 32\nsophie.martin@boulangerie-martin.com');
  assert.equal(r.prenom, 'Sophie');
  assert.equal(r.nom, 'Martin');
  assert.equal(r.telephone, '+33 6 98 76 54 32');
  assert.equal(r.societe, 'Boulangerie Martin');
});

test('sans e-mail : nom deviné, fixe conservé', () => {
  const r = parseCard('Garage Leroy\nPaul Leroy\n02.32.00.11.22');
  assert.equal(r.prenom, 'Paul');
  assert.equal(r.nom, 'Leroy');
  assert.equal(r.telephone, '02 32 00 11 22');
});

test('e-mail avec espaces autour du @, texte vide', () => {
  assert.equal(parseCard('x\nmarc.durand @ free.fr').email, 'marc.durand@free.fr');
  assert.deepEqual(parseCard(''), { societe: '', prenom: '', nom: '', email: '', telephone: '', siteweb: '', adresse: '' });
});

test('@ lu comme æ ou © par l\'OCR', () => {
  const r = parseCard('Bastien Martin\nphotographe\n01.00.00.00.00\n06.00.00.00.00\nmartinæphotographe.com\n88, avenue des ternes - 75017 - Paris\nwww.photographie.com');
  assert.equal(r.email, 'martin@photographe.com');
  assert.equal(r.prenom, 'Bastien');
  assert.equal(r.nom, 'Martin');
  assert.equal(r.telephone, '06 00 00 00 00');
  assert.equal(parseCard('jean.dupont© acme.fr').email, 'jean.dupont@acme.fr');
});

test('@ remplacé par un symbole quelconque', () => {
  for (const c of ['æ', '¤', '€', '&', '§', 'ø', 'α']) assert.equal(parseCard(`Jean Martin\nmartin${c}photographe.com`).email, 'martin@photographe.com', c);
});

test('site avec espace et adresse sur une ligne', () => {
  const r = parseCard('Bastien Martin\nphotographe\n06.00.00.00.00\nmartinæphotographe.com\n88, avenue des ternes - 75017 - Paris\nwww. photographie.com');
  assert.equal(r.siteweb, 'www.photographie.com');
  assert.equal(r.adresse, '88, avenue des ternes, 75017, Paris');
  assert.equal(r.email, 'martin@photographe.com');
});
