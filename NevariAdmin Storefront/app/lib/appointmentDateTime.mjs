function wallClockParts(date, time) {
  const match = `${date}T${time}`.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  return match ? match.slice(1).map(Number) : null;
}

function partsInTimeZone(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return [values.year, values.month, values.day, values.hour, values.minute, values.second].map(Number);
}

export function zonedAppointmentRange(date, time, durationMinutes, timeZone = "Africa/Lagos") {
  const requested = wallClockParts(date, time);
  if (!requested) throw new Error("Invalid appointment date or time.");
  const [year, month, day, hour, minute] = requested;
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instantMs = wallClockUtc;

  for (let pass = 0; pass < 2; pass += 1) {
    const actual = partsInTimeZone(new Date(instantMs), timeZone);
    const actualWallClockUtc = Date.UTC(actual[0], actual[1] - 1, actual[2], actual[3], actual[4], actual[5]);
    instantMs += wallClockUtc - actualWallClockUtc;
  }

  const start = new Date(instantMs);
  const displayed = partsInTimeZone(start, timeZone);
  if ([year, month, day, hour, minute].some((value, index) => value !== displayed[index])) {
    throw new Error("The selected appointment time does not exist in this timezone.");
  }
  const duration = Number(durationMinutes);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Invalid appointment duration.");
  return {
    startAt: start.toISOString(),
    endAt: new Date(instantMs + duration * 60_000).toISOString(),
    timezone: timeZone
  };
}
