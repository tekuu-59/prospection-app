// Calculs des statistiques et du suivi de tournée, sans accès à l'écran (testables seuls).
const DAY = 864e5;
const asUTC = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const daysBetween = (fromIso, toIso) => Math.round((asUTC(toIso) - asUTC(fromIso)) / DAY);
const count = (e, s) => e.clients.filter((c) => c.statut === s).length;

// période : nombre de jours (7, 30) ou null pour tout ; todayIso : 'AAAA-MM-JJ'
export function computeStats(days, todayIso, period = null, jours = []) {
  const rows = days.filter((d) => period == null || daysBetween(d.date, todayIso) < period);
  const sum = (f) => rows.reduce((s, d) => s + f(d), 0);
  const portes = sum((d) => d.portes);
  // durée en minutes, saisie une fois par jour
  const duree = jours.filter((j) => period == null || daysBetween(j.date, todayIso) < period).reduce((s, j) => s + j.minutes, 0);
  const r1 = sum((d) => count(d, 'r1'));
  const r2 = sum((d) => count(d, 'r2'));
  const byDay = new Map();
  const byZone = new Map();
  for (const d of rows) {
    const j = byDay.get(d.date) ?? { date: d.date, portes: 0, r1: 0 };
    j.portes += d.portes;
    j.r1 += count(d, 'r1');
    byDay.set(d.date, j);
    const key = d.zone || 'Sans zone';
    const z = byZone.get(key) ?? { zone: key, portes: 0, r1: 0, r2: 0, clients: 0 };
    z.portes += d.portes;
    z.r1 += count(d, 'r1');
    z.r2 += count(d, 'r2');
    z.clients += d.clients.length;
    byZone.set(key, z);
  }
  return {
    portes, r1, r2, duree,
    portesParHeure: duree > 0 ? portes / (duree / 60) : null,
    clients: sum((d) => d.clients.length),
    tauxR1: portes ? (100 * r1) / portes : 0,
    portesParR1: r1 ? portes / r1 : null,
    parJour: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    parZone: [...byZone.values()].sort((a, b) => b.portes - a.portes),
  };
}

// Suivi de tournée : pour chaque zone, dernier passage et total, de la plus ancienne à la plus récente.
export function tournee(days, todayIso) {
  const m = new Map();
  for (const d of days) {
    if (!d.zone) continue;
    const z = m.get(d.zone) ?? { zone: d.zone, dernier: d.date, portes: 0, passages: 0 };
    z.portes += d.portes;
    z.passages += 1;
    if (d.date > z.dernier) z.dernier = d.date;
    m.set(d.zone, z);
  }
  return [...m.values()]
    .map((z) => ({ ...z, ilYa: daysBetween(z.dernier, todayIso) }))
    .sort((a, b) => b.ilYa - a.ilYa);
}
