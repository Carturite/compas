/**
 * True when the extension is loaded unpacked (chrome://extensions → "Cargar descomprimida").
 * Store installs always carry an update_url, so development tools never reach real users.
 */
export function isDevBuild(): boolean {
  return !('update_url' in chrome.runtime.getManifest());
}
