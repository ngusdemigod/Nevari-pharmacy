import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const documentSource = await readFile(new URL("../app/lib/documentHtml.js", import.meta.url), "utf8");
const pdfRouteSource = await readFile(new URL("../app/api/admin/orders/[orderId]/documents/pdf/route.js", import.meta.url), "utf8");

test("printable invoice has a separate service-fee classification", () => {
  assert.match(documentSource, /totals\?\.fees/);
  assert.match(documentSource, /Service Fees:/);
});

test("PDF route strips every payment authorization field before rendering", () => {
  for (const field of ["payment_token", "payment_url", "branded_payment_url", "woocommerce_payment_url"]) {
    assert.match(pdfRouteSource, new RegExp(`${field}: \\\"\\\"`));
  }
  assert.match(pdfRouteSource, /renderDocumentHtml\(printableData/);
});
