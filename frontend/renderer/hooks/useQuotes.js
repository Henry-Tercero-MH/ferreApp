import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as svc from '@/services/quotesService.js'
import { productKeys, saleKeys } from './queryKeys.js'

export const quoteKeys = {
  all:    ['quotes'],
  list:   ['quotes', 'list'],
  detail: (id) => ['quotes', 'detail', id],
}

export function useQuotes() {
  return useQuery({ queryKey: quoteKeys.list, queryFn: svc.listQuotes, staleTime: 30_000 })
}

export function useQuote(id) {
  return useQuery({
    queryKey: quoteKeys.detail(id),
    queryFn:  () => svc.getQuote(id),
    enabled:  !!id,
  })
}

export function useCreateQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: svc.createQuote,
    onSuccess: () => qc.invalidateQueries({ queryKey: quoteKeys.all }),
  })
}

export function useUpdateQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: /** @param {{ id: number, input: any }} v */ (v) => svc.updateQuote(v.id, v.input),
    onSuccess: () => qc.invalidateQueries({ queryKey: quoteKeys.all }),
  })
}

export function useMarkSentQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: svc.markSentQuote,
    onSuccess: () => qc.invalidateQueries({ queryKey: quoteKeys.all }),
  })
}

export function useAcceptQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: svc.acceptQuote,
    onSuccess: () => qc.invalidateQueries({ queryKey: quoteKeys.all }),
  })
}

export function useRejectQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: svc.rejectQuote,
    onSuccess: () => qc.invalidateQueries({ queryKey: quoteKeys.all }),
  })
}

export function useConvertQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: svc.convertQuote,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: quoteKeys.all })
      qc.invalidateQueries({ queryKey: productKeys.all })
      qc.invalidateQueries({ queryKey: saleKeys.all })
    },
  })
}

export function useConvertQuoteToReceivable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: svc.convertQuoteToReceivable,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: quoteKeys.all })
      qc.invalidateQueries({ queryKey: productKeys.all })
      qc.invalidateQueries({ queryKey: ['receivables'] })
    },
  })
}
