import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDuree } from '../duree.js';

test('affichage', () => {
  assert.equal(formatDuree(175), '02h 55min');
  assert.equal(formatDuree(0), '00h 00min');
  assert.equal(formatDuree(605), '10h 05min');
});
