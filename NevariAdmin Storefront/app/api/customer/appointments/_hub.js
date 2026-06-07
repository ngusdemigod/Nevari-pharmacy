const GLOBAL_KEY = "__nevariAppointmentEventHub";

function getHub() {
  if (!globalThis[GLOBAL_KEY]) {
    globalThis[GLOBAL_KEY] = {
      listeners: new Set(),
      sequence: 0,
      lastEvent: null,
    };
  }
  return globalThis[GLOBAL_KEY];
}

export function publishAppointmentEvent(payload = {}) {
  const hub = getHub();
  const event = {
    id: ++hub.sequence,
    type: String(payload.type || payload.event || "appointment.updated"),
    payload,
    timestamp: new Date().toISOString(),
  };
  hub.lastEvent = event;
  hub.listeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // ignore listener failures
    }
  });
  return event;
}

export function subscribeAppointmentEvents(listener) {
  const hub = getHub();
  hub.listeners.add(listener);
  return () => hub.listeners.delete(listener);
}

export function getLastAppointmentEvent() {
  return getHub().lastEvent;
}
