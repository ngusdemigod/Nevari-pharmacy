import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const configSource = await readFile(new URL("../next.config.mjs", import.meta.url), "utf8");

test("the dev branch is pinned to the demo pharmacy backend", () => {
  assert.match(configSource, /VERCEL_GIT_COMMIT_REF === DEVELOPMENT_BRANCH/);
  assert.match(configSource, /DEVELOPMENT_BACKEND_URL = "https:\/\/demo\.nevarihealth\.com"/);
  assert.match(configSource, /NEXT_PUBLIC_NEVARI_BASE_URL: effectiveBackendUrl/);
});
