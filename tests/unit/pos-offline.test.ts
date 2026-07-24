import { beforeEach, describe, expect, it } from "vitest";

import {
  enqueueOrder,
  readQueue,
  removeQueued,
  type QueuedOrder,
} from "@/lib/pos/offline";
import type { PosCheckoutPayload } from "@/lib/pos/types";

function makePayload(id: string): PosCheckoutPayload {
  return {
    client_order_id: id,
    person_id: null,
    customer_name: null,
    notes: null,
    payment_method: "cash",
    amount_tendered: 100,
    discount_amount: 0,
    placed_at: "2026-07-24T05:30:00.000Z",
    lines: [
      { menu_item_id: null, item_name: "Brownie", category: "Bakes", unit_price: 100, quantity: 1 },
    ],
  };
}

describe("offline order queue", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts empty", () => {
    expect(readQueue()).toEqual([]);
  });

  it("enqueues an order and preserves reconciliation fields", () => {
    enqueueOrder(makePayload("11111111-1111-1111-1111-111111111111"));
    const queue = readQueue();
    expect(queue).toHaveLength(1);
    const order = queue[0] as QueuedOrder;
    expect(order.client_order_id).toBe("11111111-1111-1111-1111-111111111111");
    expect(order.payment_method).toBe("cash");
    expect(order.enqueued_at).toBeTruthy();
  });

  it("does not duplicate the same client_order_id (idempotent replay guard)", () => {
    const id = "22222222-2222-2222-2222-222222222222";
    enqueueOrder(makePayload(id));
    enqueueOrder(makePayload(id));
    expect(readQueue()).toHaveLength(1);
  });

  it("keeps distinct orders separate", () => {
    enqueueOrder(makePayload("33333333-3333-3333-3333-333333333333"));
    enqueueOrder(makePayload("44444444-4444-4444-4444-444444444444"));
    expect(readQueue()).toHaveLength(2);
  });

  it("removes a synced order by client_order_id", () => {
    const id = "55555555-5555-5555-5555-555555555555";
    enqueueOrder(makePayload(id));
    enqueueOrder(makePayload("66666666-6666-6666-6666-666666666666"));
    removeQueued(id);
    const queue = readQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.client_order_id).toBe("66666666-6666-6666-6666-666666666666");
  });

  it("survives corrupt storage without throwing", () => {
    localStorage.setItem("bean-pos-queue-v1", "{not json");
    expect(readQueue()).toEqual([]);
  });
});
