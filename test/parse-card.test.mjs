import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCard, skewAngle, cardEdges } from '../parse-card.js';
import { readFileSync } from 'node:fs';

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

test('carte à deux agences : deux adresses, quelle que soit la lecture OCR', () => {
  const attendu = '4 Place du Marché, 27000 EVREUX / 111 Avenue des Tilleuls, 79140 LE PETIT QUEVILLY';
  const colonnes = parseCard(`ozo
Mathieu BERNARD
Alain LEFEBVRE
Agents Généraux
Agence d'Evreux
4 Place du Marché
27000 EVREUX
Tél. : 02 32 00 00 01
evreux-centre@ozo.fr
Agence Petit Quevilly
111 Avenue des Tilleuls
79140 LE PETIT QUEVILLY
Tél. : 02 35 00 00 02
petit-quevilly@ozo.fr
N° : 00 000 001 www.orias.fr N° : 00 000 002`);
  assert.equal(colonnes.adresse, attendu);
  assert.equal(colonnes.societe, 'ozo');
  assert.equal(colonnes.prenom, 'Mathieu / Alain');
  assert.equal(colonnes.nom, 'Bernard / Lefebvre');
  assert.equal(colonnes.email, 'evreux-centre@ozo.fr');
  assert.equal(colonnes.telephone, '02 32 00 00 01');
  const lignes = parseCard(`Agence d'Evreux Agence Petit Quevilly
4 Place du Marché 111 Avenue des Tilleuls
27000 EVREUX 79140 LE PETIT QUEVILLY`);
  assert.equal(lignes.adresse, attendu);
});

test('texte OCR réel de la carte Ozo : débris devant le nom, deux personnes', () => {
  const r = parseCard(': Fac”\no>\nad\nA\nu\n; À\nRe\nff Fl p o£\nSy p\n(\nen Mathieu BERNARD\nAlain LEFEBVRE\nVf\n& f pd: yr ÿ of &');
  assert.equal(r.prenom, 'Mathieu / Alain');
  assert.equal(r.nom, 'Bernard / Lefebvre');
});

// Texte réel de Tesseract.js (fra+eng) obtenu comme dans app.js (échelle, lecture redressée puis droite
// pour la carte de biais), ligne pour ligne : text = tous les mots, sure = mots lus avec une confiance ≥ 60.
// Noms et numéros anonymisés.
const ocr = JSON.parse(readFileSync(new URL('./ocr-cartes.json', import.meta.url), 'utf8'));
const lire = (k, ligne = '') => parseCard(ocr[k].text + ligne, ocr[k].sure + ligne);

test('carte de biais sur une table texturée', () => {
  const r = lire('table');
  assert.equal(r.prenom, 'Julien');
  assert.equal(r.nom, 'Moreau');
  assert.equal(r.telephone, '06 11 22 33 44');
  assert.match(r.adresse, /^2A route du Moulin 27400 SURVILLE/);
  // quand l'e-mail est lu (photo du téléphone), société et site viennent de son domaine
  const avecMail = lire('table', '\njmoreau@fictimpact.com');
  assert.equal(avecMail.societe, 'Fictimpact');
  assert.equal(avecMail.siteweb, 'www.fictimpact.com');
  assert.equal(avecMail.prenom, 'Julien');
});

for (const k of ['journal', 'recadree']) {
  test(`carte Ricoh (${k}) : logo, slogan et journal écartés`, () => {
    const r = lire(k);
    assert.equal(r.societe, 'RICOH FRANCE');
    assert.equal(r.prenom, 'Claire');
    assert.equal(r.nom, 'Durand');
    assert.equal(r.email, 'claire.durand@ricoh.fr');
    assert.equal(r.telephone, '+33 6 12 34 56 78');
    assert.equal(r.siteweb, 'www.ricoh.fr');
    assert.match(r.adresse, /^7\/9 avenue Robert Schuman/);
  });
}

test('point de l\'e-mail lu comme une espace', () => {
  assert.equal(parseCard('claire durand@ricoh.fr').email, 'claire.durand@ricoh.fr');
  assert.equal(parseCard('claire.durand@ricoh. fr').email, 'claire.durand@ricoh.fr');
  assert.equal(parseCard('mail jean@acme.fr').email, 'jean@acme.fr');
});

test('sans e-mail : « Claire DURAND » plutôt que « RICOH FRANCE », société au-dessus de l\'adresse', () => {
  const r = parseCard('xx yy\nRICOH FRANCE\nR ICO H 7% avenue Robert Schuman\nimagine. change. 94150 RUNGIS\nClaire DURAND\n+33 612345678');
  assert.equal(r.prenom, 'Claire');
  assert.equal(r.nom, 'Durand');
  assert.equal(r.societe, 'RICOH FRANCE');
  assert.equal(r.adresse, '7% avenue Robert Schuman, 94150 RUNGIS');
});

test('« Sa Julien Moreau » + jmoreau@ : le prénom est le mot qui porte l\'initiale', () => {
  const r = parseCard('Sa Julien Moreau\njmoreau@fictimpact.com');
  assert.equal(r.prenom, 'Julien');
  assert.equal(r.nom, 'Moreau');
});

test('angle d\'inclinaison des lignes de texte', () => {
  // lignes sombres de 3 px tous les 20 px, inclinées de deg (descendant vers la droite)
  const image = (deg) => {
    const W = 300, H = 200, data = new Uint8ClampedArray(W * H * 4).fill(255), t = Math.tan((deg * Math.PI) / 180);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((((y - x * t) % 20) + 20) % 20 < 3) data.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 3);
    return { width: W, height: H, data };
  };
  for (const deg of [0, 8, -12]) assert.ok(Math.abs(skewAngle(image(deg)) - deg) <= 0.5, `${deg}° → ${skewAngle(image(deg))}`);
});

test('texte réel du téléphone, carte de biais : e-mail coupé sur deux lignes, nom dans les débris', () => {
  const r = parseCard(ocr.telephone_biais.text);
  assert.equal(r.email, 'jmoreau@fictimpact.com');
  assert.equal(r.prenom, 'Julien');
  assert.equal(r.nom, 'Moreau');
  assert.equal(r.telephone, '06 11 22 33 44');
  assert.equal(r.societe, 'Fictimpact');
  assert.equal(r.siteweb, 'www.fictimpact.com');
});

test('code postal lu avec une confiance basse : gardé quand même', () => {
  const t = 'RICOH FRANCE\nR ICO H 7/9 avenue Robert Schuman\nimagine. change. 94150 RUNGIS\nClaire DURAND';
  const sure = 'RICOH FRANCE\nR ICO H 7/9 avenue Robert Schuman\nimagine. change. RUNGIS\nClaire DURAND';
  assert.equal(parseCard(t, sure).adresse, '7/9 avenue Robert Schuman, 94150 RUNGIS');
});

test('texte réel du téléphone, Ricoh : code postal lu en lettres et collé à la ville', () => {
  const r = parseCard('Fr». La RICOH FRANCE\nR ICOH 7/9 avenue Robert Schuman\nma Parc Icade Paris-Orly-Rungis\nimagine. change.  GAISORUNGIS 100\nClaire DURAND\nIngénieure des Ventes Ricoh Graphic Communication\n+33 612345678\nclaire.durand@ricoh.fr\nwww.ricoh.fr');
  assert.equal(r.adresse, '7/9 avenue Robert Schuman, 94150 RUNGIS');
  assert.equal(r.societe, 'RICOH FRANCE');
  // pas de correction hors d'une adresse, ni sur une ligne qui a déjà un code postal
  assert.equal(parseCard('STADE DUPONT\nClaire DURAND').societe, 'STADE DUPONT');
  assert.equal(parseCard('12 rue Victor Hugo\n27000 EVREUX CEDEX 9').adresse, '12 rue Victor Hugo, 27000 EVREUX CEDEX 9');
});

test('capture automatique : bords de la carte alignés sur le cadre', () => {
  // image du cadre agrandi de 12 % de chaque côté : fond texturé gris, carte blanche avec du texte
  const margin = 0.12;
  const image = ({ deg = 0, scale = 1, fond = (x, y) => 110 + ((x * 7919 + y * 104729) % 61) } = {}) => {
    const W = 240, H = Math.round(240 / (85 / 55)), data = new Uint8ClampedArray(W * H * 4);
    const cx = W / 2, cy = H / 2, hw = (W / (1 + 2 * margin) / 2) * scale, hh = (H / (1 + 2 * margin) / 2) * scale;
    const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = (x - cx) * c + (y - cy) * s, v = -(x - cx) * s + (y - cy) * c;
      const carte = Math.abs(u) <= hw && Math.abs(v) <= hh;
      const texte = carte && Math.abs(v) < hh * 0.5 && Math.round(v) % 6 === 0 && Math.abs(u) < hw * 0.7;
      const val = texte ? 30 : carte ? 245 : fond(x, y);
      data.fill(val, (y * W + x) * 4, (y * W + x) * 4 + 3);
      data[(y * W + x) * 4 + 3] = 255;
    }
    return { width: W, height: H, data };
  };
  assert.equal(cardEdges(image(), margin), 4, 'bien cadrée');
  assert.ok(cardEdges(image({ scale: 0.95 }), margin) >= 3, 'un peu en retrait du cadre : accepté');
  assert.ok(cardEdges(image({ deg: 8 }), margin) <= 1, 'de biais');
  assert.ok(cardEdges(image({ scale: 0.6 }), margin) <= 1, 'trop loin');
  assert.equal(cardEdges(image({ fond: () => 240 }), margin), 0, 'carte blanche sur fond blanc : prise manuelle');
});
