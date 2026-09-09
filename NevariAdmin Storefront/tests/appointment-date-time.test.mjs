import assert from "node:assert/strict";
import test from "node:test";
import { zonedAppointmentRange } from "../app/lib/appointmentDateTime.mjs";

test("keeps a 09:00 Lagos appointment at 09:00 after UTC serialization", () => {
  const range = zonedAppointmentRange("2026-09-10", "09:00", 30, "Africa/Lagos");
  assert.equal(range.startAt, "2026-09-10T08:00:00.000Z");
  assert.equal(range.endAt, "2026-09-10T08:30:00.000Z");
  assert.equal(new Intl.DateTimeFormat("en-GB", {
    timeZone: range.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).format(new Date(range.startAt)), "09:00");
});

test("preserves duration across midnight", () => {
  const range = zonedAppointmentRange("2026-09-10", "23:45", 30, "Africa/Lagos");
  assert.equal(range.startAt, "2026-09-10T22:45:00.000Z");
  assert.equal(range.endAt, "2026-09-10T23:15:00.000Z");
});

test("rejects malformed wall-clock values", () => {
  assert.throws(() => zonedAppointmentRange("10/09/2026", "09:00", 30), /Invalid appointment/);
});
