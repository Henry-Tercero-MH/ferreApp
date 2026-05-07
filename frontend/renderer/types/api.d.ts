/**
 * Tipos para window.api (contextBridge). No migra el proyecto a TS:
 * con checkJs: true en jsconfig, estos .d.ts dan autocompletado e
 * inferencia en .js/.jsx sin tocar el runtime.
 *
 * Formato de respuesta unificado acordado con el main:
 *   exito:  { ok: true, data }
 *   error:  { ok: false, error: { code, message } }
 */

export {}

export type IpcOk<T> = { ok: true; data: T }
export type IpcErr   = { ok: false; error: { code: string; message: string } }
export type IpcResponse<T> = IpcOk<T> | IpcErr

export interface ProductRow {
  id: number
  code: string
  name: string
  price: number
  stock: number
}

export interface CustomerRow {
  id: number
  nit: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  active: number
  is_system: number
  created_at: string
  updated_at: string
}

export interface CustomerCreateInput {
  nit?: string
  name: string
  email?: string | null
  phone?: string | null
  address?: string | null
}

export interface CustomerListOptions {
  includeInactive?: boolean
}

export interface CustomerUpdateInput {
  nit?: string
  name?: string
  email?: string | null
  phone?: string | null
  address?: string | null
  active?: boolean
}

export interface SaleItemInput {
  id: number
  qty: number
  price: number
}

export interface SaleInput {
  items: SaleItemInput[]
  customerId?: number
  paymentMethod?: 'cash' | 'credit' | 'card' | 'transfer'
  clientType?: 'cf' | 'registered' | 'company'
  discountType?: 'none' | 'percent' | 'fixed'
  discountValue?: number
  userId?: number
  userName?: string
}

export interface SaleCreatedResult {
  saleId: number
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  currencyCode: string
  customerId: number
  customerName: string
  customerNit: string
}

export interface SaleRow {
  id: number
  subtotal: number
  tax_rate_applied: number
  tax_amount: number
  total: number
  currency_code: string
  date: string
  customer_id: number | null
  customer_name_snapshot: string | null
  customer_nit_snapshot: string | null
}

export interface SaleItemRow {
  id: number
  sale_id: number
  product_id: number
  qty: number
  price: number
  product_code: string | null
  product_name: string | null
}

export type SaleWithItems = SaleRow & { items: SaleItemRow[] }

export interface SaleListOptions {
  page?: number
  pageSize?: number
}

export interface SaleListResult {
  data: SaleRow[]
  total: number
  page: number
  pageSize: number
}

export type SettingValue = string | number | boolean | object | null
export type SettingsByCategory = Record<string, Record<string, SettingValue>>

export interface UserRow {
  id: number
  email: string
  full_name: string
  role: 'admin' | 'cashier' | 'mechanic' | 'warehouse'
  active: 0 | 1
  avatar: string | null
  created_at: string
  updated_at: string
}

export interface UserCreateInput {
  email: string
  full_name: string
  role: string
  password: string
}

export interface UserPatchInput {
  full_name?: string
  role?: string
}

export interface VoidSaleInput {
  saleId: number
  reason: string
  userId?: number
  userName?: string
}

export interface AuditListOptions {
  action?: string
  entity?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

export interface AuditRow {
  id: number
  action: string
  entity: string | null
  entity_id: number | null
  description: string | null
  user_name: string | null
  created_at: string
}

export interface AuditListResult {
  data: AuditRow[]
  total: number
  page: number
  pageSize: number
}

export interface SupplierRow {
  id: number
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  active: 0 | 1
  created_at: string
  updated_at: string
}

export interface PurchaseOrderRow {
  id: number
  supplier_id: number
  supplier_name: string
  status: 'draft' | 'sent' | 'received' | 'cancelled'
  notes: string | null
  created_by: number | null
  created_by_name: string | null
  created_at: string
  received_at: string | null
  total_cost: number
}

export interface PurchaseItemRow {
  id: number
  order_id: number
  product_id: number | null
  product_name: string
  product_code: string | null
  qty_ordered: number
  qty_received: number
  unit_cost: number
}

export interface PurchaseOrderDetail {
  order: PurchaseOrderRow
  items: PurchaseItemRow[]
}

export interface PurchaseCreateInput {
  supplierId: number
  notes?: string
  role: string
  userId: number
  userName: string
  items: {
    productId?: number
    productName: string
    productCode?: string
    qtyOrdered: number
    unitCost: number
  }[]
}

export interface PurchaseReceiveInput {
  orderId: number
  role: string
  items: { id: number; qty_received: number }[]
  updatePrices?: boolean
}

export interface PurchaseItemVariation extends PurchaseItemRow {
  current_cost: number | null
  has_variation: boolean
}

export interface CashSessionRow {
  id: number
  opened_by: number
  opened_by_name: string
  opened_at: string
  opening_amount: number
  closed_by: number | null
  closed_by_name: string | null
  closed_at: string | null
  closing_amount: number | null
  expected_amount: number | null
  difference: number | null
  notes: string | null
  status: 'open' | 'closed'
}

export interface CashMovementRow {
  id: number
  session_id: number
  type: 'in' | 'out'
  amount: number
  concept: string
  created_by: number | null
  created_at: string
}

export interface CashSessionDetail {
  session: CashSessionRow
  movements: CashMovementRow[]
  salesTotal: number
}

export interface CashOpenInput {
  userId: number
  userName: string
  role: string
  openingAmount: number
}

export interface CashCloseInput {
  userId: number
  userName: string
  role: string
  closingAmount: number
  notes?: string
}

export interface CashMovementInput {
  userId: number
  role: string
  type: 'in' | 'out'
  amount: number
  concept: string
}

export interface ReceivableRow {
  id: number
  customer_id: number | null
  customer_name: string
  customer_nit: string | null
  description: string
  amount: number
  amount_paid: number
  due_date: string | null
  status: 'pending' | 'partial' | 'paid' | 'cancelled'
  notes: string | null
  created_by: number | null
  created_by_name: string | null
  created_at: string
  updated_at: string
}

export interface ReceivablePaymentRow {
  id: number
  receivable_id: number
  amount: number
  payment_method: string
  notes: string | null
  created_by: number | null
  created_by_name: string | null
  created_at: string
}

export interface ReceivableDetail {
  receivable: ReceivableRow
  payments: ReceivablePaymentRow[]
}

export interface ReceivableSummary {
  total_count: number
  total_amount: number
  total_paid: number
  total_balance: number
  pending_balance: number
  partial_balance: number
  overdue_balance: number
}

export interface ReceivableCreateInput {
  customerId?: number
  customerName: string
  customerNit?: string
  description: string
  amount: number
  dueDate?: string
  notes?: string
  userId: number
  userName: string
}

export interface ApplyPaymentInput {
  receivableId: number
  amount: number
  paymentMethod?: string
  notes?: string
  userId: number
  userName: string
}

export interface CustomerBalance {
  rows: ReceivableRow[]
  balance: number
}

export interface CloudPullData {
  products?:   unknown[]
  customers?:  unknown[]
  categories?: unknown[]
  suppliers?:  unknown[]
}

export interface CloudPullResult {
  products?:   { applied: number }
  customers?:  { applied: number }
  categories?: { applied: number }
  suppliers?:  { applied: number }
}

export interface RendererApi {
  settings: {
    getAll():                                        Promise<IpcResponse<SettingsByCategory>>
    get(key: string):                                Promise<IpcResponse<SettingValue>>
    set(key: string, value: SettingValue):           Promise<IpcResponse<true>>
    upsert(key: string, value: SettingValue):        Promise<IpcResponse<true>>
    getByCategory(category: string):                 Promise<IpcResponse<Record<string, SettingValue>>>
  }
  products: {
    list():                                          Promise<IpcResponse<ProductRow[]>>
    listActive():                                    Promise<IpcResponse<ProductRow[]>>
    search(query: string):                           Promise<IpcResponse<ProductRow[]>>
    getById(id: number):                             Promise<IpcResponse<ProductRow | null>>
    create(input: unknown):                          Promise<IpcResponse<ProductRow>>
    update(id: number, patch: unknown):              Promise<IpcResponse<ProductRow>>
    remove(id: number):                              Promise<IpcResponse<true>>
    restore(id: number):                             Promise<IpcResponse<true>>
    adjustStock(id: number, type: string, qty: number): Promise<IpcResponse<true>>
  }
  customers: {
    list(opts?: CustomerListOptions):                Promise<IpcResponse<CustomerRow[]>>
    search(query: string, opts?: CustomerListOptions): Promise<IpcResponse<CustomerRow[]>>
    getById(id: number):                             Promise<IpcResponse<CustomerRow | null>>
    create(input: CustomerCreateInput):              Promise<IpcResponse<CustomerRow>>
    update(id: number, patch: CustomerUpdateInput):  Promise<IpcResponse<CustomerRow>>
    setActive(id: number, active: boolean):          Promise<IpcResponse<{ id: number }>>
    getSystem():                                     Promise<IpcResponse<CustomerRow[]>>
  }
  users: {
    login(email: string, password: string):          Promise<IpcResponse<UserRow>>
    list():                                          Promise<IpcResponse<UserRow[]>>
    getById(id: number):                             Promise<IpcResponse<UserRow | null>>
    create(input: UserCreateInput):                  Promise<IpcResponse<UserRow>>
    update(id: number, patch: UserPatchInput):       Promise<IpcResponse<UserRow>>
    changePassword(id: number, newPassword: string): Promise<IpcResponse<{ id: number }>>
    setActive(id: number, active: boolean):          Promise<IpcResponse<{ id: number }>>
    updateAvatar(id: number, avatar: string | null): Promise<IpcResponse<UserRow>>
  }
  sales: {
    create(saleData: SaleInput):                     Promise<IpcResponse<SaleCreatedResult>>
    getById(id: number):                             Promise<IpcResponse<SaleWithItems | null>>
    list(opts?: SaleListOptions):                    Promise<IpcResponse<SaleListResult>>
    dailyReport():                                   Promise<IpcResponse<{ summary: { sale_count: number; subtotal: number; tax_amount: number; total: number; cash_total: number; currency_code: string } | null; topProducts: unknown[] }>>
    void(input: VoidSaleInput):                      Promise<IpcResponse<{ id: number }>>
  }
  audit: {
    list(opts?: AuditListOptions):                   Promise<IpcResponse<AuditListResult>>
  }
  suppliers: {
    list():                                               Promise<IpcResponse<SupplierRow[]>>
    get(id: number):                                      Promise<IpcResponse<SupplierRow | null>>
    create(input: Partial<SupplierRow>, role: string):    Promise<IpcResponse<SupplierRow>>
    update(id: number, input: Partial<SupplierRow>, role: string): Promise<IpcResponse<SupplierRow>>
    setActive(id: number, active: boolean, role: string): Promise<IpcResponse<SupplierRow>>
  }
  purchases: {
    list():                                               Promise<IpcResponse<PurchaseOrderRow[]>>
    get(id: number):                                      Promise<IpcResponse<PurchaseOrderDetail>>
    create(input: PurchaseCreateInput):                   Promise<IpcResponse<PurchaseOrderRow>>
    markSent(id: number, role: string):                   Promise<IpcResponse<PurchaseOrderRow>>
    priceVariations(input: { orderId: number; role: string }): Promise<IpcResponse<PurchaseItemVariation[]>>
    receive(input: PurchaseReceiveInput):                 Promise<IpcResponse<PurchaseOrderRow>>
    cancel(id: number, role: string):                     Promise<IpcResponse<PurchaseOrderRow>>
  }
  cash: {
    getOpen():                                       Promise<IpcResponse<CashSessionRow | null>>
    list():                                          Promise<IpcResponse<CashSessionRow[]>>
    getSession(id: number):                          Promise<IpcResponse<CashSessionDetail>>
    open(input: CashOpenInput):                      Promise<IpcResponse<CashSessionRow>>
    close(input: CashCloseInput):                    Promise<IpcResponse<CashSessionRow>>
    addMovement(input: CashMovementInput):           Promise<IpcResponse<CashMovementRow>>
  }
  license: {
    status():                           Promise<IpcResponse<{ activated: boolean }>>
    activate(token: string):            Promise<IpcResponse<{ activated: boolean }>>
  }
  cloud: {
    applyPull(data: CloudPullData):     Promise<IpcResponse<CloudPullResult>>
  }
  categories: {
    list():                             Promise<IpcResponse<unknown[]>>
    listActive():                       Promise<IpcResponse<unknown[]>>
    create(name: string):               Promise<IpcResponse<unknown>>
    update(id: number, name: string):   Promise<IpcResponse<unknown>>
    setActive(id: number, active: boolean): Promise<IpcResponse<unknown>>
  }
  expenses: {
    list(opts?: unknown):               Promise<IpcResponse<unknown[]>>
    get(id: number):                    Promise<IpcResponse<unknown>>
    create(input: unknown):             Promise<IpcResponse<unknown>>
    update(id: number, input: unknown): Promise<IpcResponse<unknown>>
    remove(id: number):                 Promise<IpcResponse<unknown>>
    summary(from: string, to: string):  Promise<IpcResponse<unknown>>
    categories():                       Promise<IpcResponse<unknown[]>>
  }
  receivables: {
    list():                                              Promise<IpcResponse<ReceivableRow[]>>
    get(id: number):                                     Promise<IpcResponse<ReceivableDetail>>
    summary():                                           Promise<IpcResponse<ReceivableSummary>>
    paymentsToday():                                     Promise<IpcResponse<{ total: number; count: number }>>
    paymentsRange(range: { from: string; to: string }): Promise<IpcResponse<{ total: number; count: number }>>
    create(input: ReceivableCreateInput):                Promise<IpcResponse<ReceivableRow>>
    applyPayment(input: ApplyPaymentInput):              Promise<IpcResponse<ReceivableRow>>
    cancel(id: number):                                  Promise<IpcResponse<ReceivableRow>>
    byCustomer(id: number):                              Promise<IpcResponse<CustomerBalance>>
  }
}

declare global {
  interface Window {
    api: RendererApi
  }
}
