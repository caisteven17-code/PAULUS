// Single source of truth for avatar initials, so every screen shows the same
// thing (e.g. "drive justyn" -> "DJ"). Always pass the natural "First Last"
// name — not a "Last, First" formatted version — so the order is correct.
export function getInitials(name?: string | null): string {
  const parts = String(name ?? '')
    .replace(/,/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
