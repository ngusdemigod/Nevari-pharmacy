export const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
export const DEFAULT_SLOT_INTERVAL_MINUTES = 30;
export const DEFAULT_AVAILABILITY_START = "09:00";
export const DEFAULT_AVAILABILITY_END = "17:00";

export function normalizeAvailability(value) {
  const normalized = {};
  WEEKDAYS.forEach((day) => {
    const ranges = Array.isArray(value?.[day]) ? value[day] : [];
    normalized[day] = ranges
      .filter((range) => range?.start && range?.end)
      .map((range) => ({
        start: String(range.start).slice(0, 5),
        end: String(range.end).slice(0, 5)
      }));
  });
  return normalized;
}

export function availabilityEquals(left, right) {
  return WEEKDAYS.every((day) => {
    const leftRanges = Array.isArray(left?.[day]) ? left[day] : [];
    const rightRanges = Array.isArray(right?.[day]) ? right[day] : [];

    if (leftRanges.length !== rightRanges.length) {
      return false;
    }

    return leftRanges.every((range, index) => (
      String(range?.start || "") === String(rightRanges[index]?.start || "")
      && String(range?.end || "") === String(rightRanges[index]?.end || "")
    ));
  });
}

export function toggleAvailabilityDay(current, day, enabled, intervalMinutes = DEFAULT_SLOT_INTERVAL_MINUTES) {
  const next = normalizeAvailability(current);
  next[day] = enabled ? defaultAvailabilityRanges(intervalMinutes) : [];
  return next;
}

export function toggleAvailabilityFrame(current, day, time, intervalMinutes = DEFAULT_SLOT_INTERVAL_MINUTES) {
  const next = normalizeAvailability(current);
  const selected = new Set(getSelectedAvailabilityFrames(next[day], intervalMinutes));
  if (selected.has(time)) {
    selected.delete(time);
  } else {
    selected.add(time);
  }
  next[day] = buildAvailabilityRangesFromFrames([...selected], intervalMinutes);
  return next;
}

export function normalizeSlotIntervalMinutes(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 5) {
    return DEFAULT_SLOT_INTERVAL_MINUTES;
  }
  return parsed;
}

export function defaultAvailabilityRanges(intervalMinutes = DEFAULT_SLOT_INTERVAL_MINUTES) {
  return buildAvailabilityRangesFromFrames(
    buildAvailabilityTimeFrames(intervalMinutes).filter((time) => time >= DEFAULT_AVAILABILITY_START && time < DEFAULT_AVAILABILITY_END),
    intervalMinutes
  );
}

export function buildAvailabilityTimeFrames(intervalMinutes = DEFAULT_SLOT_INTERVAL_MINUTES) {
  const frames = [];
  const step = normalizeSlotIntervalMinutes(intervalMinutes);
  for (let minutes = 8 * 60; minutes < 20 * 60; minutes += step) {
    frames.push(minutesToTimeString(minutes));
  }
  return frames;
}

export function getSelectedAvailabilityFrames(ranges, intervalMinutes = DEFAULT_SLOT_INTERVAL_MINUTES, timeFrames = buildAvailabilityTimeFrames(intervalMinutes)) {
  const normalizedRanges = Array.isArray(ranges) ? ranges : [];
  return timeFrames.filter((time) => {
    const slotStart = timeStringToMinutes(time);
    const slotEnd = slotStart + intervalMinutes;
    return normalizedRanges.some((range) => {
      const rangeStart = timeStringToMinutes(range?.start);
      const rangeEnd = timeStringToMinutes(range?.end);
      return Number.isFinite(rangeStart) && Number.isFinite(rangeEnd) && slotStart >= rangeStart && slotEnd <= rangeEnd;
    });
  });
}

export function buildAvailabilityRangesFromFrames(frames, intervalMinutes = DEFAULT_SLOT_INTERVAL_MINUTES) {
  const normalizedFrames = [...new Set(frames.map(timeStringToMinutes).filter(Number.isFinite))].sort((left, right) => left - right);
  if (!normalizedFrames.length) {
    return [];
  }
  const ranges = [];
  let rangeStart = normalizedFrames[0];
  let previous = normalizedFrames[0];

  for (let index = 1; index < normalizedFrames.length; index += 1) {
    const current = normalizedFrames[index];
    if (current !== previous + intervalMinutes) {
      ranges.push({
        start: minutesToTimeString(rangeStart),
        end: minutesToTimeString(previous + intervalMinutes)
      });
      rangeStart = current;
    }
    previous = current;
  }

  ranges.push({
    start: minutesToTimeString(rangeStart),
    end: minutesToTimeString(previous + intervalMinutes)
  });

  return ranges;
}

export function timeStringToMinutes(value) {
  const [hours, minutes] = String(value || "").split(":").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return Number.NaN;
  }
  return (hours * 60) + minutes;
}

export function minutesToTimeString(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function formatAvailabilityLabel(time) {
  const [hoursValue, minutesValue] = String(time || "00:00").split(":");
  const hours = Number.parseInt(hoursValue, 10);
  const minutes = Number.parseInt(minutesValue, 10);
  const period = hours >= 12 ? "PM" : "AM";
  const normalizedHours = hours % 12 || 12;
  return `${normalizedHours}:${String(minutes).padStart(2, "0")} ${period}`;
}
