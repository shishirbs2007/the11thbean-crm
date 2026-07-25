import { z } from "zod";
import { BridgeError } from "./errors.ts";

// The complete, closed set of operations the bridge will perform. Anything not
// listed here is rejected — the bridge is never a generic remote-control or a
// pass-through proxy to arbitrary PetPooja routes.

export const OPERATIONS = [
  "status",
  "menu.get",
  "customer.find",
  "customer.create",
  "order.get",
  "order.create",
  "receipt.get",
] as const;

export type Operation = (typeof OPERATIONS)[number];

// Reads are safe to retry; writes are not (they require idempotency instead).
export const READ_OPERATIONS: ReadonlySet<Operation> = new Set([
  "status",
  "menu.get",
  "customer.find",
  "order.get",
  "receipt.get",
]);

export const WRITE_OPERATIONS: ReadonlySet<Operation> = new Set([
  "customer.create",
  "order.create",
]);

const customerFind = z
  .object({
    phone: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    externalId: z.string().trim().min(1).optional(),
  })
  .refine((v) => v.phone || v.name || v.externalId, {
    message: "one of phone, name or externalId is required",
  });

const orderLine = z.object({
  itemId: z.string().trim().min(1),
  name: z.string().trim().optional(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative().optional(),
  notes: z.string().trim().optional(),
});

const SCHEMAS: Record<Operation, z.ZodTypeAny> = {
  status: z.object({}).strict().optional().default({}),
  "menu.get": z.object({}).strict().optional().default({}),
  "customer.find": customerFind,
  "customer.create": z.object({
    name: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
    email: z.string().trim().email().optional(),
  }),
  "order.get": z.object({ externalId: z.string().trim().min(1) }),
  "order.create": z.object({
    clientOrderId: z.string().trim().min(1),
    customer: customerFind.optional(),
    lines: z.array(orderLine).min(1),
    note: z.string().trim().optional(),
  }),
  "receipt.get": z.object({ externalId: z.string().trim().min(1) }),
};

export function isOperation(value: unknown): value is Operation {
  return typeof value === "string" && (OPERATIONS as readonly string[]).includes(value);
}

// Validate a params payload for an operation, or throw invalid_request.
export function validateParams(op: Operation, params: unknown): unknown {
  const schema = SCHEMAS[op];
  const result = schema.safeParse(params ?? {});
  if (!result.success) {
    throw new BridgeError("invalid_request", `Invalid params for ${op}`, {
      details: result.error.issues.map((i) => ({ path: i.path, message: i.message })),
    });
  }
  return result.data;
}
