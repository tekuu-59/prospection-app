// Extrait société / prénom / nom / e-mail / téléphone du texte lu sur une carte de visite.
// L'OCR se trompe : le résultat est une proposition que l'utilisateur corrige avant d'enregistrer.
const strip = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/i;
const URL_RE = /(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|fr|net|org|eu|io|be|ch)\b/i;
const PHONE_RE = /(?:\+|00)?\d[\d .\-/()]{7,}\d/g;
const LABEL_RE = /^(tel|mob|mobile|portable|fax|email|e-mail|mail|web|site|siret|siren|rcs|tva)\b/;
const STREET_RE = /\b(rue|avenue|av|boulevard|bd|chemin|route|impasse|allee|quai|cours|place|square|zone|zac|zi|za|bp|cs)\b/;
// début d'adresse (« 4 place », « 111 avenue ») et code postal : servent à couper une ligne qui contient deux colonnes
const STREET_START_RE = /\b\d{1,4}(?:\s?(?:bis|ter))?,?\s+(?:rue|av|avenue|bd|boulevard|chemin|route|impasse|all[ée]e|quai|cours|place|square)\b/gi;
const POSTCODE_RE = /\b\d{5}\b/g;
const TITLE_RE =
  /\b(directeur|directrice|dirigeant|gerant|gerante|responsable|president|presidente|pdg|ceo|manager|commercial|commerciale|charge|chargee|assistant|assistante|consultant|consultante|ingenieur|fondateur|fondatrice|associe|associee|proprietaire|conseiller|conseillere|technicien|chef|attache|attachee)\b/;
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
    const words = line.split(' ');
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
      const prenom = words.filter((_, m) => m !== k).join(' ');
      return { prenom: nice(prenom), nom: nice(words[k]), line };
    }
  }
  return null;
}

// Ligne de 2 ou 3 mots qui commencent par une majuscule ; strict : en plus un mot en capitales
// et un qui ne l'est pas (« Alain LEFEBVRE », pas « Agents Généraux »).
function asName(line, strict) {
  const s = strip(line);
  if (LEGAL_RE.test(s) || TITLE_RE.test(s)) return null;
  // l'OCR colle parfois un débris en minuscules devant le nom (« en Mathieu BERNARD »)
  const words = line.replace(/^(?:\p{Ll}\S*\s+)+/u, '').split(' ');
  if (words.length < 2 || words.length > 3 || line.length > 40) return null;
  if (!words.every((w) => /^\p{Lu}[\p{L}'’-]+\.?$/u.test(w))) return null;
  if (strict && !(words.some(isUpper) && !words.every(isUpper))) return null;
  const nomFirst = isUpper(words[0]) && !isUpper(words[1]); // « DUPONT Jean »
  const [a, b] = nomFirst ? [words.slice(1), [words[0]]] : [[words[0]], words.slice(1)];
  return { prenom: nice(a.join(' ')), nom: nice(b.join(' ')), line };
}

// Sans e-mail exploitable : première ligne qui ressemble à un nom
function guessName(lines) {
  for (const line of lines) {
    const n = asName(line, false);
    if (n) return n;
  }
  return null;
}

function guessCompany(lines, nameLine, email) {
  const ok = lines.filter((l) => l !== nameLine && !TITLE_RE.test(strip(l)));
  const domain = email ? strip(email.split('@')[1]).split('.')[0] : '';
  const custom = domain && !FREE_MAIL.has(domain) ? domain : '';
  const compact = (s) => strip(s).replace(/[^a-z0-9]/g, '');
  if (custom) {
    // un domaine court (ozo.fr) ne vaut que pour une ligne identique, sinon trop de faux positifs
    const c = compact(custom);
    const hit = ok.find((l) => compact(l) === c || (c.length >= 4 && compact(l).includes(c)));
    if (hit) return hit;
  }
  const legal = ok.find((l) => LEGAL_RE.test(strip(l)));
  if (legal) return legal;
  if (ok[0]) return ok[0];
  return custom ? nice(custom.replace(/-/g, ' ').toUpperCase()) : '';
}

const isAddress = (l) => /\b\d{5}\b/.test(l) || (STREET_RE.test(strip(l)) && /\d/.test(l));
const WEB_RE = /(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|fr|net|org|eu|io|be|ch|info|biz|pro|shop|studio|photo|paris)\b(?:\/\S*)?/i;

// Carte à deux agences : l'OCR lit soit colonne par colonne, soit les deux colonnes sur la même ligne.
function splitColumns(line) {
  for (const re of [STREET_START_RE, POSTCODE_RE]) {
    const starts = [...line.matchAll(re)].map((m) => m.index);
    if (starts.length > 1) return starts.map((s, i) => line.slice(i ? s : 0, starts[i + 1]).trim());
  }
  return [line];
}

// Une adresse se termine à son code postal ; plusieurs adresses sont séparées par « / ».
function findAddresses(lines) {
  const cols = [];
  for (const line of lines.filter(isAddress)) {
    splitColumns(line).forEach((part, i) => {
      const col = (cols[i] ??= [[]]);
      col.at(-1).push(part.replace(/\s+[-–—]\s+/g, ', '));
      if (/\b\d{5}\b/.test(part)) col.push([]);
    });
  }
  return cols.flat().filter((a) => a.length).map((a) => a.join(', ')).join(' / ');
}

function findSite(lines) {
  for (const l of lines) {
    if (EMAIL_RE.test(l)) continue;
    const m = l.match(WEB_RE);
    if (m) return m[0].toLowerCase().replace(/[.,;]+$/, '');
  }
  return '';
}

export function parseCard(text) {
  // L'OCR lit souvent mal le @ des polices stylisées (æ, ©, (at), a rond…) : on le rétablit
  // quand ce qui suit ressemble à un nom de domaine.
  const clean = text
    .replace(/(\S)\s*(?:[æÆœ©®¤§]|\(at\)|\[at\]|\(a\))\s*(?=[a-z0-9-]+\.[a-z]{2,})/gi, '$1@')
    // sinon : un seul symbole étrange collé entre un identifiant et un domaine (martin¤photographe.com)
    .replace(/(^|\s)([a-z0-9._%+-]{2,})[^a-z0-9._%+\s@-]([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})(?=\s|$)/gi, '$1$2@$3')
    .replace(/\s*@\s*/g, '@');
  const raw = clean.replace(/\bwww\.\s+/gi, 'www.').split(/\r?\n/).map((l) => l.replace(/[|•·_~=*#<>«»]/g, ' ').replace(/\s+/g, ' ').trim());

  const email = (clean.match(EMAIL_RE) ?? [''])[0].toLowerCase();
  const phones = findPhones(raw);
  const telephone = phones.find(isMobile) ?? phones[0] ?? '';

  const lines = raw.filter(
    (l) =>
      /\p{L}{2}/u.test(l) &&
      !EMAIL_RE.test(l) &&
      !URL_RE.test(l) &&
      !hasPhone(l) &&
      !LABEL_RE.test(strip(l)) &&
      !isAddress(l),
  );

  const name = (email && nameFromEmail(email, lines)) || guessName(lines);
  const others = lines.filter((l) => l !== name?.line).map((l) => asName(l, true)).filter(Boolean);
  return {
    societe: guessCompany(lines.filter((l) => !others.some((o) => o.line === l)), name?.line, email),
    // carte à plusieurs personnes, un seul contact : prénoms et noms dans le même ordre (« Mathieu / Alain », « Bernard / Lefebvre »)
    prenom: [name, ...others].filter(Boolean).map((n) => n.prenom).join(' / '),
    nom: [name, ...others].filter(Boolean).map((n) => n.nom).join(' / '),
    email,
    telephone,
    siteweb: findSite(raw),
    adresse: findAddresses(raw),
  };
}

export { formatPhone };
