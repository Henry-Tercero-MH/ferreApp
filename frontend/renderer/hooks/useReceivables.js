import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as svc from '@/services/receivablesService.js'
import { getNextId } from '@/services/cloudIdService.js'

export const receivableKeys = {
  all:           ['receivables'],
  list:          ['receivables', 'list'],
  /** @param {number} id */
  detail:        (id) => ['receivables', 'detail', id],
  summary:       ['receivables', 'summary'],
  paymentsToday: ['receivables', 'payments-today'],
  /** @param {string} from @param {string} to */
  paymentsRange: (from, to) => ['receivables', 'payments-range', from, to],
  /** @param {number} id */
  byCustomer:    (id) => ['receivables', 'customer', id],
}

export function useReceivables() {
  return useQuery({ queryKey: receivableKeys.list, queryFn: svc.listReceivables, staleTime: 30_000 })
}

/** @param {number} id */
export function useReceivable(id) {
  return useQuery({
    queryKey: receivableKeys.detail(id),
    queryFn:  () => svc.getReceivable(id),
    enabled:  !!id,
  })
}

export function useReceivablesSummary() {
  return useQuery({ queryKey: receivableKeys.summary, queryFn: svc.getSummary, staleTime: 30_000 })
}

export function useReceivablePaymentsToday() {
  return useQuery({ queryKey: receivableKeys.paymentsToday, queryFn: svc.getPaymentsToday, staleTime: 60_000 })
}

export function useCreateReceivable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input) => {
      const id = await getNextId('receivables')
      return svc.createReceivable({ id, ...input })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: receivableKeys.all }),
  })
}

export function useApplyPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: svc.applyPayment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: receivableKeys.all })
      qc.invalidateQueries({ queryKey: receivableKeys.paymentsToday })
    },
  })
}

export function useCancelReceivable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: svc.cancelReceivable,
    onSuccess: () => qc.invalidateQueries({ queryKey: receivableKeys.all }),
  })
}

/**
 * @param {string} from  YYYY-MM-DD
 * @param {string} to    YYYY-MM-DD
 */
export function useReceivablePaymentsForRange(from, to) {
  return useQuery({
    queryKey: receivableKeys.paymentsRange(from, to),
    queryFn:  () => svc.getPaymentsForRange({ from, to }),
    enabled:  !!from && !!to,
    staleTime: 60_000,
  })
}

/** @param {number} customerId */
export function useCustomerBalance(customerId) {
  return useQuery({
    queryKey: receivableKeys.byCustomer(customerId),
    queryFn:  () => svc.getCustomerBalance(customerId),
    enabled:  !!customerId && customerId > 1,
    staleTime: 30_000,
  })
}
