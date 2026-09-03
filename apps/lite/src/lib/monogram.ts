// Black/white mono ticker avatar — replaces the pixelated `blo` blockies fallback so unknown
// tokens stay on the Solon aesthetic.
export function monogramURI(label?: string) {
  const s =
    (label ?? "?")
      .replace(/[^A-Za-z0-9$]/g, "")
      .slice(0, 4)
      .toUpperCase() || "?";
  const fontSize = s.length > 2 ? 18 : 26;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" fill="#000000"/>` +
    `<rect x="1.5" y="1.5" width="61" height="61" fill="none" stroke="#2e2e2e" stroke-width="3"/>` +
    `<text x="32" y="${32 + fontSize * 0.36}" text-anchor="middle" font-family="Menlo,Consolas,monospace" font-weight="700" font-size="${fontSize}" fill="#ffffff">${s}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
