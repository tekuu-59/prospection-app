// Extrait société / prénom / nom / e-mail / téléphone du texte lu sur une carte de visite.
// L'OCR se trompe : le résultat est une proposition que l'utilisateur corrige avant d'enregistrer.
const strip = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/i;
const URL_RE = /(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|fr|net|org|eu|io|be|ch)\b/i;
const PHONE_RE = /(?:\+|00)?\d[\d .\-/()]{7,}\d/g;
const LABEL_RE = /^(tel|mob|mobile|portable|fax|email|e-mail|mail|web|site|siret|siren|rcs|tva)\b/;
const STREET_RE = /\b(rue|avenue|av|boulevard|bd|chemin|route|impasse|allee|quai|cours|place|square|zone|zac|zi|za|bp|cs)\b/;
// début d'adresse (« 4 place », « 111 avenue ») et code postal : servent à couper une ligne qui contient deux colonnes
const STREET_START_RE = /\b\d{1,4}(?:[/%]\d{0,4}|[a-c])?(?:\s?(?:bis|ter))?,?\s+(?:rue|av|avenue|bd|boulevard|chemin|route|impasse|all[ée]e|quai|cours|place|square)\b/gi;
const POSTCODE_RE = /\b\d{5}\b/g;
const TITLE_RE =
  /\b(directeur|directrice|dirigeant|gerant|gerante|responsable|president|presidente|pdg|ceo|manager|commercial|commerciale|charge|chargee|assistant|assistante|consultant|consultante|ingenieur|ingenieure|fondateur|fondatrice|associe|associee|proprietaire|conseiller|conseillere|technicien|chef|attache|attachee)\b/;
const LEGAL_RE =
  /\b(sas|sasu|sarl|eurl|sa|sci|snc|selarl|scop|association|groupe|group|cabinet|agence|societe|ets|etablissement|etablissements|garage|boulangerie|pharmacie|restaurant|hotel|brasserie|atelier|entreprise|menuiserie|maconnerie|plomberie|electricite|boucherie|pizzeria|salon|institut|clinique|transports|immobilier|assurances|auto|carrosserie|batiment|btp)\b/;
const GENERIC_LOCAL = new Set(['contact', 'info', 'infos', 'accueil', 'commercial', 'direction', 'admin', 'bonjour', 'hello', 'secretariat', 'compta', 'comptabilite', 'sales', 'devis', 'service']);
const FREE_MAIL = new Set(['gmail', 'hotmail', 'outlook', 'yahoo', 'orange', 'free', 'wanadoo', 'sfr', 'laposte', 'icloud', 'live', 'gmx', 'proton', 'protonmail', 'bbox', 'neuf', 'aol', 'msn']);

const isUpper = (w) => w.length > 1 && w === w.toUpperCase() && /\p{L}/u.test(w);
// DUPONT → Dupont, JEAN-PIERRE → Jean-Pierre ; un nom déjà en minuscules/capitales mixtes reste tel quel
const nice = (w) =>
  isUpper(w) ? w.toLowerCase().replace(/(^|[-'’\s])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : w;

function formatPhone(raw) {
  const international = /^\s*\+/.test(raw) || /^\s*00/.test(raw);
  let d = raw.replace(/\(0\)/g, '').replace(/\D/g, '');
  if (/^\s*00/.test(raw)) d = d.slice(2);
  if (international && d.startsWith('33') && d.length === 11) return `+33 ${d[2]} ${d.slice(3).match(/../g).join(' ')}`;
  if (!international && d.length === 10 && d[0] === '0') return d.match(/../g).join(' ');
  return international ? `+${d}` : raw.replace(/\s+/g, ' ').trim();
}

function findPhones(lines) {
  const found = [];
  for (const line of lines) {
    if (/\bfax\b/i.test(line)) continue;
    for (const m of line.matchAll(PHONE_RE)) {
      const digits = m[0].replace(/\(0\)/g, '').replace(/\D/g, '');
      if (digits.length >= 9 && digits.length <= 13) found.push(formatPhone(m[0]));
    }
  }
  return found;
}
const isMobile = (p) => /^(0[67]|\+33 [67]|\+32 4)/.test(p);

function hasPhone(line) {
  return findPhones([line]).length > 0 || /\b\d{9,}\b/.test(line.replace(/\s/g, ''));
}

// jean.dupont@acme.fr + une ligne « Jean DUPONT » → prénom Jean, nom Dupont
function nameFromEmail(email, lines) {
  const local = strip(email.split('@')[0]);
  if (GENERIC_LOCAL.has(local)) return null;
  const toks = local.split(/[._-]+/).filter((t) => /^[a-z]{2,}$/.test(t));
  const compact = local.replace(/[^a-z]/g, '');
  for (const line of lines) {
    const words = dropDebris(line).split(' ');
    if (words.length > 4 || !/^[\p{L}'’ .-]+$/u.test(line)) continue;
    const norm = words.map((w) => strip(w).replace(/[^a-z-]/g, ''));
    if (toks.length >= 2) {
      const i = norm.indexOf(toks[0]);
      const j = norm.indexOf(toks[1]);
      if (i < 0 || j < 0) continue;
      // convention prenom.nom ; si la carte écrit « DUPONT Jean », la ligne l'emporte
      const swap = isUpper(words[i]) && !isUpper(words[j]);
      return { prenom: nice(words[swap ? j : i]), nom: nice(words[swap ? i : j]), line };
    }
    // « jdupont » ou « dupont » : le nom est le mot qui termine l'adresse
    const k = norm.findIndex((w) => w.length >= 3 && (compact === w || (compact.length === w.length + 1 && compact.endsWith(w))));
    if (k >= 0) {
      // « jmoreau » + « Sa Julien Moreau » : le prénom est le mot qui commence par l'initiale
      const initiale = compact.length === norm[k].length + 1 && words.slice(0, k).findLast((_, m) => norm[m][0] === compact[0]);
      const prenom = initiale || words.filter((_, m) => m !== k).join(' ');
      return { prenom: nice(prenom), nom: nice(words[k]), line };
    }
  }
  // ligne pleine de débris (« Fc for ] Be ge Julien moreau PAL ») : on ne prend que les deux mots
  // qui correspondent à l'e-mail, côte à côte
  const cap = (w) => nice(w[0].toUpperCase() + w.slice(1));
  for (const line of lines) {
    const words = line.split(' ');
    const norm = words.map((w) => strip(w).replace(/[^a-z-]/g, ''));
    if (toks.length >= 2) {
      const i = norm.indexOf(toks[0]);
      if (i >= 0 && norm[i + 1] === toks[1]) return { prenom: cap(words[i]), nom: cap(words[i + 1]), line };
      continue;
    }
    const k = norm.findIndex((w, m) => m > 0 && w.length >= 3 && (compact === w || (compact.length === w.length + 1 && compact.endsWith(w))));
    if (k > 0 && /^\p{Lu}\p{Ll}/u.test(words[k - 1]) && (compact === norm[k] || norm[k - 1][0] === compact[0])) {
      return { prenom: cap(words[k - 1]), nom: cap(words[k]), line };
    }
  }
  return null;
}

// Carte de biais : l'e-mail est coupé sur deux lignes (« Fixe. . act.com » puis « jmoreau@fictimP »).
// Une adresse sans extension est recollée au fragment « xxx.com » de la ligne voisine.
function splitEmail(lines) {
  for (const [i, l] of lines.entries()) {
    const head = l.match(/([a-z0-9._%+-]+@[a-z0-9-]+)$/i);
    if (!head) continue;
    for (const n of [lines[i - 1], lines[i + 1]]) {
      const tail = n?.match(/(?:^|\s)([a-z0-9-]*\.(?:com|fr|net|org|eu|io|be|ch|info|pro))\b/i);
      if (tail) return (head[1] + tail[1]).toLowerCase();
    }
  }
  return '';
}

// l'OCR colle parfois un débris devant le nom (« en Mathieu BERNARD », « $ Julien Moreau »)
const dropDebris = (line) => line.replace(/^(?:\p{Ll}\S*\s+|[^\p{L}\s]+\s+)+(?=\p{Lu})/u, '');

// Ligne de 2 ou 3 mots qui commencent par une majuscule ; strict : en plus un mot en capitales
// et un qui ne l'est pas (« Alain LEFEBVRE », pas « Agents Généraux »).
function asName(line, strict) {
  const s = strip(line);
  if (LEGAL_RE.test(s) || TITLE_RE.test(s)) return null;
  const words = dropDebris(line).split(' ');
  if (words.length < 2 || words.length > 3 || line.length > 40) return null;
  // « LOGo » (casse mélangée dans le mot) et « Mp Le » (que des mots de 2 lettres) sont des débris
  if (!words.every((w) => /^\p{Lu}[\p{L}'’-]+\.?$/u.test(w) && !/\p{Ll}\p{Lu}|\p{Lu}{2}\p{Ll}/u.test(w))) return null;
  if (!words.some((w) => w.length >= 3)) return null;
  if (strict && !(words.some(isUpper) && !words.every(isUpper))) return null;
  const nomFirst = isUpper(words[0]) && !isUpper(words[1]); // « DUPONT Jean »
  const [a, b] = nomFirst ? [words.slice(1), [words[0]]] : [[words[0]], words.slice(1)];
  return { prenom: nice(a.join(' ')), nom: nice(b.join(' ')), line };
}

// Sans e-mail exploitable : d'abord « Emilie BERNARD » (casse mixte), puis toute ligne qui ressemble
// à un nom ; « RICOH FRANCE » ne passe qu'en dernier recours.
function guessName(lines) {
  for (const strict of [true, false]) {
    for (const line of lines) {
      const n = asName(line, strict);
      if (n) return n;
    }
  }
  return null;
}

// rawOf : ligne complète d'une ligne « sûre » (un logo lu avec une faible confiance peut y manquer)
function guessCompany(lines, nameLine, email, beforeAddress, rawOf) {
  const ok = lines.filter((l) => l !== nameLine && !TITLE_RE.test(strip(l)));
  const domain = email ? strip(email.split('@')[1]).split('.')[0] : '';
  const custom = domain && !FREE_MAIL.has(domain) ? domain : '';
  const compact = (s) => strip(s).replace(/[^a-z0-9]/g, '');
  if (custom) {
    // un domaine court (ozo.fr) ne vaut que pour une ligne identique, sinon trop de faux positifs
    const c = compact(custom);
    const has = (l) => compact(l) === c || (c.length >= 4 && compact(l).includes(c));
    const hit = ok.find((l) => has(l) || has(rawOf.get(l)));
    if (hit) {
      // « So RICOH FRANCE » : la société commence au mot qui porte le domaine
      const words = (has(hit) ? hit : rawOf.get(hit)).split(' ');
      const k = words.findIndex((w) => compact(w).length >= 2 && (compact(w).includes(c) || c.startsWith(compact(w))));
      return words.slice(Math.max(k, 0)).join(' ');
    }
  }
  const legal = ok.find((l) => LEGAL_RE.test(strip(l)));
  if (legal) return legal;
  // sinon le domaine de l'e-mail, puis la ligne juste au-dessus de l'adresse (souvent la société)
  if (custom) return nice(custom.replace(/-/g, ' ').toUpperCase());
  if (ok.includes(beforeAddress)) return beforeAddress;
  return ok[0] ?? '';
}

const isAddress = (l) => /\b\d{5}\b/.test(l) || (STREET_RE.test(strip(l)) && /\d/.test(l));
const WEB_RE = /(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|fr|net|org|eu|io|be|ch|info|biz|pro|shop|studio|photo|paris)\b(?:\/\S*)?/i;

// Carte à deux agences : l'OCR lit soit colonne par colonne, soit les deux colonnes sur la même ligne.
function splitColumns(line) {
  for (const re of [STREET_START_RE, POSTCODE_RE]) {
    const starts = [...line.matchAll(re)].map((m) => m.index);
    // « logo 7/9 avenue … » : ce qui précède le numéro de rue est un débris
    // de même pour « imagine. change. 94150 RUNGIS » (slogan), mais « BP 12 27001 » ou « 88 avenue … 75017 » restent
    const cut = re === STREET_START_RE || !/\d/.test(line.slice(0, starts[0])) && !STREET_RE.test(strip(line.slice(0, starts[0])));
    if (starts.length > 1 || (cut && starts[0] > 0)) return starts.map((s, i) => line.slice(i || cut ? s : 0, starts[i + 1]).trim());
  }
  return [line];
}

// Une adresse se termine à son code postal ; plusieurs adresses sont séparées par « / ».
function findAddresses(lines) {
  const cols = [];
  for (const line of lines.filter(isAddress)) {
    splitColumns(line).forEach((part, i) => {
      const col = (cols[i] ??= [[]]);
      // « 94150 RUNGIS 100 » : nombre parasite après la ville (mais « CEDEX 9 » reste)
      const fin = /cedex/i.test(part) ? part : part.replace(/(\b\d{5}(?:\s+\p{Lu}[\p{L}'’-]*)+)\s+\d{1,3}$/u, '$1');
      col.at(-1).push(fin.replace(/\s+[-–—]\s+/g, ', '));
      if (/\b\d{5}\b/.test(part)) col.push([]);
    });
  }
  // une carte lue deux fois (droite et redressée) : une seule adresse par code postal
  const seen = new Set();
  return cols.flat().filter((a) => a.length).map((a) => a.join(', '))
    .filter((a) => { const cp = a.match(/\b\d{5}\b/)?.[0]; return !cp || (!seen.has(cp) && seen.add(cp)); })
    .join(' / ');
}

function findSite(lines) {
  for (const l of lines) {
    if (EMAIL_RE.test(l)) continue;
    const m = l.match(WEB_RE);
    if (m) return m[0].toLowerCase().replace(/[.,;]+$/, '').replace(/^w{2,4}i?\./, 'www.'); // « wwwi.ricoh.fr »
  }
  return '';
}

function fixAt(text) {
  // L'OCR lit souvent mal le @ des polices stylisées (æ, ©, (at), a rond…) : on le rétablit
  // quand ce qui suit ressemble à un nom de domaine.
  return text
    .replace(/(\S)\s*(?:[æÆœ©®¤§]|\(at\)|\[at\]|\(a\))\s*(?=[a-z0-9-]+\.[a-z]{2,})/gi, '$1@')
    // sinon : un seul symbole étrange collé entre un identifiant et un domaine (martin¤photographe.com)
    .replace(/(^|\s)([a-z0-9._%+-]{2,})[^a-z0-9._%+\s@-]([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})(?=\s|$)/gi, '$1$2@$3')
    .replace(/\s*@\s*/g, '@')
    // point lu comme une espace : « emilie bernard@ricoh.fr », « bernard@ricoh. fr »
    .replace(/(^|\n)[ \t]*(?!(?:mail|email|courriel|contact)\b)([a-z]{2,}) ([a-z][a-z0-9._-]*@)/gim, '$1$2.$3')
    .replace(/(@[a-z0-9.-]+)\. ([a-z]{2,4})\b/gi, '$1.$2');
}
const toLines = (text) =>
  fixAt(text).replace(/\bwww\.\s+/gi, 'www.').split(/\r?\n/).map((l) => l.replace(/[|•·_~=*#<>«»“”„"]/g, ' ').replace(/\s+/g, ' ').trim());

// Code postal lu en lettres et collé à la ville (« GAISORUNGIS » pour « 94150 RUNGIS ») : seulement dans
// les deux lignes qui suivent une rue sans code postal, pour ne pas transformer de vrais mots.
const DIGIT = { O: '0', D: '0', Q: '0', I: '1', L: '1', Z: '2', A: '4', S: '5', G: '9', B: '8', T: '7' };
function fixPostcode(lines) {
  return lines.map((l, i) => {
    const street = [lines[i - 1], lines[i - 2]].some((p) => p && STREET_RE.test(strip(p)) && /\d/.test(p) && !/\b\d{5}\b/.test(p));
    if (!street || /\b\d{5}\b/.test(l)) return l;
    return l.replace(/(^|\s)([0-9ODQILZASGBT]{5})\s*(\p{Lu}{3,})/u, (m, sp, cp, ville) =>
      /\d.*\d|^\D{5}$/.test(cp) ? `${sp}${cp.replace(/\D/g, (c) => DIGIT[c])} ${ville}` : m);
  });
}

// sure : le même texte, ligne pour ligne, sans les mots lus avec une faible confiance (débris du fond,
// logo, QR code). Nom et société en viennent ; e-mail, téléphone, site et adresse viennent du texte complet.
export function parseCard(text, sure = text) {
  const clean = fixAt(text);
  const raw = fixPostcode(toLines(text));
  let sureLines = toLines(sure);
  if (sureLines.length !== raw.length) sureLines = raw;

  const email = (clean.match(EMAIL_RE) ?? [''])[0].toLowerCase() || splitEmail(raw);
  const phones = findPhones(raw);
  const telephone = phones.find(isMobile) ?? phones[0] ?? '';

  // une ligne est écartée d'après son texte complet (« R ICO H 7% avenue … » reste une adresse)
  const keep = raw.map(
    (l, i) =>
      /\p{L}{2}/u.test(sureLines[i]) &&
      !EMAIL_RE.test(l) &&
      !URL_RE.test(l) &&
      !hasPhone(l) &&
      !LABEL_RE.test(strip(l)) &&
      !isAddress(l),
  );
  const lines = sureLines.filter((_, i) => keep[i]);
  const rawOf = new Map(sureLines.map((s, i) => [s, raw[i]]));

  const name = (email && nameFromEmail(email, lines)) || guessName(lines);
  const addr = raw.findIndex(isAddress);
  const beforeAddress = sureLines.slice(0, Math.max(addr, 0)).findLast((_, i) => keep[i]);
  const domain = email.split('@')[1] ?? '';
  // « act.com » : morceau de l'e-mail coupé, pas un site
  let site = findSite(raw);
  const bare = site.replace(/^www\./, '');
  if (domain && bare !== domain && domain.endsWith(bare)) site = '';
  // une deuxième personne seulement sur une ligne lue entière (sinon « VOUS Qi » d'un journal passe)
  const others = lines.filter((l) => l !== name?.line && rawOf.get(l) === l).map((l) => asName(l, true)).filter(Boolean);
  return {
    societe: guessCompany(lines.filter((l) => !others.some((o) => o.line === l)), name?.line, email, beforeAddress, rawOf),
    // carte à plusieurs personnes, un seul contact : prénoms et noms dans le même ordre (« Mathieu / Alain », « Bernard / Lefebvre »)
    prenom: [name, ...others].filter(Boolean).map((n) => n.prenom).join(' / '),
    nom: [name, ...others].filter(Boolean).map((n) => n.nom).join(' / '),
    email,
    telephone,
    // site non lu (police stylisée) : celui du domaine de l'e-mail, sauf messagerie grand public
    siteweb: site || (domain && !FREE_MAIL.has(strip(domain).split('.')[0]) ? `www.${domain}` : ''),
    // une ligne de débris peut contenir « cs » et des chiffres : l'adresse doit aussi se lire dans le texte sûr
    // un code postal est souvent lu avec une confiance basse (« 94150 » à 46) : il suffit dans le texte complet
    adresse: findAddresses(raw.filter((l, i) => /\b\d{5}\b/.test(l) || isAddress(sureLines[i]))),
  };
}

// Inclinaison du texte en degrés (positive : les lignes descendent vers la droite), sur une image RGBA
// réduite (≈600 px) : l'angle où les bords horizontaux des lettres s'alignent le mieux en lignes
// (profil de projection). Tesseract ne redresse pas seul une carte photographiée de biais.
export function skewAngle({ width: W, height: H, data }) {
  const gray = (x, y) => { const i = (y * W + x) * 4; return 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2]; };
  const pts = [];
  for (let y = 0; y + 2 < H; y++) for (let x = 0; x < W; x++) if (Math.abs(gray(x, y) - gray(x, y + 2)) > 60) pts.push(x, y);
  const D = 2 * Math.ceil(Math.hypot(W, H));
  let best = 0;
  let bestScore = -1;
  for (let a = -20; a <= 20; a += 0.5) {
    const r = (a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    const h = new Float64Array(D);
    for (let k = 0; k < pts.length; k += 2) h[Math.round(pts[k + 1] * c - pts[k] * s) + D / 2]++;
    let score = 0;
    for (const v of h) score += v * v;
    if (score > bestScore) [best, bestScore] = [a, score];
  }
  return best;
}

// Capture automatique : nombre de côtés du cadre (0 à 4) le long desquels on voit un bord net et
// parallèle, c'est-à-dire le bord d'une carte bien cadrée et prise de face. L'image RGBA couvre le cadre
// agrandi de `margin` (fraction de sa taille) de chaque côté ; le bord est cherché dans cette marge, de
// part et d'autre du trait. Une carte de biais n'a pas de bord parallèle ; une texture (table, journal)
// donne du contraste partout mais pas de ligne qui se détache.
export function cardEdges({ width: W, height: H, data }, margin) {
  const g = (x, y) => { const i = (y * W + x) * 4; return 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2]; };
  const mx = Math.round((W * margin) / (1 + 2 * margin));
  const my = Math.round((H * margin) / (1 + 2 * margin));
  // profil d'un côté : contraste moyen de chaque ligne (ou colonne) parallèle au trait du cadre
  const side = (pos, horizontal) => {
    const [band, len, start] = horizontal ? [my, W - 2 * mx, mx] : [mx, H - 2 * my, my];
    const from = Math.max(1, pos - band), to = Math.min((horizontal ? H : W) - 2, pos + band);
    const prof = [];
    for (let p = from; p <= to; p++) {
      let s = 0;
      for (let t = start + len * 0.1; t < start + len * 0.9; t++) {
        const q = Math.round(t);
        s += horizontal ? Math.abs(g(q, p + 1) - g(q, p - 1)) : Math.abs(g(p + 1, q) - g(p - 1, q));
      }
      prof.push(s / (len * 0.8));
    }
    const sorted = [...prof].sort((a, b) => a - b);
    const peak = sorted.at(-1) ?? 0;
    return peak >= 20 && peak >= 2.5 * (sorted[sorted.length >> 1] || 1);
  };
  return [side(my, true), side(H - 1 - my, true), side(mx, false), side(W - 1 - mx, false)].filter(Boolean).length;
}

export { formatPhone };
