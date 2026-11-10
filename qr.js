// Générateur de QR code sans dépendance : mode octets, correction d'erreur M, versions 1 à 10
// (jusqu'à 213 octets, largement assez pour une adresse de site). Renvoie une matrice de booléens.
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsRemainder(data, n) {
  let gen = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(gen.length + 1).fill(0);
    gen.forEach((c, j) => { next[j] ^= c; next[j + 1] ^= mul(c, EXP[i]); });
    gen = next;
  }
  const rem = new Array(n).fill(0);
  for (const d of data) {
    const f = d ^ rem.shift();
    rem.push(0);
    for (let i = 0; i < n; i++) rem[i] ^= mul(gen[i + 1], f);
  }
  return rem;
}

// Niveau M : [mots de code de correction par bloc, [[nombre de blocs, mots de données par bloc], ...]]
const M = [null, [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]],
  [16, [[4, 27]]], [18, [[4, 31]]], [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]], [26, [[4, 43], [1, 44]]]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const capacity = (v) => M[v][1].reduce((s, [n, k]) => s + n * k, 0);

function bch(value, poly, bits, highBit) {
  let v = value << bits;
  for (let i = highBit; i >= bits; i--) if ((v >>> i) & 1) v ^= poly << (i - bits);
  return (value << bits) | v;
}

export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(text)];
  let ver = 1;
  while (ver <= 10 && bytes.length + (ver < 10 ? 2 : 3) > capacity(ver)) ver++;
  if (ver > 10) throw new Error('Adresse trop longue pour le QR code');

  // 1. données : mode octets, longueur, contenu, terminateur, remplissage
  const bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(4, 4); put(bytes.length, ver < 10 ? 8 : 16);
  bytes.forEach((b) => put(b, 8));
  const total = capacity(ver) * 8;
  put(0, Math.min(4, total - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; data.length < capacity(ver); pad ^= 0xec ^ 0x11) data.push(pad);

  // 2. blocs, correction d'erreur, entrelacement
  const [ecLen, groups] = M[ver];
  const blocks = [];
  let pos = 0;
  for (const [n, k] of groups) for (let i = 0; i < n; i++) { blocks.push(data.slice(pos, pos + k)); pos += k; }
  const ecs = blocks.map((b) => rsRemainder(b, ecLen));
  const out = [];
  for (let i = 0; i < Math.max(...blocks.map((b) => b.length)); i++) blocks.forEach((b) => i < b.length && out.push(b[i]));
  for (let i = 0; i < ecLen; i++) ecs.forEach((e) => out.push(e[i]));
  const stream = out.flatMap((b) => Array.from({ length: 8 }, (_, i) => (b >>> (7 - i)) & 1));

  // 3. matrice : motifs fixes
  const size = 17 + 4 * ver;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (r, c, v) => { mod[r][c] = v; fixed[r][c] = true; };
  const finder = (r0, c0) => {
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
      const r = r0 + dr, c = c0 + dc;
      if (r < 0 || c < 0 || r >= size || c >= size) continue;
      const ring = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
      set(r, c, ring !== 4 && (ring !== 2));
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
  for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const al = ALIGN[ver];
  for (const r of al) for (const c of al) {
    const last = al[al.length - 1];
    if ((r === 6 && (c === 6 || c === last)) || (c === 6 && r === last)) continue; // sous les motifs de repérage
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
  }
  set(size - 8, 8, true); // module sombre
  for (let i = 0; i < 9; i++) { fixed[8][i] = fixed[i][8] = true; }
  for (let i = 0; i < 8; i++) { fixed[8][size - 1 - i] = fixed[size - 1 - i][8] = true; }
  if (ver >= 7) {
    const v = bch(ver, 0x1f25, 12, 17);
    for (let i = 0; i < 18; i++) {
      const bit = ((v >>> i) & 1) === 1, a = Math.floor(i / 3), b = (i % 3) + size - 11;
      set(a, b, bit); set(b, a, bit);
    }
  }

  // 4. données en zigzag
  const cells = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let n = 0; n < size; n++) for (let j = 0; j < 2; j++) {
      const c = right - j, up = ((right + 1) & 2) === 0, r = up ? size - 1 - n : n;
      if (!fixed[r][c]) cells.push([r, c]);
    }
  }
  cells.forEach(([r, c], i) => { mod[r][c] = stream[i] === 1; }); // les cases restantes (< 8) restent claires

  // 5. masque : on garde celui qui a la plus petite pénalité
  const masks = [(r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0];
  const build = (mask) => {
    const g = mod.map((row) => row.slice());
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!fixed[r][c] && masks[mask](r, c)) g[r][c] = !g[r][c];
    const f = bch(0b00 << 3 | mask, 0x537, 10, 14) ^ 0x5412; // niveau M = 00
    const fb = (i) => ((f >>> i) & 1) === 1;
    for (let i = 0; i < 6; i++) g[i][8] = fb(i);
    g[7][8] = fb(6); g[8][8] = fb(7); g[8][7] = fb(8);
    for (let i = 9; i < 15; i++) g[8][14 - i] = fb(i);
    for (let i = 0; i < 8; i++) g[8][size - 1 - i] = fb(i);
    for (let i = 8; i < 15; i++) g[size - 15 + i][8] = fb(i);
    return g;
  };
  const penalty = (g) => {
    let p = 0;
    const lines = [...g, ...g[0].map((_, c) => g.map((row) => row[c]))];
    for (const line of lines) {
      let run = 1;
      for (let i = 1; i <= size; i++) {
        if (i < size && line[i] === line[i - 1]) run++;
        else { if (run >= 5) p += run - 2; run = 1; }
      }
      const s = line.map((x) => (x ? 1 : 0)).join('');
      p += 40 * ((s.match(/10111010000/g) ?? []).length + (s.match(/00001011101/g) ?? []).length);
    }
    for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) if (g[r][c] === g[r][c + 1] && g[r][c] === g[r + 1][c] && g[r][c] === g[r + 1][c + 1]) p += 3;
    const dark = g.flat().filter(Boolean).length;
    return p + 10 * Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5);
  };
  let best = null;
  for (let m = 0; m < 8; m++) { const g = build(m); const p = penalty(g); if (!best || p < best.p) best = { g, p }; }
  return best.g;
}

// SVG prêt à afficher : fond blanc, zone de silence de 4 modules.
export function qrSvg(text) {
  const g = qrMatrix(text), n = g.length + 8;
  const path = g.flatMap((row, r) => row.map((on, c) => (on ? `M${c + 4} ${r + 4}h1v1h-1z` : ''))).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${n}" height="${n}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
