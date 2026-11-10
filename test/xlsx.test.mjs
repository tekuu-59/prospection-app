import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { buildXlsx } from '../xlsx.js';

test('génère un xlsx (zip) valide, écrit dans $OUT si défini', () => {
  const b = buildXlsx([{ name: 'Test', columns: [{ title: 'Date', width: 12 }, { title: 'Zone', width: 20 }, { title: 'N', width: 5 }],
    rows: [[new Date('2026-11-10T00:00:00Z'), 'Évreux <&> "x"', 3], [new Date('2026-11-11T00:00:00Z'), '=1+1\u0001', 0]] },
    { name: 'Deux', columns: [{ title: 'A', width: 8 }], rows: [['x']] }]);
  assert.equal(String.fromCharCode(b[0], b[1]), 'PK');
  if (process.env.OUT) writeFileSync(process.env.OUT, b);
});
