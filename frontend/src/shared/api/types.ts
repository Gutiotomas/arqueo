/** Tipos del API. Los importes viajan como texto para no perder precision. */

export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'OTHER';

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH', label: 'Efectivo' },
  { value: 'CARD', label: 'Tarjeta' },
  { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'OTHER', label: 'Otro' },
];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  OTHER: 'Otro',
};

export interface Business {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  /** % que se queda el datáfono. Solo viene en GET /business, no en la sesión. */
  cardFeePercent?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  business: Business;
}

export interface Session {
  accessToken: string;
  user: User;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  summary?: { total: string };
}

export interface Category {
  id: string;
  name: string;
  _count?: { products?: number; expenses?: number };
}

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  costPrice: string;
  salePrice: string;
  stock: string;
  minStock: string;
  isActive: boolean;
}

export interface StockMovement {
  id: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT' | 'LOSS' | 'REPLACEMENT';
  delta: string;
  stockAfter: string;
  reason: string | null;
  createdAt: string;
  user: { id: string; name: string } | null;
  saleItem: { id: string; saleId: string } | null;
}

export interface SaleItem {
  id: string;
  productId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  subtotal: string;
  product: { id: string; name: string; unit: string } | null;
}

export interface Sale {
  id: string;
  date: string;
  paymentMethod: PaymentMethod;
  total: string;
  notes: string | null;
  items: SaleItem[];
  user: { id: string; name: string } | null;
}

export interface Expense {
  id: string;
  date: string;
  description: string;
  amount: string;
  paymentMethod: PaymentMethod;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  notes: string | null;
}

export interface CashClosing {
  id: string;
  date: string;
  openingCash: string;
  closingCash: string;
  expectedCash: string;
  difference: string;
  notes: string | null;
}

export interface CashPreview {
  date: string;
  openingCash: string;
  cashSales: string;
  cashSalesCount: number;
  cashExpenses: string;
  cashExpensesCount: number;
  /** Abonos a proveedores y reposiciones pagadas, en efectivo. */
  cashSupplierPayments: string;
  cashSupplierPaymentsCount: number;
  /** Efectivo consignado en la cuenta ese día. */
  depositedToAccount: string;
  /** Dinero sacado de la cuenta para la caja ese día. */
  withdrawnFromAccount: string;
  expectedCash: string;
  existingClosingId: string | null;
}

/** Dinero que entra o sale de la cuenta sin ser venta, gasto ni abono. */
export type AccountMovementType =
  | 'CASH_DEPOSIT'
  | 'CASH_WITHDRAWAL'
  | 'OTHER_IN'
  | 'OTHER_OUT';

export interface AccountMovement {
  id: string;
  date: string;
  type: AccountMovementType;
  amount: string;
  description: string | null;
}

export interface AccountClosing {
  id: string;
  date: string;
  /** Vacío en el primer cierre, que es el punto de partida. */
  openingBalance: string | null;
  closingBalance: string;
  expectedBalance: string;
  difference: string;
  notes: string | null;
}

/** Lo que entró y salió de la cuenta en un tramo de fechas. */
export interface AccountFlows {
  transferSales: string;
  transferSalesCount: number;
  cardSales: string;
  cardFees: string;
  cardSalesCount: number;
  expenses: string;
  expensesCount: number;
  supplierPayments: string;
  supplierPaymentsCount: number;
  cashDeposits: string;
  cashWithdrawals: string;
  otherIn: string;
  otherOut: string;
  net: string;
}

export interface AccountPreview {
  date: string;
  existingClosingId: string | null;
  /** Si hay un cierre después, este día ya no se puede cerrar ni corregir. */
  laterClosingDate: string | null;
  isStartingPoint: boolean;
  previousClosing: { id: string; date: string; closingBalance: string } | null;
  openingBalance: string | null;
  movements: AccountFlows | null;
  expectedBalance: string | null;
}

export interface AccountSummary {
  lastClosing: {
    id: string;
    date: string;
    closingBalance: string;
    difference: string;
  } | null;
  estimatedBalance: string | null;
  sinceLastClosing: AccountFlows | null;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface DashboardSummary {
  range: DateRange;
  sales: string;
  expenses: string;
  /** Costo de la mercancía vendida en el periodo. */
  cogs: string;
  /** Ventas menos el costo de la mercancía: el margen de verdad. */
  grossProfit: string;
  grossMargin: number;
  /** Mercancía dañada que el proveedor no repuso. */
  losses: string;
  /** Utilidad neta: la bruta menos los gastos de operar. */
  profit: string;
  salesCount: number;
  expensesCount: number;
  averageTicket: string;
  lowStockCount: number;
  previous: {
    range: DateRange;
    sales: string;
    expenses: string;
    grossProfit: string;
    profit: string;
  };
  change: {
    sales: number | null;
    expenses: number | null;
    grossProfit: number | null;
    profit: number | null;
  };
}

export interface TimeseriesPoint {
  bucket: string;
  sales: string;
  expenses: string;
  profit: string;
}

export interface PaymentMethodSlice {
  paymentMethod: PaymentMethod;
  total: string;
  count: number;
  percentage: number;
}

export interface CategorySlice {
  categoryId: string | null;
  name: string;
  total: string;
  count: number;
  percentage: number;
}

export interface TopProduct {
  productId: string;
  name: string;
  unit: string;
  quantity: string;
  revenue: string;
  cost: string;
  margin: string;
  marginPercentage: number;
}

export interface LowStockProduct {
  id: string;
  name: string;
  unit: string;
  stock: string;
  minStock: string;
  category: { id: string; name: string } | null;
}

/** Estado de cuenta con un proveedor. */
export interface SupplierStatement {
  business: { name: string; currency: string; timezone: string };
  supplier: { id: string; name: string; phone: string | null };
  period: { from: string; to: string; label: string; allTime: boolean };
  generatedAt: string;
  summary: {
    openingBalance: string;
    purchased: string;
    paid: string;
    closingBalance: string;
    /** Lo que se le debe hoy, sea del periodo que sea. */
    currentBalance: string;
    overdue: string;
    purchasesCount: number;
    paymentsCount: number;
  };
  purchases: {
    date: string;
    invoiceNumber: string | null;
    isOpeningBalance: boolean;
    detail: string;
    total: string;
    paid: string;
    balance: string;
    dueDate: string | null;
    status: PurchaseStatus;
  }[];
  payments: {
    date: string;
    purchase: string;
    paymentMethod: string;
    amount: string;
    notes: string | null;
  }[];
  pending: {
    date: string;
    invoiceNumber: string | null;
    isOpeningBalance: boolean;
    detail: string;
    total: string;
    paid: string;
    balance: string;
    dueDate: string | null;
    daysOverdue: number;
  }[];
}

export interface ReportData {
  business: { name: string; currency: string; timezone: string };
  period: { type: string; label: string; from: string; to: string };
  generatedAt: string;
  kpis: {
    sales: string;
    expenses: string;
    profit: string;
    salesCount: number;
    expensesCount: number;
    averageTicket: string;
  };
  daily: { date: string; sales: string; expenses: string; profit: string }[];
  byPaymentMethod: { paymentMethod: string; total: string; count: number; percentage: number }[];
  byExpenseCategory: { name: string; total: string; count: number; percentage: number }[];
  topProducts: { name: string; quantity: string; revenue: string; margin: string }[];
  sales: unknown[];
  expenses: unknown[];
  cashClosings: unknown[];
}

// --- Compras a proveedor y contabilidad -----------------------------------

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  _count?: { purchases: number };
}

export interface PurchaseItem {
  id: string;
  productId: string;
  quantity: string;
  unitCost: string;
  subtotal: string;
  product: { id: string; name: string; unit: string };
}

export interface PurchasePayment {
  id: string;
  date: string;
  amount: string;
  paymentMethod: PaymentMethod;
  notes: string | null;
}

export type PurchaseStatus = 'pending' | 'partial' | 'paid';

export interface Purchase {
  id: string;
  date: string;
  invoiceNumber: string | null;
  dueDate: string | null;
  total: string;
  paidAmount: string;
  /** Lo que queda por pagar. */
  balance: string;
  status: PurchaseStatus;
  notes: string | null;
  /** Deuda de antes de usar Arqueo: no trae productos ni movió el inventario. */
  isOpeningBalance: boolean;
  items: PurchaseItem[];
  payments: PurchasePayment[];
  supplier: { id: string; name: string } | null;
}

export interface SupplierDebt {
  total: string;
  overdue: string;
  purchasesCount: number;
  bySupplier: {
    supplierId: string | null;
    name: string;
    balance: string;
    purchasesCount: number;
  }[];
}

export interface AccountingOverview {
  range: DateRange;
  sales: string;
  /** Costo de la mercancía vendida. */
  cogs: string;
  grossProfit: string;
  grossMargin: number;
  /** Mercancía dañada que el proveedor no repuso, valorada al costo. */
  losses: string;
  lossesCount: number;
  operatingExpenses: string;
  /** Lo que se quedó el datáfono de las ventas con tarjeta. */
  cardFees: string;
  netProfit: string;
  netMargin: number;
  salesCount: number;
  expensesCount: number;
  previous: {
    sales: string;
    cogs: string;
    grossProfit: string;
    operatingExpenses: string;
    netProfit: string;
  };
  change: {
    sales: number | null;
    grossProfit: number | null;
    netProfit: number | null;
  };
  inventoryValue: string;
  inventoryUnits: string;
  supplierDebt: string;
  purchases: string;
  supplierPayments: string;
  workingCapital: string;
  verdict: 'profit' | 'loss' | 'breakeven';
}

// --- Mercancía dañada, vencida o perdida ----------------------------------

export type LossReason = 'DAMAGED' | 'EXPIRED' | 'THEFT' | 'OTHER';

export const LOSS_REASONS: { value: LossReason; label: string }[] = [
  { value: 'DAMAGED', label: 'Se dañó o se rompió' },
  { value: 'EXPIRED', label: 'Se venció' },
  { value: 'THEFT', label: 'Robo o faltante' },
  { value: 'OTHER', label: 'Otro motivo' },
];

export const LOSS_REASON_LABELS: Record<LossReason, string> = {
  DAMAGED: 'Dañado',
  EXPIRED: 'Vencido',
  THEFT: 'Robo',
  OTHER: 'Otro',
};

/** Qué hizo el proveedor con la mercancía dañada. */
export type LossResolution = 'PENDING' | 'FREE' | 'DISCOUNTED' | 'NONE';

export const LOSS_RESOLUTIONS: {
  value: LossResolution;
  label: string;
  hint: string;
}[] = [
  {
    value: 'PENDING',
    label: 'Aún no sé',
    hint: 'Todavía no has hablado con el proveedor',
  },
  {
    value: 'FREE',
    label: 'La repone gratis',
    hint: 'Te la cambia sin cobrarte: no pierdes dinero',
  },
  {
    value: 'DISCOUNTED',
    label: 'La repone cobrando',
    hint: 'Te la cambia pero pagando algo: pierdes solo esa parte',
  },
  {
    value: 'NONE',
    label: 'No la repone',
    hint: 'Pierdes todo lo que te costó esa mercancía',
  },
];

export const LOSS_RESOLUTION_LABELS: Record<LossResolution, string> = {
  PENDING: 'Sin respuesta',
  FREE: 'Repuesta gratis',
  DISCOUNTED: 'Repuesta con cobro',
  NONE: 'Pérdida total',
};

export interface StockLoss {
  id: string;
  date: string;
  quantity: string;
  /** Costo que tenía la mercancía el día que se dañó. */
  unitCost: string;
  reason: LossReason;
  resolution: LossResolution;
  replacementUnitCost: string;
  paymentMethod: PaymentMethod | null;
  /** Lo que el negocio pierde de verdad con este caso. */
  lossAmount: string;
  resolvedAt: string | null;
  notes: string | null;
  product: { id: string; name: string; unit: string };
  supplier: { id: string; name: string } | null;
}

export interface LossSummary {
  range: DateRange;
  total: string;
  count: number;
  /** Lo que está en el aire hasta que el proveedor conteste. */
  pending: string;
  pendingCount: number;
  byReason: {
    reason: LossReason;
    total: string;
    quantity: string;
    count: number;
  }[];
}
