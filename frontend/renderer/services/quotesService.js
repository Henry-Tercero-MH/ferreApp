import { z } from 'zod'
import { unwrap } from './ipc.js'
import { isElectron, get, insert, update as webUpdate } from './webApiService.js'
import {
  quoteSchema, quoteListSchema, quoteDetailSchema, convertResultSchema,
} from '@/schemas/quotes.schema.js'

// ─── Coerciones ──────────────────────────────────────────────

/** @param {any} r */
function _coerceQuote(r) {
  return {
    ...r,
    id:              Number(r.id)              || 0,
    customer_id:     r.customer_id !== '' && r.customer_id != null ? Number(r.customer_id) : null,
    customer_name:   r.customer_name   || '',
    customer_nit:    r.customer_nit    || null,
    notes:           r.notes           || null,
    valid_until:     r.valid_until     || null,
    subtotal:        Number(r.subtotal)  || 0,
    tax_rate:        Number(r.tax_rate)  || 0,
    tax_amount:      Number(r.tax_amount)|| 0,
    total:           Number(r.total)     || 0,
    created_by:      r.created_by !== '' && r.created_by != null ? Number(r.created_by) : null,
    created_by_name: r.created_by_name || null,
    sale_id:         r.sale_id !== '' && r.sale_id != null ? Number(r.sale_id) : null,
    created_at:      r.created_at || '',
    updated_at:      r.updated_at || '',
    status:          ['draft','sent','accepted','rejected','converted'].includes(r.status) ? r.status : 'draft',
  }
}

/** @param {any} i */
function _coerceItem(i) {
  return {
    id:           Number(i.id)           || 0,
    quote_id:     Number(i.quote_id)     || 0,
    product_id:   i.product_id !== '' && i.product_id != null ? Number(i.product_id) : null,
    product_name: i.product_name         || '',
    product_code: i.product_code         || null,
    qty:          Number(i.qty)          || 0,
    unit_price:   Number(i.unit_price)   || 0,
    subtotal:     Number(i.subtotal)     || 0,
  }
}

// ─── Adaptador Electron ──────────────────────────────────────

/** @returns {any} */
const _api = () => (/** @type {any} */ (window.api)).quotes

const ipc = {
  list:                  ()       => _api().list().then((/** @type {any} */ r)              => unwrap('quotes:list',               r, quoteListSchema)),
  get:                   (/** @type {any} */ id)    => _api().get(id).then((/** @type {any} */ r)             => unwrap('quotes:get',                r, quoteDetailSchema)),
  create:                (/** @type {any} */ input) => _api().create(input).then((/** @type {any} */ r)       => unwrap('quotes:create',             r, quoteSchema)),
  update:                (/** @type {any} */ id, /** @type {any} */ input) => _api().update(id, input).then((/** @type {any} */ r) => unwrap('quotes:update', r, quoteSchema)),
  markSent:              (/** @type {any} */ id)    => _api().markSent(id).then((/** @type {any} */ r)        => unwrap('quotes:mark-sent',          r, quoteSchema)),
  accept:                (/** @type {any} */ id)    => _api().accept(id).then((/** @type {any} */ r)          => unwrap('quotes:accept',             r, quoteSchema)),
  reject:                (/** @type {any} */ id)    => _api().reject(id).then((/** @type {any} */ r)          => unwrap('quotes:reject',             r, quoteSchema)),
  convert:               (/** @type {any} */ input) => _api().convert(input).then((/** @type {any} */ r)      => unwrap('quotes:convert',            r, convertResultSchema)),
  convertToReceivable:   (/** @type {any} */ input) => _api().convertReceivable(input).then((/** @type {any} */ r) => unwrap('quotes:convert-receivable', r, z.object({ quote: quoteSchema, receivable: z.any() }))),
}

// ─── Adaptador Web (Apps Script) ─────────────────────────────

const web = {
  list: async () => {
    const rows = await get('quotes', { limit: 5000 })
    return quoteListSchema.parse((/** @type {any[]} */ (rows)).map(_coerceQuote))
  },

  get: async (/** @type {any} */ id) => {
    const [quoteRows, itemRows] = await Promise.all([
      get('quotes',      { id: String(id) }),
      get('quote_items', { limit: 5000 }),
    ])
    const quote = (/** @type {any[]} */ (quoteRows))[0]
    if (!quote) throw new Error('Cotización no encontrada')
    const items = (/** @type {any[]} */ (itemRows))
      .filter(i => String(i.quote_id) === String(id))
      .map(_coerceItem)
    return quoteDetailSchema.parse({ quote: _coerceQuote(quote), items })
  },

  create: async (/** @type {any} */ input) => {
    const existing = await get('quotes', { limit: 5000 }).catch(() => [])
    const maxId = (/** @type {any[]} */ (existing)).reduce((m, r) => Math.max(m, Number(r.id) || 0), 0)
    const newId = maxId + 1
    const now   = new Date().toISOString()

    await insert('quotes', {
      id:               newId,
      customer_id:      input.customer_id      ?? '',
      customer_name:    input.customer_name     ?? '',
      customer_nit:     input.customer_nit      ?? '',
      customer_phone:   input.customer_phone    ?? '',
      customer_address: input.customer_address  ?? '',
      status:           'draft',
      notes:            input.notes             ?? '',
      valid_until:      input.valid_until        ?? '',
      subtotal:         input.subtotal           ?? 0,
      tax_rate:         input.tax_rate           ?? 0,
      tax_amount:       input.tax_amount         ?? 0,
      total:            input.total              ?? 0,
      created_by:       input.created_by         ?? '',
      created_by_name:  input.created_by_name    ?? '',
      sale_id:          '',
      created_at:       now,
      updated_at:       now,
    })

    // Insertar items
    const itemsIn = /** @type {any[]} */ (input.items ?? [])
    for (const item of itemsIn) {
      await insert('quote_items', {
        quote_id:     newId,
        product_id:   item.product_id   ?? '',
        product_name: item.product_name ?? '',
        product_code: item.product_code ?? '',
        qty:          item.qty          ?? 0,
        unit_price:   item.unit_price   ?? 0,
        subtotal:     item.subtotal     ?? 0,
      })
    }

    const rows = await get('quotes', { id: String(newId) })
    return quoteSchema.parse(_coerceQuote((/** @type {any[]} */ (rows))[0]))
  },

  update: async (/** @type {any} */ id, /** @type {any} */ input) => {
    const now = new Date().toISOString()
    await webUpdate('quotes', {
      id,
      customer_id:      input.customer_id      ?? '',
      customer_name:    input.customer_name     ?? '',
      customer_nit:     input.customer_nit      ?? '',
      customer_phone:   input.customer_phone    ?? '',
      customer_address: input.customer_address  ?? '',
      notes:            input.notes             ?? '',
      valid_until:      input.valid_until        ?? '',
      subtotal:         input.subtotal           ?? 0,
      tax_rate:         input.tax_rate           ?? 0,
      tax_amount:       input.tax_amount         ?? 0,
      total:            input.total              ?? 0,
      updated_at:       now,
    })
    const rows = await get('quotes', { id: String(id) })
    return quoteSchema.parse(_coerceQuote((/** @type {any[]} */ (rows))[0]))
  },

  markSent: async (/** @type {any} */ id) => {
    await webUpdate('quotes', { id, status: 'sent', updated_at: new Date().toISOString() })
    const rows = await get('quotes', { id: String(id) })
    return quoteSchema.parse(_coerceQuote((/** @type {any[]} */ (rows))[0]))
  },

  accept: async (/** @type {any} */ id) => {
    await webUpdate('quotes', { id, status: 'accepted', updated_at: new Date().toISOString() })
    const rows = await get('quotes', { id: String(id) })
    return quoteSchema.parse(_coerceQuote((/** @type {any[]} */ (rows))[0]))
  },

  reject: async (/** @type {any} */ id) => {
    await webUpdate('quotes', { id, status: 'rejected', updated_at: new Date().toISOString() })
    const rows = await get('quotes', { id: String(id) })
    return quoteSchema.parse(_coerceQuote((/** @type {any[]} */ (rows))[0]))
  },

  convert:             async () => { throw new Error('Convertir a venta no disponible en versión web') },
  convertToReceivable: async () => { throw new Error('Convertir a CxC no disponible en versión web') },
}

export const listQuotes                = isElectron ? ipc.list               : web.list
export const getQuote                  = isElectron ? ipc.get                : web.get
export const createQuote               = isElectron ? ipc.create             : web.create
export const updateQuote               = isElectron ? ipc.update             : web.update
export const markSentQuote             = isElectron ? ipc.markSent           : web.markSent
export const acceptQuote               = isElectron ? ipc.accept             : web.accept
export const rejectQuote               = isElectron ? ipc.reject             : web.reject
export const convertQuote              = isElectron ? ipc.convert            : web.convert
export const convertQuoteToReceivable  = isElectron ? ipc.convertToReceivable: web.convertToReceivable
