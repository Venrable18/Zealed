/** UTF-8 text to unpadded base64url, safe to put in a URL fragment. */
export function textToBase64Url(text: string): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

/** The reverse. Returns null for anything that is not valid base64url of valid UTF-8. Never throws. */
export function base64UrlToText(encoded: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(encoded)) return null
  try {
    const padded = encoded
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(encoded.length / 4) * 4, '=')
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)),
    )
  } catch {
    return null
  }
}
