/** Browsers block opening data: URLs in a new tab; blob: URLs open and zoom natively. */
export function base64JpegToObjectUrl(base64: string): string {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
}
