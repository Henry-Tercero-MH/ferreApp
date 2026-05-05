import { z } from 'zod'

/**
 * Schema alineado al esquema real de la DB post migracion 005:
 *   products(id, code, name, price, stock, category, brand, location, condition, min_stock, is_active)
 */
export const productSchema = z.object({
  id:        z.number().int().positive(),
  code:      z.string().min(1),
  name:      z.string().min(1),
  price:     z.number().nonnegative(),
  stock:     z.number(),
  category:  z.string(),
  brand:     z.string(),
  location:  z.string(),
  condition: z.string(),
  min_stock: z.number().int().nonnegative(),
  is_active: z.number().int().min(0).max(1),
  cost:      z.number().nonnegative().optional().default(0),
})

/** @typedef {z.infer<typeof productSchema>} Product */

export const productListSchema = z.array(productSchema)

/** @typedef {z.infer<typeof productListSchema>} ProductList */

export const productInputSchema = z.object({
  code:      z.string().min(1, 'Código requerido'),
  name:      z.string().min(1, 'Nombre requerido'),
  price:     z.coerce.number().nonnegative('Precio inválido'),
  stock:     z.coerce.number().int().nonnegative().default(0),
  category:  z.string().default('General'),
  brand:     z.string().default(''),
  location:  z.string().default(''),
  condition: z.string().default('Nuevo'),
  min_stock: z.coerce.number().int().nonnegative().default(5),
})

/** @typedef {z.infer<typeof productInputSchema>} ProductInput */
