import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const appRoot = path.resolve(import.meta.dirname, "..", "app");

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.(?:js|jsx|mjs)$/.test(entry.name) ? [entryPath] : [];
  });
}

test("dashboard-facing source uses the NevariHealth brand spelling", () => {
  const mismatches = sourceFiles(appRoot).filter((file) => /Nevari\s+Health/i.test(fs.readFileSync(file, "utf8")));
  assert.deepEqual(mismatches, []);
});
