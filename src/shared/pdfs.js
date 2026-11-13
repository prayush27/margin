// "Open PDFs in Margin" is opt-in: PDFs open in Chrome's own viewer until you say yes,
// on the welcome page, in the popup, or in Settings.
import { updateSettings } from "./storage.js";

export async function setOpenPdfs(on) {
  await updateSettings({ openPdfs: !!on, pdfAsked: true });
  return !!on;
}

/** Does this tab look like a PDF Chrome is showing? */
export function looksLikePdf(url) {
  return /^(https?|file):/.test(url || "") && (/\.pdf($|[?#])/i.test(url) || /\/files\/\d+/.test(url));
}
