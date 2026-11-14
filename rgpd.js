// RGPD : 3 ans après le contact (durée recommandée par la CNIL pour un prospect), on efface ce qui
// identifie la personne. Les compteurs (portes, R1, R2) restent, pour garder les statistiques.
export const ANS = 3;

// Renvoie { days, contacts, n } : n = nombre de fiches effacées (0 = rien n'a changé).
export function purge(days, contacts, todayIso) {
  const limite = `${+todayIso.slice(0, 4) - ANS}${todayIso.slice(4)}`;
  let n = 0;
  const outDays = days.map((d) => {
    const vieux = d.date < limite && d.clients.filter((c) => Object.keys(c).some((k) => k !== 'statut'));
    if (!vieux?.length) return d;
    n += vieux.length;
    return { ...d, clients: d.clients.map((c) => ({ statut: c.statut })) };
  });
  const outContacts = contacts.filter((c) => !(c.date < limite)); // sans date : gardé
  n += contacts.length - outContacts.length;
  return { days: outDays, contacts: outContacts, n };
}
