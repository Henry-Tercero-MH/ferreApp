import { z } from 'zod'

export const receivableSchema = z.object({
  id:              z.number(),
  customer_id:     z.number().nullable(),
  customer_name:   z.string(),
  customer_nit:    z.union([z.string(), z.number()]).nullable().transform(v => v === null ? null : String(v)),
  description:     z.string(),
  amount:          z.number(),
  amount_paid:     z.number(),
  due_date:        z.string().nullable(),
  status:          z.enum(['pending', 'partial', 'paid', 'cancelled']),
  notes:           z.string().nullable(),
  created_by:      z.number().nullable(),
  created_by_name: z.string().nullable(),
  created_at:      z.string(),
  updated_at:      z.string(),
})

export const receivableListSchema = z.array(receivableSchema)

export const paymentSchema = z.object({
  id:              z.number(),
  receivable_id:   z.number(),
  amount:          z.number(),
  payment_method:  z.string(),
  notes:           z.string().nullable(),
  created_by:      z.number().nullable(),
  created_by_name: z.string().nullable(),
  created_at:      z.string(),
})

export const receivableDetailSchema = z.object({
  receivable: receivableSchema,
  payments:   z.array(paymentSchema),
})

export const receivableSummarySchema = z.object({
  total_count:      z.number(),
  total_amount:     z.number(),
  total_paid:       z.number(),
  total_balance:    z.number(),
  pending_balance:  z.number(),
  partial_balance:  z.number(),
  overdue_balance:  z.number(),
})

export const customerBalanceSchema = z.object({
  rows:    z.array(receivableSchema),
  balance: z.number(),
})
