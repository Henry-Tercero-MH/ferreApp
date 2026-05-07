import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as productsService from '@/services/productsService.js'
import * as salesService from '@/services/salesService.js'
import { productKeys, saleKeys } from './queryKeys.js'
import { cashKeys } from './useCash.js'
import { useDebouncedValue } from './useDebouncedValue.js'
import { getNextId } from '@/services/cloudIdService.js'

/**
 * Lista completa de productos. staleTime largo porque catalogo cambia poco.
 */
export function useProducts() {
  return useQuery({
    queryKey: productKeys.lists,
    queryFn: productsService.getAll,
    staleTime: 60_000,
  })
}

/**
 * Producto individual. Placeholder: hoy cae al filtro de la lista (ver
 * productsService.getById). Key y hook ya estan en su sitio final, solo
 * cambia la impl cuando exista products:get-by-id en el main.
 *
 * @param {number | null | undefined} id
 */
export function useProduct(id) {
  return useQuery({
    queryKey: id != null ? productKeys.detail(id) : ['products', 'detail', 'none'],
    queryFn: () => productsService.getById(/** @type {number} */ (id)),
    enabled: id != null,
    staleTime: 60_000,
  })
}

/**
 * Busqueda con debounce de 250ms. Se puede pasar `query` sin debouncear;
 * el hook lo hace internamente para evitar ecos.
 *
 * @param {string} query
 */
export function useSearchProducts(query) {
  const debounced = useDebouncedValue(query.trim(), 250)

  return useQuery({
    queryKey: productKeys.search(debounced),
    queryFn: () => productsService.search(debounced),
    // Con query vacia caemos a lista completa: evita flashes de "sin resultados".
    staleTime: 30_000,
    // keepPreviousData deprecated en v5 -> placeholderData.
    placeholderData: (prev) => prev,
  })
}

/**
 * Crea una venta. Al exito invalida:
 *  - product lists/details (stock mutado en main dentro de la transaccion)
 *  - sales (para reports/historial que vendran)
 *
 * Usamos invalidacion y no optimistic update porque:
 *  1. stock depende del resultado real del transaction del main (si un
 *     item lleva a stock negativo y se rechaza en el futuro, el rollback
 *     optimista es complejo).
 *  2. la DB es local: el refetch es subsegundo, el costo es trivial.
 */
export function useCreateSale() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input) => {
      const id = await getNextId('sales')
      return salesService.create({ id, ...input })
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: productKeys.all })
      qc.invalidateQueries({ queryKey: saleKeys.all })
      qc.invalidateQueries({ queryKey: cashKeys.all })
      // Los montos del toast vienen del main (autoritativos tras recalculo).
      const formatted = new Intl.NumberFormat('es-GT', {
        style: 'currency',
        currency: result.currencyCode,
      }).format(result.total)
      toast.success(`Venta #${result.saleId} — ${formatted}`, {
        description: `Cliente: ${result.customerName} (${result.customerNit})`,
      })
    },
    onError: (err) => {
      toast.error('No se pudo registrar la venta', {
        description: err instanceof Error ? err.message : 'Error desconocido',
      })
    },
  })
}
