/**
 * @param {ReturnType<typeof import('./quotes.repository.js').createQuotesRepository>} repo
 * @param {ReturnType<typeof import('../settings/settings.service.js').createSettingsService>} settings
 * @param {ReturnType<typeof import('../sales/sales.service.js').createSalesService>} sales
 * @param {ReturnType<typeof import('../receivables/receivables.service.js').createReceivablesService>} receivables
 * @param {ReturnType<typeof import('../products/products.service.js').createProductsService>} products
 */
export function createQuotesService(repo, settings, sales, receivables, products) {

  function calcTotals(items) {
    const taxRate    = /** @type {number} */ (settings.get('tax_rate') ?? 0)
    const taxEnabled = /** @type {boolean} */ (settings.get('tax_enabled') ?? false)
    const subtotal   = items.reduce((s, i) => s + i.qty * i.unit_price, 0)
    const taxAmt     = taxEnabled ? Math.round(subtotal * taxRate * 100) / 100 : 0
    return { subtotal, tax_rate: taxRate, tax_amount: taxAmt, total: subtotal + taxAmt }
  }

  function validateItems(items) {
    if (!items?.length) throw Object.assign(new Error('Agrega al menos un producto'), { code: 'QUOTE_EMPTY' })
    for (const it of items) {
      if (!it.productName?.trim()) throw Object.assign(new Error('Nombre de producto requerido'), { code: 'QUOTE_ITEM_NAME' })
      if (it.qty <= 0) throw Object.assign(new Error('Cantidad debe ser mayor a 0'), { code: 'QUOTE_ITEM_QTY' })
      if (it.unitPrice < 0) throw Object.assign(new Error('Precio no puede ser negativo'), { code: 'QUOTE_ITEM_PRICE' })
    }
  }

  function mapItems(rawItems) {
    return rawItems.map(it => ({
      product_id:   it.productId   ?? null,
      product_name: it.productName.trim(),
      product_code: it.productCode?.trim() || null,
      qty:          it.qty,
      unit_price:   it.unitPrice,
      subtotal:     it.qty * it.unitPrice,
    }))
  }

  return {
    list() {
      return repo.findAll()
    },

    getDetail(id) {
      const quote = repo.findById(id)
      if (!quote) throw Object.assign(new Error('Cotización no encontrada'), { code: 'QUOTE_NOT_FOUND' })
      return { quote, items: repo.findItems(id) }
    },

    /**
     * @param {{ customerId?: number, customerName: string, customerNit?: string, customerPhone?: string, customerAddress?: string, notes?: string, validUntil?: string, items: any[], userId: number, userName: string }} input
     */
    create(input) {
      if (!input.customerName?.trim()) throw Object.assign(new Error('Nombre del cliente requerido'), { code: 'QUOTE_MISSING_CUSTOMER' })
      validateItems(input.items)
      const items = mapItems(input.items)
      const { subtotal, tax_rate, tax_amount, total } = calcTotals(items)
      const id = repo.createQuote({
        customer_id:      input.customerId          ?? null,
        customer_name:    input.customerName.trim(),
        customer_nit:     input.customerNit?.trim()     || null,
        customer_phone:   input.customerPhone?.trim()   || null,
        customer_address: input.customerAddress?.trim() || null,
        notes:            input.notes?.trim()           || null,
        valid_until:      input.validUntil              || null,
        subtotal, tax_rate, tax_amount, total,
        created_by:      input.userId,
        created_by_name: input.userName,
      }, items)
      return repo.findById(id)
    },

    /**
     * @param {number} id
     * @param {{ customerId?: number, customerName: string, customerNit?: string, customerPhone?: string, customerAddress?: string, notes?: string, validUntil?: string, items: any[] }} input
     */
    update(id, input) {
      const quote = repo.findById(id)
      if (!quote) throw Object.assign(new Error('Cotización no encontrada'), { code: 'QUOTE_NOT_FOUND' })
      if (!['draft', 'sent'].includes(quote.status)) {
        throw Object.assign(new Error('Solo se pueden editar cotizaciones en borrador o enviadas'), { code: 'QUOTE_NOT_EDITABLE' })
      }
      validateItems(input.items)
      const items = mapItems(input.items)
      const { subtotal, tax_rate, tax_amount, total } = calcTotals(items)
      repo.updateQuote(id, {
        customer_id:      input.customerId              ?? quote.customer_id,
        customer_name:    (input.customerName           ?? quote.customer_name).trim(),
        customer_nit:     input.customerNit?.trim()     || quote.customer_nit     || null,
        customer_phone:   input.customerPhone?.trim()   || quote.customer_phone   || null,
        customer_address: input.customerAddress?.trim() || quote.customer_address || null,
        notes:            input.notes?.trim()           || null,
        valid_until:      input.validUntil              || null,
        subtotal, tax_rate, tax_amount, total,
      }, items)
      return repo.findById(id)
    },

    markSent(id) {
      const quote = repo.findById(id)
      if (!quote) throw Object.assign(new Error('Cotización no encontrada'), { code: 'QUOTE_NOT_FOUND' })
      if (quote.status !== 'draft') throw Object.assign(new Error('Solo se pueden enviar cotizaciones en borrador'), { code: 'QUOTE_INVALID_STATUS' })
      repo.updateStatus(id, 'sent')
      return repo.findById(id)
    },

    accept(id) {
      const quote = repo.findById(id)
      if (!quote) throw Object.assign(new Error('Cotización no encontrada'), { code: 'QUOTE_NOT_FOUND' })
      if (!['draft', 'sent'].includes(quote.status)) throw Object.assign(new Error('Estado inválido para aceptar'), { code: 'QUOTE_INVALID_STATUS' })
      repo.updateStatus(id, 'accepted')
      return repo.findById(id)
    },

    reject(id) {
      const quote = repo.findById(id)
      if (!quote) throw Object.assign(new Error('Cotización no encontrada'), { code: 'QUOTE_NOT_FOUND' })
      if (['converted', 'cancelled'].includes(quote.status)) throw Object.assign(new Error('No se puede rechazar esta cotización'), { code: 'QUOTE_INVALID_STATUS' })
      repo.updateStatus(id, 'rejected')
      return repo.findById(id)
    },

    /**
     * Convierte la cotización aceptada en una venta real.
     * @param {{ id: number, userId: number, userName: string }} input
     */
    convertToSale(input) {
      const quote = repo.findById(input.id)
      if (!quote) throw Object.assign(new Error('Cotización no encontrada'), { code: 'QUOTE_NOT_FOUND' })
      if (!['accepted', 'sent', 'draft'].includes(quote.status)) {
        throw Object.assign(new Error('Solo se pueden convertir cotizaciones activas'), { code: 'QUOTE_INVALID_STATUS' })
      }
      const items = repo.findItems(input.id)
      if (!items.length) throw Object.assign(new Error('La cotización no tiene productos'), { code: 'QUOTE_EMPTY' })

      const itemsWithProduct = items.filter(it => it.product_id != null)
      if (!itemsWithProduct.length) {
        throw Object.assign(new Error('Para convertir a venta todos los items deben tener un producto del sistema'), { code: 'QUOTE_NO_PRODUCTS' })
      }

      const saleResult = sales.create({
        items: itemsWithProduct.map(it => ({
          id:    it.product_id,
          qty:   it.qty,
          price: it.unit_price,
        })),
        customerId: quote.customer_id ?? undefined,
      })

      repo.markConverted(input.id, saleResult.saleId)
      return { quote: repo.findById(input.id), sale: saleResult }
    },

    /**
     * Crea una cuenta por cobrar desde una cotización aceptada.
     * Descuenta stock para los ítems con product_id vinculado.
     * @param {{ id: number, dueDate?: string, notes?: string, userId: number, userName: string }} input
     */
    convertToReceivable(input) {
      const quote = repo.findById(input.id)
      if (!quote) throw Object.assign(new Error('Cotización no encontrada'), { code: 'QUOTE_NOT_FOUND' })
      if (!['accepted', 'sent', 'draft'].includes(quote.status)) {
        throw Object.assign(new Error('Solo se pueden convertir cotizaciones activas'), { code: 'QUOTE_INVALID_STATUS' })
      }

      const items = repo.findItems(input.id)

      // Descontar stock para items que tienen producto en catálogo
      for (const it of items) {
        if (it.product_id && it.qty > 0) {
          try {
            products.adjustStock(it.product_id, 'exit', it.qty)
          } catch {
            // Si el producto no existe o stock insuficiente, continuar igualmente
            console.warn(`[quotes] no se pudo descontar stock del producto ${it.product_id}`)
          }
        }
      }

      const receivable = receivables.create({
        customerId:   quote.customer_id   ?? undefined,
        customerName: quote.customer_name,
        customerNit:  quote.customer_nit  ?? undefined,
        description:  `Cotización #${quote.id}${quote.notes ? ` · ${quote.notes}` : ''}`,
        amount:       quote.total,
        dueDate:      input.dueDate       || undefined,
        notes:        input.notes         || undefined,
        userId:       input.userId,
        userName:     input.userName,
      })

      repo.updateStatus(input.id, 'converted')
      return { quote: repo.findById(input.id), receivable }
    },
  }
}
