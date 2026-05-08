import { z } from 'zod'

export const supplierSchema = z.object({
  id:           z.number(),
  name:         z.string(),
  contact_name: z.string().nullable(),
  phone:        z.union([z.string(), z.number()]).nullable().transform(v => v === null ? null : String(v)),
  email:        z.string().nullable(),
  address:      z.string().nullable(),
  notes:        z.string().nullable(),
  active:       z.number(),
  created_at:   z.string(),
  updated_at:   z.string(),
})

export const supplierListSchema = z.array(supplierSchema)

export const purchaseItemSchema = z.object({
  id:           z.number(),
  order_id:     z.number(),
  product_id:   z.number().nullable(),
  product_name: z.string(),
  product_code: z.string().nullable(),
  qty_ordered:  z.number(),
  qty_received: z.number(),
  unit_cost:    z.number(),
})

export const purchaseOrderSchema = z.object({
  id:              z.number(),
  supplier_id:     z.number(),
  supplier_name:   z.string(),
  status:          z.enum(['draft', 'sent', 'received', 'cancelled']),
  notes:           z.string().nullable(),
  created_by:      z.number().nullable(),
  created_by_name: z.string().nullable(),
  created_at:      z.string(),
  received_at:     z.string().nullable(),
  total_cost:      z.number(),
})

export const purchaseOrderListSchema = z.array(purchaseOrderSchema)

export const purchaseOrderDetailSchema = z.object({
  order: purchaseOrderSchema,
  items: z.array(purchaseItemSchema),
})
