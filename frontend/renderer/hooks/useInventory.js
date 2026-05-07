import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as svc from '@/services/inventoryService.js'
import { productKeys } from './queryKeys.js'

import { getNextId } from '@/services/cloudIdService.js'
const invKeys = {
  stock:     ['inventory', 'stock'],
  movements: (opts) => ['inventory', 'movements', JSON.stringify(opts ?? {})],
}

export function useInventoryStock() {
  return useQuery({ queryKey: invKeys.stock, queryFn: svc.getStock, staleTime: 30_000 })
}
export function useInventoryMovements(opts = {}) {
  return useQuery({ queryKey: invKeys.movements(opts), queryFn: () => svc.getMovements(opts) })
}
export function useAdjustStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: svc.adjustStock,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invKeys.stock })
      qc.invalidateQueries({ queryKey: productKeys.lists })
      qc.invalidateQueries({ queryKey: ['inventory', 'movements'] })
      toast.success('Stock ajustado')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error'),
  })
}
