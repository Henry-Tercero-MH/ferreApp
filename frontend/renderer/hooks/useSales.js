import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as salesService from '@/services/salesService.js'
import { saleKeys } from './queryKeys.js'

/**
import { getNextId } from '@/services/cloudIdService.js'
 * Venta individual con sus items. Null si no existe (no error).
 *
 * @param {number | null | undefined} id
 */
export function useSale(id) {
  return useQuery({
    queryKey: id != null ? saleKeys.detail(id) : ['sales', 'detail', 'none'],
    queryFn: () => salesService.getById(/** @type {number} */ (id)),
    enabled: id != null,
    staleTime: 60_000,
  })
}

/**
 * Listado paginado para historial de ventas. staleTime moderado: una venta
 * recien creada debe aparecer pronto, pero no refetcheamos en cada focus.
 * useCreateSale invalida saleKeys.all, asi que tras una venta exitosa
 * este hook refetchea automaticamente.
 *
 * @param {{ page?: number, pageSize?: number }} [opts]
 */
export function useSales(opts = {}) {
  return useQuery({
    queryKey: saleKeys.list(opts),
    queryFn: () => salesService.list(opts),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}

/**
 * Anula una venta e invalida el historial y el detalle.
 */
export function useVoidSale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: salesService.voidSale,
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: saleKeys.all })
      qc.invalidateQueries({ queryKey: saleKeys.detail(variables.saleId) })
    },
  })
}

/**
 * Reporte del día: totales + top 5 productos.
 * Se refresca cada 60s y al invalidar saleKeys.all (tras crear venta).
 */
export function useDailyReport() {
  return useQuery({
    queryKey: [...saleKeys.all, 'daily-report'],
    queryFn: salesService.dailyReport,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
}

/**
 * Serie de ventas diarias + top productos para un rango de fechas.
 * @param {{ from: string, to: string }} range  Formato YYYY-MM-DD
 */
export function useRangeReport(range) {
  return useQuery({
    queryKey: [...saleKeys.all, 'range-report', range.from, range.to],
    queryFn:  () => salesService.rangeReport(range),
    enabled:  !!range.from && !!range.to && range.from <= range.to,
    staleTime: 120_000,
  })
}
