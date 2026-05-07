import { unwrap } from './ipc.js'
import { isElectron, get, insert, update as webUpdate, envelope } from './webApiService.js'
import {
  supplierSchema, supplierListSchema,
  purchaseOrderSchema, purchaseOrderListSchema, purchaseOrderDetailSchema,
} from '@/schemas/purchases.schema.js'

function _coerceSupplier(r) {
  return { ...r, id: Number(r.id), active: Number(r.active ?? 1) }
}
function _coerceOrder(r) {
  return { ...r, id: Number(r.id), supplier_id: Number(r.supplier_id), total_cost: Number(r.total_cost ?? 0) }
}

// ── Suppliers ──────────────────────────────────────────────────────────────

const suppliersIpc = {
  list:      ()               => window.api.suppliers.list().then(r => unwrap('suppliers:list',       r, supplierListSchema)),
  get:       (id)             => window.api.suppliers.get(id).then(r => unwrap('suppliers:get',       r, supplierSchema.nullable())),
  create:    (input, role)    => window.api.suppliers.create(input, role).then(r => unwrap('suppliers:create',    r, supplierSchema)),
  update:    (id, input, role)=> window.api.suppliers.update(id, input, role).then(r => unwrap('suppliers:update', r, supplierSchema)),
  setActive: (id, active, role)=>window.api.suppliers.setActive(id, active, role).then(r => unwrap('suppliers:set-active', r, supplierSchema)),
}

const suppliersWeb = {
  list:      async ()              => { const rows = await get('suppliers', { limit: 500 }); return supplierListSchema.parse((/** @type {any[]} */ (rows)).map(_coerceSupplier)) },
  get:       async (id)            => { const rows = await get('suppliers', { id: String(id) }); const r = (/** @type {any[]} */ (rows))[0]; return r ? supplierSchema.parse(_coerceSupplier(r)) : null },
  create:    async (input)         => { const r = await insert('suppliers', input); return supplierSchema.parse(_coerceSupplier(r)) },
  update:    async (id, input)     => { const r = await webUpdate('suppliers', { id, ...input }); return supplierSchema.parse(_coerceSupplier(r)) },
  setActive: async ()              => supplierSchema.parse({ id: 0, name: '', active: 0, created_at: '', updated_at: '' }),
}

export const listSuppliers    = isElectron ? suppliersIpc.list      : suppliersWeb.list
export const getSupplier      = isElectron ? suppliersIpc.get       : suppliersWeb.get
export const createSupplier   = isElectron ? suppliersIpc.create    : suppliersWeb.create
export const updateSupplier   = isElectron ? suppliersIpc.update    : suppliersWeb.update
export const setSupplierActive= isElectron ? suppliersIpc.setActive : suppliersWeb.setActive

// ── Orders ─────────────────────────────────────────────────────────────────

const ordersIpc = {
  list:             ()       => window.api.purchases.list().then(r           => unwrap('purchases:list',             r, purchaseOrderListSchema)),
  get:              (id)     => window.api.purchases.get(id).then(r          => unwrap('purchases:get',              r, purchaseOrderDetailSchema)),
  create:           (input)  => window.api.purchases.create(input).then(r    => unwrap('purchases:create',           r, purchaseOrderSchema)),
  markSent:         (id, role)=>window.api.purchases.markSent(id, role).then(r=>unwrap('purchases:mark-sent',        r, purchaseOrderSchema)),
  priceVariations:  (input)  => window.api.purchases.priceVariations(input).then(r => { if (!r.ok) throw new Error(r.error?.message ?? 'Error'); return /** @type {any} */ (r.data) }),
  receive:          (input)  => window.api.purchases.receive(input).then(r   => unwrap('purchases:receive',          r, purchaseOrderSchema)),
  cancel:           (id, role)=>window.api.purchases.cancel(id, role).then(r => unwrap('purchases:cancel',           r, purchaseOrderSchema)),
}

const _notAvailable = () => Promise.reject(new Error('No disponible en versión web'))

const ordersWeb = {
  list:            async () => [],
  get:             _notAvailable,
  create:          _notAvailable,
  markSent:        _notAvailable,
  priceVariations: _notAvailable,
  receive:         _notAvailable,
  cancel:          _notAvailable,
}

export const listOrders        = isElectron ? ordersIpc.list            : ordersWeb.list
export const getOrder          = isElectron ? ordersIpc.get             : ordersWeb.get
export const createOrder       = isElectron ? ordersIpc.create          : ordersWeb.create
export const markSent          = isElectron ? ordersIpc.markSent        : ordersWeb.markSent
export const getPriceVariations= isElectron ? ordersIpc.priceVariations : ordersWeb.priceVariations
export const receiveOrder      = isElectron ? ordersIpc.receive         : ordersWeb.receive
export const cancelOrder       = isElectron ? ordersIpc.cancel          : ordersWeb.cancel
