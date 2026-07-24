import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { Register } from "@/app/(app)/pos/register";
import { readQueue } from "@/lib/pos/offline";
import type { PosMenuCategory } from "@/lib/pos/types";

// The checkout server action can't run in jsdom, so mock it. Register imports
// it via "./actions", which resolves to this same module.
vi.mock("@/app/(app)/pos/actions", () => ({
  submitPosOrder: vi.fn(),
}));

import { submitPosOrder } from "@/app/(app)/pos/actions";

const submitMock = submitPosOrder as unknown as Mock;

const menu: PosMenuCategory[] = [
  {
    id: "cat-bakes",
    name: "Bakes",
    items: [
      { id: "item-brownie", name: "Brownie", price: 100, sku: "BRW", category_id: "cat-bakes" },
    ],
  },
];

function renderRegister() {
  return render(
    <Register categories={menu} recentOrders={[]} todayTotal={0} todayCount={0} />,
  );
}

function addBrownie() {
  // The menu tile's accessible name starts with the item name; the cart's
  // Increase/Decrease/Remove buttons are named "… Brownie", so anchor to start.
  fireEvent.click(screen.getByRole("button", { name: /^Brownie/ }));
}

beforeEach(() => {
  localStorage.clear();
  submitMock.mockReset();
});

describe("POS register", () => {
  it("shows today's total in the header", () => {
    render(
      <Register categories={menu} recentOrders={[]} todayTotal={250} todayCount={3} />,
    );
    expect(screen.getByLabelText("Today's sales total")).toHaveTextContent(
      "3 sales",
    );
  });

  it("adds an item and totals it on the charge button", () => {
    renderRegister();
    addBrownie();
    expect(screen.getByRole("button", { name: /Charge ₹\s?100/ })).toBeInTheDocument();
  });

  it("reflects quantity changes in the total", () => {
    renderRegister();
    addBrownie();
    addBrownie();
    expect(screen.getByRole("button", { name: /Charge ₹\s?200/ })).toBeInTheDocument();
  });

  it("records a cash sale and shows the receipt", async () => {
    submitMock.mockResolvedValue({
      ok: true,
      order_id: "o1",
      order_number: 7,
      created: true,
      total: 100,
      change_due: null,
    });
    renderRegister();
    addBrownie();
    fireEvent.click(screen.getByRole("button", { name: /Charge/ }));

    await waitFor(() =>
      expect(screen.getByText(/Order #7/)).toBeInTheDocument(),
    );
    expect(submitMock).toHaveBeenCalledTimes(1);
    expect(submitMock.mock.calls[0][0]).toMatchObject({
      payment_method: "cash",
      person_id: null,
      lines: [expect.objectContaining({ item_name: "Brownie", quantity: 1 })],
    });
  });

  it("sends the chosen payment method for a UPI sale", async () => {
    submitMock.mockResolvedValue({
      ok: true,
      order_id: "o2",
      order_number: 8,
      created: true,
      total: 100,
      change_due: null,
    });
    renderRegister();
    addBrownie();
    fireEvent.click(screen.getByRole("button", { name: "upi" }));
    fireEvent.click(screen.getByRole("button", { name: /Charge/ }));

    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    expect(submitMock.mock.calls[0][0].payment_method).toBe("upi");
  });

  it("queues the sale offline when checkout fails and copies the receipt", async () => {
    submitMock.mockRejectedValue(new Error("offline"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    renderRegister();
    addBrownie();
    fireEvent.click(screen.getByRole("button", { name: /Charge/ }));

    await waitFor(() =>
      expect(screen.getByText(/Saved offline/)).toBeInTheDocument(),
    );
    // Exactly one order queued for later idempotent replay.
    expect(readQueue()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain("The 11th Bean");
    expect(writeText.mock.calls[0][0]).toContain("Brownie");
  });
});
