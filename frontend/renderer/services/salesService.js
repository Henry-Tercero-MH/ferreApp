import { z } from 'zod'
import { isElectron, get, envelope } from './webApiService.js'
import {
  saleCreatedSchema,
  saleInputSchema,
  saleListSchema,
  saleWithItemsSchema,
} from '@/schemas/sale.schema.js'
import { voidSaleInputSchema, voidSaleResultSchema } from '@/schemas/audit.schema.js'
import { unwrap } from './ipc.js'

export const dailyReportSchema = z.object({
  summary: z.object({
    sale_count:    z.number(),
    subtotal:      z.number(),
    tax_amount:    z.number(),
    total:         z.number(),
    cash_total:    z.number().default(0),
    currency_code: z.string(),
  }).nullable(),
  topProducts: z.array(z.object({
    id:         z.number(),
    code:       z.string().nullable(),
    name:       z.string().nullable(),
    units_sold: z.number(),
    revenue:    z.number(),
  })),
})

/** @typedef {import('zod').infer<typeof dailyReportSchema>} DailyReport */

export const rangeReportSchema = z.object({
  series: z.array(z.object({
    day:        z.string(),
    sale_count: z.number(),
    subtotal:   z.number(),
    total:      z.number(),
  })),
  topProducts: z.array(z.object({
    id:         z.number(),
    code:       z.string().nullable(),
    name:       z.string().nullable(),
    units_sold: z.number(),
    revenue:    z.number(),
  })),
  byHour: z.array(z.object({
    hour:       z.number(),
    sale_count: z.number(),
    total:      z.number(),
  })),
  byWeekday: z.array(z.object({
    weekday:    z.number(),
    sale_count: z.number(),
    total:      z.number(),
  })),
  byPaymentMethod: z.array(z.object({
    method:     z.string(),
    sale_count: z.number(),
    total:      z.number(),
  })),
})

/** @typedef {import('zod').infer<typeof rangeReportSchema>} RangeReport */

/** @returns {any} */
const _api = () => (/** @type {any} */ (window.api)).sales

// ─── Coerción para filas de Sheets ───────────────────────────

/** @param {any} r */
function _coerceSale(r) {
  return {
    ...r,
    id:                     Number(r.id)                     || 0,
    subtotal:               Number(r.subtotal)               || 0,
    tax_rate_applied:       Number(r.tax_rate ?? r.tax_rate_applied) || 0,
    tax_amount:             Number(r.tax_amount)             || 0,
    total:                  Number(r.total)                  || 0,
    currency_code:          r.currency_code                  || 'GTQ',
    date:                   r.date                           || '',
    customer_id:            r.customer_id !== '' && r.customer_id != null ? Number(r.customer_id) : null,
    customer_name_snapshot: r.customer_name_snapshot         || null,
    customer_nit_snapshot:  r.customer_nit_snapshot          || null,
    payment_method:         r.payment_method                 || null,
    client_type:            r.client_type                    || null,
    status:                 r.status === 'voided' ? 'voided' : 'active',
  }
}

// ─── Adaptador Electron ──────────────────────────────────────

const ipc = {
  create:      (/** @type {any} */ saleInput) => { const safe = saleInputSchema.parse(saleInput); return _api().create(safe).then((/** @type {any} */ r) => unwrap('sales:create', r, saleCreatedSchema)) },
  getById:     (/** @type {any} */ id) => _api().getById(id).then((/** @type {any} */ r) => unwrap('sales:get-by-id', r, saleWithItemsSchema.nullable())),
  list:        (/** @type {any} */ opts) => _api().list(opts ?? {}).then((/** @type {any} */ r) => unwrap('sales:list', r, saleListSchema)),
  dailyReport: () => _api().dailyReport().then((/** @type {any} */ r) => unwrap('sales:daily-report', r, dailyReportSchema)),
  voidSale:    (/** @type {any} */ input) => { const safe = voidSaleInputSchema.parse(input); return _api().void(safe).then((/** @type {any} */ r) => unwrap('sales:void', r, voidSaleResultSchema)) },
  rangeReport: (/** @type {any} */ range) => (/** @type {any} */ (window.api)).sales.rangeReport(range).then((/** @type {any} */ r) => unwrap('sales:range-report', r, rangeReportSchema)),
}

// ─── Adaptador Web (Apps Script) ─────────────────────────────

const web = {
  create:  async () => { throw new Error('Ventas no disponibles en versión web') },

  getById: async (/** @type {any} */ id) => {
    const [saleRows, itemRows] = await Promise.all([
      get('sales', { id: String(id) }),
      get('sale_items', { limit: 5000 }),
    ])
    const sale = (/** @type {any[]} */ (saleRows))[0]
    if (!sale) return null
    const coerced = _coerceSale(sale)
    const items = (/** @type {any[]} */ (itemRows))
      .filter(i => String(i.sale_id) === String(id))
      .map(i => ({
        id:           Number(i.id)           || 0,
        sale_id:      Number(i.sale_id)      || 0,
        product_id:   Number(i.product_id)   || 0,
        qty:          Number(i.qty)          || 0,
        price:        Number(i.price)        || 0,
        product_code: i.product_code         || null,
        product_name: i.product_name         || '',
      }))
    return saleWithItemsSchema.parse({ ...coerced, items })
  },

  list: async (/** @type {any} */ opts) => {
    const rows = await get('sales', { limit: 5000 })
    const data = (/** @type {any[]} */ (rows)).map(_coerceSale)
    const page     = Number(opts?.page)     || 1
    const pageSize = Number(opts?.pageSize) || 50
    return saleListSchema.parse({ data, total: data.length, page, pageSize })
  },

  dailyReport: async () => dailyReportSchema.parse({ summary: null, topProducts: [] }),
  voidSale:    async () => { throw new Error('No disponible en versión web') },
  rangeReport: async () => rangeReportSchema.parse({ series: [], topProducts: [], byHour: [], byWeekday: [], byPaymentMethod: [] }),
}

export const create      = isElectron ? ipc.create      : web.create
export const getById     = isElectron ? ipc.getById     : web.getById
export const list        = isElectron ? ipc.list        : web.list
export const dailyReport = isElectron ? ipc.dailyReport : web.dailyReport
export const voidSale    = isElectron ? ipc.voidSale    : web.voidSale
export const rangeReport = isElectron ? ipc.rangeReport : web.rangeReport
