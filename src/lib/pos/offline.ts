import type { PosCheckoutPayload } from "./types";

// Local durable queue for orders taken while offline. Orders are keyed by their
// device-generated client_order_id, which the server treats idempotently, so
// re-flushing the queue can never create duplicate sales.

const QUEUE_KEY = "bean-pos-queue-v1";

export type QueuedOrder = PosCheckoutPayload & { enqueued_at: string };

function canUseStorage(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

export function readQueue(): QueuedOrder[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedOrder[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(orders: QueuedOrder[]): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(orders));
  } catch {
    // Storage full or unavailable; nothing else we can safely do here.
  }
}

export function enqueueOrder(order: PosCheckoutPayload): void {
  const queue = readQueue();
  if (queue.some((o) => o.client_order_id === order.client_order_id)) return;
  queue.push({ ...order, enqueued_at: new Date().toISOString() });
  writeQueue(queue);
}

export function removeQueued(clientOrderId: string): void {
  writeQueue(readQueue().filter((o) => o.client_order_id !== clientOrderId));
}
