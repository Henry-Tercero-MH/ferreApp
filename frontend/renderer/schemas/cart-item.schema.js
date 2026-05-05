import { z } from 'zod'

/**
 * Estado temporal del carrito POS antes de convertirse en venta.
 * Snapshotea `price` al momento de agregar al carrito: si el operador
 * cambia el precio en otra ventana, el carrito conserva el precio que el
 * cliente acepto (alineado con la logica de snapshot del Prompt 1).
 *
 * Nota: `productId` en lugar de `id` para evitar colisionar con un eventual
 * id de linea de carrito si se agrega.
 */
export const cartItemSchema = z.object({
  productId: z.number().int().positive(),
  code:      z.string().min(1),
  name:      z.string().min(1),
  price:     z.number().nonnegative(),
  qty:       z.number().positive(),
  maxStock:  z.number().int(), // para validar al incrementar
})

/** @typedef {z.infer<typeof cartItemSchema>} CartItem */
