const GLOBAL_KEY = "__nevariSubscriptionEventHub";

function getHub() {
  if (!globalThis[GLOBAL_KEY]) {
    globalThis[GLOBAL_KEY] = {
      listeners: new Map(),
      sequence: 0,
      lastEvents: new Map(),
    };
  }
  return globalThis[GLOBAL_KEY];
}

export function publishSubscriptionEvent(payload = {}) {
  const hub = getHub();
  const userId = String(
    payload.user_id
    ?? payload.userId
    ?? payload.customer_user_id
    ?? payload.customerUserId
    ?? payload.related_user_id
    ?? payload.relatedUserId
    ?? payload.subscription?.user_id
    ?? payload.subscription?.userId
    ?? payload.payload?.user_id
    ?? payload.payload?.userId
    ?? ""
  ).trim();
  const event = {
    id: ++hub.sequence,
    type: String(payload.type || payload.event || "subscription.updated"),
    payload,
    timestamp: new Date().toISOString(),
  };
  if (userId) {
    hub.lastEvents.set(userId, event);
  }
  hub.listeners.forEach((listeners, listenerUserId) => {
    if (listenerUserId && userId && listenerUserId !== userId) {
      return;
    }
    if (listenerUserId && !userId) {
      return;
    }
    listeners.forEach((listener) => {
      try {
        listener(event);
      } catch {
        // ignore listener failures
      }
    });
  });
  return event;
}

export function subscribeSubscriptionEvents(userId, listener) {
  const hub = getHub();
  const key = String(userId || "").trim();
  const listeners = hub.listeners.get(key) || new Set();
  listeners.add(listener);
  hub.listeners.set(key, listeners);
  return () => {
    const nextListeners = hub.listeners.get(key);
    if (!nextListeners) {
      return;
    }
    nextListeners.delete(listener);
    if (!nextListeners.size) {
      hub.listeners.delete(key);
    }
  };
}

export function getLastSubscriptionEvent(userId) {
  return getHub().lastEvents.get(String(userId || "").trim()) || null;
}
