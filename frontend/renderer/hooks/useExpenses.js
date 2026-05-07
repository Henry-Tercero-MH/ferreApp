import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as svc from '@/services/expensesService.js'
import { getNextId } from '@/services/cloudIdService.js'

const expenseKeys = {
  all:     ['expenses'],
  list:    (opts) => ['expenses', 'list', opts ?? {}],
  summary: (from, to) => ['expenses', 'summary', from, to],
  cats:    ['expenses', 'categories'],
}

export function useExpenses(opts = {}) {
  return useQuery({ queryKey: expenseKeys.list(opts), queryFn: () => svc.listExpenses(opts) })
}
export function useExpenseSummary(from, to) {
  return useQuery({
    queryKey: expenseKeys.summary(from, to),
    queryFn:  () => svc.getExpenseSummary(from, to),
    enabled:  !!(from && to),
  })
}
export function useExpenseCategories() {
  return useQuery({ queryKey: expenseKeys.cats, queryFn: svc.getCategories, staleTime: Infinity })
}

function useMut(fn, successMsg) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: expenseKeys.all })
      if (successMsg) toast.success(successMsg)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error'),
  })
}

export function useCreateExpense() {
  return useMut(async (input) => {
    const id = await getNextId('expenses')
    return svc.createExpense({ id, ...input })
  }, 'Gasto registrado')
}
export function useUpdateExpense() {
  return useMut(({ id, input }) => svc.updateExpense(id, input), 'Gasto actualizado')
}
export function useRemoveExpense() { return useMut(svc.removeExpense, 'Gasto eliminado') }
