import test from 'node:test';
import assert from 'node:assert/strict';
import { qrMatrix, qrSvg } from '../qr.js';

// Le décodage réel a été vérifié avec OpenCV pour les versions 1 à 10 ; ici, des contrôles de structure.
test('taille selon la longueur, motifs de repérage présents', () => {
  const small = qrMatrix('https://a.fr');
  assert.equal(small.length, 21); // version 1
  for (const [r, c] of [[0, 0], [0, 14], [14, 0]]) {
    assert.ok(small[r][c] && small[r + 3][c + 3] && !small[r + 1][c + 1]);
  }
  assert.equal(qrMatrix('x'.repeat(100)).length, 41); // version 6
  assert.equal(qrMatrix('x'.repeat(209)).length, 57); // version 10
});

test('trop long : erreur claire ; SVG bien formé', () => {
  assert.throws(() => qrMatrix('x'.repeat(250)), /trop longue/);
  assert.match(qrSvg('https://a.fr'), /^<svg[^>]+viewBox="0 0 29 29"[\s\S]+<\/svg>$/);
});
