import { z } from 'zod'
import { saleItemSchema, saleItemInputSchema } from './sale-item.schema.js'

/**
 * Venta persistida. Incluye snapshots de impuesto (migracion 003) y cliente
 * (migracion 004).
 */
export const saleSchema = z.object({
  id:                      z.number().int().positive(),
  subtotal:                z.number().nonnegative(),
  tax_rate_applied:        z.number().nonnegative(),
  tax_amount:              z.number().nonnegative(),
  total:                   z.number().nonnegative(),
  currency_code:           z.string().min(1),
  date:                    z.string(),
  customer_id:             z.number().int().nullable(),
  customer_name_snapshot:  z.string().nullable(),
  customer_nit_snapshot:   z.union([z.string(), z.number()]).nullable().transform(v => v === null ? null : String(v)),
  payment_method:          z.enum(['cash', 'credit', 'card', 'transfer']).optional().nullable(),
  client_type:             z.enum(['cf', 'registered', 'company']).optional().nullable(),
  status:                  z.enum(['active', 'voided']).optional().default('active'),
  items:                   z.array(saleItemSchema).optional(),
})

/** @typedef {z.infer<typeof saleSchema>} Sale */

/**
 * Venta con items obligatorios (respuesta de sales:get-by-id).
 */
export const saleWithItemsSchema = saleSchema.extend({
  items: z.array(saleItemSchema),
})

/** @typedef {z.infer<typeof saleWithItemsSchema>} SaleWithItems */

/**
 * Respuesta de sales:list.
 */
export const saleListSchema = z.object({
  data:     z.array(saleSchema),
  total:    z.number().int().nonnegative(),
  page:     z.number().int().positive(),
  pageSize: z.number().int().positive(),
})

/** @typedef {z.infer<typeof saleListSchema>} SaleList */

/**
 * Payload que el renderer envia a window.api.sales.create.
 * Sin `total` (el main recalcula). `customerId` opcional: si se omite, el
 * main hace fallback a 1 (Consumidor Final).
 */
export const saleInputSchema = z.object({
  items:         z.array(saleItemInputSchema).min(1, 'La venta debe tener al menos un item'),
  customerId:    z.number().int().positive().optional(),
  paymentMethod: z.enum(['cash', 'credit', 'card', 'transfer']).optional(),
  clientType:    z.enum(['cf', 'registered', 'company']).optional(),
  discountType:  z.enum(['none', 'percent', 'fixed']).optional(),
  discountValue: z.number().nonnegative().optional(),
  userId:        z.number().int().positive().optional(),
  userName:      z.string().optional(),
})

/** @typedef {z.infer<typeof saleInputSchema>} SaleInput */

/**
 * Respuesta de sales:create con los valores efectivamente persistidos.
 */
export const saleCreatedSchema = z.object({
  saleId:       z.number().int().positive(),
  subtotal:     z.number().nonnegative(),
  taxRate:      z.number().nonnegative(),
  taxAmount:    z.number().nonnegative(),
  total:        z.number().nonnegative(),
  currencyCode: z.string().min(1),
  customerId:   z.number().int().positive(),
  customerName: z.string(),
  customerNit:  z.string(),
})

/** @typedef {z.infer<typeof saleCreatedSchema>} SaleCreated */
