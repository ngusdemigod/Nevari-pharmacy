import { generateBrowserMtmPdf } from "./mtmPdfBrowser.js";

self.onmessage = async (event) => {
  try {
    const { requestData, imageFiles } = event.data || {};
    const bytes = await generateBrowserMtmPdf(requestData, imageFiles || []);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    self.postMessage({ ok: true, buffer }, [buffer]);
  } catch (error) {
    self.postMessage({ ok: false, message: error?.message || "Unable to prepare the MTM PDF." });
  }
};

