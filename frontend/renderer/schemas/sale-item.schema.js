import { z } from 'zod'

/**
 * Linea de venta tal como la persiste la DB (tabla sale_items) enriquecida
 * con datos del producto vigente (via LEFT JOIN).
 *
 * product_code/product_name son NULLABLE porque:
 *   - LEFT JOIN puede volver null si el producto se borro.
 *   - No son snapshot: reflejan el estado actual, no el del momento de la
 *     venta. Para snapshot fiel hay que agregar columnas en sale_items en
 *     una migracion futura.
 */
export const saleItemSchema = z.object({
  id:           z.number().int().positive(),
  sale_id:      z.number().int().positive(),
  product_id:   z.number().int().positive(),
  qty:          z.number().positive(),
  price:        z.number().nonnegative(),
  product_code: z.string().nullable().optional(),
  product_name: z.string().nullable().optional(),
})

/** @typedef {z.infer<typeof saleItemSchema>} SaleItem */

/**
 * Item tal como lo envia el renderer al crear una venta (sin id, sin sale_id).
 * El main genera esos campos al insertar.
 */
export const saleItemInputSchema = z.object({
  id:    z.number().int().positive(),     // product_id en main; renombrar cuando se rediseñe createSale
  qty:   z.number().positive(),
  price: z.number().nonnegative(),
})

/** @typedef {z.infer<typeof saleItemInputSchema>} SaleItemInput */
