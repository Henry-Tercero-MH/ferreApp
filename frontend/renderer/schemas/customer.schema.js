import { z } from 'zod'

/**
 * Cliente tal como lo persiste la DB. `active` se mapea a 0|1 entero
 * (SQLite no tiene tipo boolean nativo); el renderer lo trata como boolean
 * tras parseo.
 */
export const customerSchema = z.object({
  id:         z.number().int().positive(),
  nit:        z.union([z.string(), z.number()]).transform(String),
  name:       z.string().min(1),
  email:      z.string().nullable(),
  phone:      z.union([z.string(), z.number()]).nullable().transform(v => v === null ? null : String(v)),
  address:    z.string().nullable(),
  active:     z.number().int().min(0).max(1),
  is_system:  z.number().int().min(0).max(1),
  created_at: z.string(),
  updated_at: z.string(),
})

/** @typedef {z.infer<typeof customerSchema>} Customer */

export const customerListSchema = z.array(customerSchema)

/** @typedef {z.infer<typeof customerListSchema>} CustomerList */

/**
 * Formulario de creacion. `nit` es opcional: si se deja vacio, el main
 * lo normaliza a "C/F".
 */
export const customerCreateSchema = z.object({
  nit:     z.string().trim().max(20).optional().default(''),
  name:    z.string().trim().min(2, 'Nombre requerido (minimo 2 caracteres)').max(120),
  email:   z.string().trim().email('Email invalido').optional().or(z.literal('')),
  phone:   z.string().trim().max(30).optional().or(z.literal('')),
  address: z.string().trim().max(240).optional().or(z.literal('')),
})

/** @typedef {z.infer<typeof customerCreateSchema>} CustomerCreateForm */
