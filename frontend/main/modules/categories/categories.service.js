export function createCategoriesService(repo) {
  return {
    list()       { return repo.findAll() },
    listActive() { return repo.findActive() },

    create(name) {
      const trimmed = (name ?? '').trim()
      if (!trimmed) throw new Error('El nombre de la categoría es requerido')
      const id = repo.create(trimmed)
      return { id, name: trimmed, is_active: 1 }
    },

    update(id, name) {
      if (id === 1) throw Object.assign(new Error('La categoría del sistema no se puede modificar'), { code: 'CATEGORY_SYSTEM' })
      const trimmed = (name ?? '').trim()
      if (!trimmed) throw new Error('El nombre de la categoría es requerido')
      repo.update(id, trimmed)
      return { id, name: trimmed, is_active: 1 }
    },

    setActive(id, active) {
      if (id === 1) throw Object.assign(new Error('La categoría del sistema no se puede desactivar'), { code: 'CATEGORY_SYSTEM' })
      repo.setActive(id, active ? 1 : 0)
    },
  }
}
