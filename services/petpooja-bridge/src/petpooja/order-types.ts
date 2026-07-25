// Normalized, vendor-neutral representation of a PetPooja order. Every level
// keeps the original `raw` payload so no source information is ever lost, even
// for fields we do not yet map.

export type NormalizedItem = {
  itemId: string | null;
  name: string | null;
  quantity: number | null;
  unitPrice: number | null;
  total: number | null;
  taxes: number | null;
  discount: number | null;
  variations: string[];
  addons: string[];
  raw: unknown;
};

export type NormalizedPayment = {
  type: string | null;
  amount: number | null;
  reference: string | null;
  raw: unknown;
};

export type NormalizedKot = {
  kotId: string | null;
  createdAt: string | null;
  raw: unknown;
};

export type NormalizedOrder = {
  petpoojaOrderId: string | null;
  invoiceNo: string | null;
  orderDateTime: string | null;
  status: string | null;
  orderType: string | null;
  orderSource: string | null;
  table: string | null;
  customerName: string | null;
  customerMobile: string | null;
  subtotal: number | null;
  discount: number | null;
  taxes: number | null;
  serviceCharge: number | null;
  deliveryCharge: number | null;
  containerCharge: number | null;
  roundOff: number | null;
  grandTotal: number | null;
  paymentStatus: string | null;
  captain: string | null;
  items: NormalizedItem[];
  payments: NormalizedPayment[];
  kots: NormalizedKot[];
  raw: unknown;
};

export type OrderPage = {
  orders: NormalizedOrder[];
  totalRecords: number | null;
  pageNo: number;
  perPage: number;
  raw: unknown;
};

export type OrdersResult = {
  fromDate: string;
  toDate: string;
  orders: NormalizedOrder[];
  totalRecords: number | null;
  pagesFetched: number;
  duplicatesRemoved: number;
};
