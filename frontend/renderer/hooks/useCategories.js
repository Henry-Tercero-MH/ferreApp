import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getNextId } from '@/services/cloudIdService.js'

const catKeys = {
  all:    ['categories'],
  active: ['categories', 'active'],
}

export function useCategories() {
  return useQuery({
    queryKey: catKeys.all,
    queryFn:  async () => {
      const res = await window.api.categories.list()
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    },
  })
}

export function useActiveCategories() {
  return useQuery({
    queryKey: catKeys.active,
    queryFn:  async () => {
      const res = await window.api.categories.listActive()
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    },
    staleTime: 60_000,
  })
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name) => {
      const id = await getNextId('categories')
      const res = await window.api.categories.create({ id, name })
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: catKeys.all })
      toast.success('Categoría creada')
    },
    onError: (e) => toast.error(e.message),
  })
}

export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name }) => {
      const res = await window.api.categories.update(id, name)
      if (!res.ok) throw new Error(res.error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: catKeys.all })
      toast.success('Categoría actualizada')
    },
    onError: (e) => toast.error(e.message),
  })
}

export function useSetCategoryActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, active }) => {
      const res = await window.api.categories.setActive(id, active)
      if (!res.ok) throw new Error(res.error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: catKeys.all }),
    onError:   (e) => toast.error(e.message),
  })
}
