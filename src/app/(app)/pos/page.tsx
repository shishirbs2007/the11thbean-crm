import { requireUser } from "@/lib/auth";
import type {
  PosMenuCategory,
  PosMenuItem,
  PosRecentOrder,
} from "@/lib/pos/types";
import { Register } from "./register";

export const dynamic = "force-dynamic";

type CategoryRow = { id: string; name: string; sort_order: number };
type ItemRow = {
  id: string;
  name: string;
  price: number | string;
  sku: string | null;
  category_id: string | null;
  sort_order: number;
};

export default async function PosPage() {
  const { supabase } = await requireUser();

  const [{ data: categoryRows }, { data: itemRows }, { data: orderRows }] =
    await Promise.all([
      supabase
        .from("pos_menu_categories")
        .select("id, name, sort_order")
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("pos_menu_items")
        .select("id, name, price, sku, category_id, sort_order")
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("pos_orders")
        .select("id, order_number, total, payment_method, customer_name, placed_at, status")
        .order("placed_at", { ascending: false })
        .limit(8),
    ]);

  const items: ItemRow[] = (itemRows ?? []) as ItemRow[];
  const categories: PosMenuCategory[] = ((categoryRows ?? []) as CategoryRow[]).map(
    (c) => ({
      id: c.id,
      name: c.name,
      items: items
        .filter((i) => i.category_id === c.id)
        .map(
          (i): PosMenuItem => ({
            id: i.id,
            name: i.name,
            price: Number(i.price),
            sku: i.sku,
            category_id: i.category_id,
          }),
        ),
    }),
  );

  // Surface items with no category so nothing is hidden from staff.
  const uncategorized = items.filter((i) => !i.category_id);
  if (uncategorized.length > 0) {
    categories.push({
      id: "uncategorized",
      name: "Other",
      items: uncategorized.map(
        (i): PosMenuItem => ({
          id: i.id,
          name: i.name,
          price: Number(i.price),
          sku: i.sku,
          category_id: null,
        }),
      ),
    });
  }

  const recentOrders: PosRecentOrder[] = ((orderRows ?? []) as PosRecentOrder[]).map(
    (o) => ({ ...o, total: Number(o.total) }),
  );

  return <Register categories={categories} recentOrders={recentOrders} />;
}
