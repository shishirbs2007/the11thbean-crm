"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  formatINR,
  type PosCheckoutLine,
  type PosCheckoutPayload,
  type PosMenuCategory,
  type PosRecentOrder,
} from "@/lib/pos/types";
import {
  buildReceiptText,
  type Receipt,
} from "@/lib/pos/receipt";
import {
  computeChange,
  computeSubtotal,
  computeTotal,
} from "@/lib/pos/totals";
import { enqueueOrder, readQueue, removeQueued } from "@/lib/pos/offline";
import { submitPosOrder } from "./actions";

type CartLine = {
  key: string;
  menu_item_id: string | null;
  item_name: string;
  category: string | null;
  unit_price: number;
  quantity: number;
};

const PAYMENT_METHODS = ["cash", "card", "upi"] as const;

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function newClientOrderId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Extremely defensive fallback; modern Android browsers have randomUUID.
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-4000-8000-000000000000`.slice(
    0,
    36,
  );
}

export function Register({
  categories,
  recentOrders,
  todayTotal,
  todayCount,
}: {
  categories: PosMenuCategory[];
  recentOrders: PosRecentOrder[];
  todayTotal: number;
  todayCount: number;
}) {
  const [activeCategory, setActiveCategory] = useState<string>(
    categories[0]?.id ?? "",
  );
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [customerName, setCustomerName] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<(typeof PAYMENT_METHODS)[number]>("cash");
  const [tendered, setTendered] = useState("");
  const [discount, setDiscount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");
  const [pendingCount, setPendingCount] = useState(0);

  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

  const [customItemName, setCustomItemName] = useState("");
  const [customItemPrice, setCustomItemPrice] = useState("");

  const lines = useMemo(() => Object.values(cart), [cart]);
  const subtotal = useMemo(() => computeSubtotal(lines), [lines]);
  const discountValue = Math.max(0, Number(discount) || 0);
  const total = computeTotal(subtotal, discountValue);
  const tenderedValue = tendered === "" ? null : Number(tendered);
  const change =
    paymentMethod === "cash" ? computeChange(total, tenderedValue) : null;

  const refreshPending = useCallback(() => {
    setPendingCount(readQueue().length);
  }, []);

  const flushQueue = useCallback(async () => {
    const queue = readQueue();
    if (queue.length === 0) return;
    for (const order of queue) {
      try {
        const result = await submitPosOrder(order);
        if (result.ok) {
          removeQueued(order.client_order_id);
        }
      } catch {
        // Still offline or the server is unreachable; stop and retry later.
        break;
      }
    }
    refreshPending();
  }, [refreshPending]);

  // Flush any queued offline orders on mount and whenever we come back online.
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    void (async () => {
      await flushQueue();
      if (!cancelled) refreshPending();
    })();
    return () => {
      cancelled = true;
    };
  }, [online, flushQueue, refreshPending]);

  function addItem(line: Omit<CartLine, "quantity">) {
    setReceipt(null);
    setCart((prev) => {
      const existing = prev[line.key];
      return {
        ...prev,
        [line.key]: existing
          ? { ...existing, quantity: existing.quantity + 1 }
          : { ...line, quantity: 1 },
      };
    });
  }

  function changeQty(key: string, delta: number) {
    setCart((prev) => {
      const existing = prev[key];
      if (!existing) return prev;
      const quantity = existing.quantity + delta;
      if (quantity <= 0) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: { ...existing, quantity } };
    });
  }

  function removeLine(key: string) {
    setCart((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function addCustomItem() {
    const name = customItemName.trim();
    const price = Number(customItemPrice);
    if (!name || !Number.isFinite(price) || price < 0) return;
    addItem({
      key: `custom-${newClientOrderId()}`,
      menu_item_id: null,
      item_name: name,
      category: null,
      unit_price: Math.round(price * 100) / 100,
    });
    setCustomItemName("");
    setCustomItemPrice("");
  }

  function resetSale() {
    setCart({});
    setCustomerName("");
    setTendered("");
    setDiscount("");
    setNotes("");
    setError(null);
  }

  async function checkout() {
    if (lines.length === 0 || submitting) return;
    if (paymentMethod === "cash" && tenderedValue !== null && change !== null && change < 0) {
      setError("Amount tendered is less than the total.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const payloadLines: PosCheckoutLine[] = lines.map((l) => ({
      menu_item_id: l.menu_item_id,
      item_name: l.item_name,
      category: l.category,
      unit_price: l.unit_price,
      quantity: l.quantity,
    }));

    const placedAt = new Date().toISOString();
    const payload: PosCheckoutPayload = {
      client_order_id: newClientOrderId(),
      person_id: null,
      customer_name: customerName.trim() || null,
      notes: notes.trim() || null,
      payment_method: paymentMethod,
      amount_tendered:
        paymentMethod === "cash" && tenderedValue !== null ? tenderedValue : null,
      discount_amount: discountValue,
      placed_at: placedAt,
      lines: payloadLines,
    };

    // Snapshot everything the receipt needs before the cart is reset.
    const receiptBase = {
      reference: payload.client_order_id,
      placed_at: placedAt,
      customer_name: payload.customer_name,
      items: payloadLines.map((l) => ({
        item_name: l.item_name,
        quantity: l.quantity,
        unit_price: l.unit_price,
      })),
      subtotal,
      discount: discountValue,
      total,
      payment_method: paymentMethod,
    };

    setShareState("idle");

    try {
      const result = await submitPosOrder(payload);
      if (result.ok) {
        setReceipt({
          ...receiptBase,
          order_number: result.order_number,
          total: result.total ?? total,
          change_due: result.change_due ?? change,
          synced: true,
        });
        resetSale();
      } else {
        setError(result.error);
      }
    } catch {
      // Offline or server unreachable: keep the sale locally and sync later.
      enqueueOrder(payload);
      refreshPending();
      setReceipt({
        ...receiptBase,
        order_number: null,
        change_due: change,
        synced: false,
      });
      resetSale();
    } finally {
      setSubmitting(false);
    }
  }

  async function shareReceipt() {
    if (!receipt) return;
    const text = buildReceiptText(receipt);
    const title = `The 11th Bean receipt${
      receipt.order_number !== null ? ` #${receipt.order_number}` : ""
    }`;

    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav && typeof nav.share === "function") {
      try {
        await nav.share({ title, text });
        return;
      } catch (err) {
        // User dismissed the share sheet — do nothing further.
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Otherwise fall through to the copy fallback.
      }
    }
    await copyReceipt();
  }

  async function copyReceipt() {
    if (!receipt) return;
    const text = buildReceiptText(receipt);
    try {
      const nav = typeof navigator !== "undefined" ? navigator : undefined;
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(text);
      } else if (typeof document !== "undefined") {
        const area = document.createElement("textarea");
        area.value = text;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      setShareState("copied");
    } catch {
      // Clipboard unavailable; nothing more we can safely do.
    }
  }

  const activeItems =
    categories.find((c) => c.id === activeCategory)?.items ?? [];

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Fallback POS</h1>
          <p className="text-sm text-neutral-600">
            Backup register — works offline when the main POS is down.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span
            className="rounded-full bg-neutral-900 px-3 py-1 text-white"
            aria-label="Today's sales total"
          >
            Today: {formatINR(todayTotal)} · {todayCount}{" "}
            {todayCount === 1 ? "sale" : "sales"}
          </span>
          {pendingCount > 0 && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">
              {pendingCount} pending sync
            </span>
          )}
          <span
            className={`flex items-center gap-2 rounded-full px-3 py-1 ${
              online ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                online ? "bg-green-600" : "bg-red-600"
              }`}
            />
            {online ? "Online" : "Offline"}
          </span>
        </div>
      </div>

      {receipt && (
        <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-green-900">
                {receipt.synced ? "Sale recorded" : "Saved offline"}
                {receipt.order_number ? ` · Order #${receipt.order_number}` : ""}
              </p>
              <p className="text-sm text-green-800">
                Total {formatINR(receipt.total)}
                {receipt.change_due !== null && receipt.change_due > 0
                  ? ` · Change ${formatINR(receipt.change_due)}`
                  : ""}
                {receipt.synced ? "" : " · will sync when back online"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={shareReceipt}
                className="rounded-xl border border-green-700 px-4 py-2 text-sm text-green-800"
              >
                Share receipt
              </button>
              <button
                onClick={copyReceipt}
                className="rounded-xl border border-green-700 px-4 py-2 text-sm text-green-800"
              >
                {shareState === "copied" ? "Copied ✓" : "Copy"}
              </button>
              <button
                onClick={() => setReceipt(null)}
                className="rounded-xl bg-green-700 px-4 py-2 text-sm text-white"
              >
                New order
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* Menu */}
        <section>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCategory(c.id)}
                className={`rounded-full px-4 py-2 text-sm ${
                  c.id === activeCategory
                    ? "bg-black text-white"
                    : "border text-neutral-700"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {categories.length === 0 && (
            <p className="mt-6 text-neutral-600">
              No menu items yet. Ask a manager to add items to the POS menu.
            </p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {activeItems.map((item) => (
              <button
                key={item.id}
                onClick={() =>
                  addItem({
                    key: item.id,
                    menu_item_id: item.id,
                    item_name: item.name,
                    category:
                      categories.find((c) => c.id === activeCategory)?.name ??
                      null,
                    unit_price: item.price,
                  })
                }
                className="flex min-h-24 flex-col justify-between rounded-2xl border p-4 text-left transition hover:border-black active:scale-[0.98]"
              >
                <span className="font-medium leading-tight">{item.name}</span>
                <span className="mt-2 text-sm text-neutral-600">
                  {formatINR(item.price)}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border p-4">
            <p className="text-sm font-medium text-neutral-700">Custom item</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                value={customItemName}
                onChange={(e) => setCustomItemName(e.target.value)}
                placeholder="Item name"
                className="min-w-40 flex-1 rounded-xl border px-3 py-2 text-sm"
              />
              <input
                value={customItemPrice}
                onChange={(e) => setCustomItemPrice(e.target.value)}
                inputMode="decimal"
                placeholder="Price"
                className="w-28 rounded-xl border px-3 py-2 text-sm"
              />
              <button
                onClick={addCustomItem}
                className="rounded-xl border px-4 py-2 text-sm"
              >
                Add
              </button>
            </div>
          </div>
        </section>

        {/* Cart & checkout */}
        <section className="rounded-2xl border p-4">
          <h2 className="font-semibold">Current order</h2>

          <div className="mt-3 space-y-2">
            {lines.length === 0 ? (
              <p className="text-sm text-neutral-500">Tap items to add them.</p>
            ) : (
              lines.map((l) => (
                <div
                  key={l.key}
                  className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{l.item_name}</p>
                    <p className="text-xs text-neutral-500">
                      {formatINR(l.unit_price)} × {l.quantity} ={" "}
                      {formatINR(l.unit_price * l.quantity)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => changeQty(l.key, -1)}
                      className="h-8 w-8 rounded-lg border text-lg leading-none"
                      aria-label={`Decrease ${l.item_name}`}
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm">{l.quantity}</span>
                    <button
                      onClick={() => changeQty(l.key, 1)}
                      className="h-8 w-8 rounded-lg border text-lg leading-none"
                      aria-label={`Increase ${l.item_name}`}
                    >
                      +
                    </button>
                    <button
                      onClick={() => removeLine(l.key)}
                      className="ml-1 text-xs text-red-600"
                      aria-label={`Remove ${l.item_name}`}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Customer name — receipt label only, not linked to any CRM record */}
          <div className="mt-4">
            <label className="text-xs font-medium text-neutral-600">
              Customer name (optional)
            </label>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="For the receipt"
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            />
          </div>

          {/* Payment */}
          <div className="mt-4 space-y-3 border-t pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-600">Subtotal</span>
              <span>{formatINR(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <label className="text-neutral-600">Discount</label>
              <input
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                className="w-24 rounded-lg border px-2 py-1 text-right"
              />
            </div>
            <div className="flex items-center justify-between text-base font-semibold">
              <span>Total</span>
              <span>{formatINR(total)}</span>
            </div>

            <div className="flex gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m}
                  onClick={() => setPaymentMethod(m)}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm capitalize ${
                    paymentMethod === m
                      ? "bg-black text-white"
                      : "border text-neutral-700"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {paymentMethod === "cash" && (
              <div className="space-y-2">
                <input
                  value={tendered}
                  onChange={(e) => setTendered(e.target.value)}
                  inputMode="decimal"
                  placeholder="Amount tendered"
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                />
                {change !== null && (
                  <p
                    className={`text-sm ${
                      change < 0 ? "text-red-600" : "text-neutral-700"
                    }`}
                  >
                    {change < 0
                      ? `Short by ${formatINR(Math.abs(change))}`
                      : `Change ${formatINR(change)}`}
                  </p>
                )}
              </div>
            )}

            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Order notes (optional)"
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              onClick={checkout}
              disabled={lines.length === 0 || submitting}
              className="w-full rounded-xl bg-black px-4 py-3 font-medium text-white disabled:opacity-40"
            >
              {submitting
                ? "Processing…"
                : `Charge ${formatINR(total)}`}
            </button>
            {!online && (
              <p className="text-center text-xs text-amber-700">
                Offline — the sale will be queued and synced automatically.
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Recent orders */}
      {recentOrders.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-neutral-700">
            Recent orders
          </h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {recentOrders.map((o) => (
              <div key={o.id} className="rounded-xl border p-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">#{o.order_number}</span>
                  <span>{formatINR(o.total)}</span>
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  {new Date(o.placed_at).toLocaleString()}
                  {o.payment_method ? ` · ${o.payment_method}` : ""}
                </p>
                {o.customer_name && (
                  <p className="text-xs text-neutral-500">{o.customer_name}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
