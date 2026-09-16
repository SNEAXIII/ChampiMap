/** « 0 Mo », « 143 Mo », « 1,2 Go » (unités de 1024). */
export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${Math.round(mb)} Mo`;
  return `${(mb / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go`;
}
