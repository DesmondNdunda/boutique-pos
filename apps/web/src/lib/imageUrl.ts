/** Make development uploads stored against localhost usable from another device on the LAN. */
export function productImageSrc(imageUrl?: string | null): string | undefined {
  if (!imageUrl) return undefined;
  try {
    const parsed = new URL(imageUrl, window.location.origin);
    if ((parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") && parsed.pathname.startsWith("/uploads/")) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // Leave non-URL values alone so the browser can report an invalid image URL.
  }
  return imageUrl;
}
