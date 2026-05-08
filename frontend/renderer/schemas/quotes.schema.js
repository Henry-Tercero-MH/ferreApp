import { z } from 'zod'

export const quoteItemSchema = z.object({
  id:           z.number(),
  quote_id:     z.number(),
  product_id:   z.number().nullable(),
  product_name: z.string(),
  product_code: z.string().nullable(),
  qty:          z.number(),
  unit_price:   z.number(),
  subtotal:     z.number(),
})

export const quoteSchema = z.object({
  id:              z.number(),
  customer_id:     z.number().nullable(),
  customer_name:   z.string(),
  customer_nit:    z.union([z.string(), z.number()]).nullable().transform(v => v === null ? null : String(v)),
  status:          z.enum(['draft', 'sent', 'accepted', 'rejected', 'converted']),
  notes:           z.string().nullable(),
  valid_until:     z.string().nullable(),
  subtotal:        z.number(),
  tax_rate:        z.number(),
  tax_amount:      z.number(),
  total:           z.number(),
  created_by:      z.number().nullable(),
  created_by_name: z.string().nullable(),
  sale_id:         z.number().nullable(),
  created_at:      z.string(),
  updated_at:      z.string(),
})

export const quoteListSchema = z.array(quoteSchema)

export const quoteDetailSchema = z.object({
  quote: quoteSchema,
  items: z.array(quoteItemSchema),
})

export const convertResultSchema = z.object({
  quote: quoteSchema,
  sale:  z.any(),
})
