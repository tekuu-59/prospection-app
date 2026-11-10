// Affichage d'une durée en minutes : « 02h 55min ».
export const formatDuree = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}h ${String(min % 60).padStart(2, '0')}min`;
