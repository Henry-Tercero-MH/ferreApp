/** @param {import('better-sqlite3').Database} db */
export function createQuotesRepository(db) {
  const stmts = {
    findAll: db.prepare(`
      SELECT * FROM quotes
      ORDER BY CASE status WHEN 'draft' THEN 0 WHEN 'sent' THEN 1 WHEN 'accepted' THEN 2 ELSE 3 END,
               created_at DESC
    `),
    findById:    db.prepare(`SELECT * FROM quotes WHERE id = ?`),
    findItems:   db.prepare(`SELECT * FROM quote_items WHERE quote_id = ? ORDER BY id`),

    insert: db.prepare(`
      INSERT INTO quotes (customer_id, customer_name, customer_nit, customer_phone, customer_address,
                          notes, valid_until, subtotal, tax_rate, tax_amount, total, created_by, created_by_name)
      VALUES (@customer_id, @customer_name, @customer_nit, @customer_phone, @customer_address,
              @notes, @valid_until, @subtotal, @tax_rate, @tax_amount, @total, @created_by, @created_by_name)
    `),
    insertItem: db.prepare(`
      INSERT INTO quote_items (quote_id, product_id, product_name, product_code, qty, unit_price, subtotal)
      VALUES (@quote_id, @product_id, @product_name, @product_code, @qty, @unit_price, @subtotal)
    `),
    deleteItems: db.prepare(`DELETE FROM quote_items WHERE quote_id = ?`),

    updateStatus: db.prepare(`
      UPDATE quotes SET status=@status, updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
      WHERE id=@id
    `),
    markConverted: db.prepare(`
      UPDATE quotes SET status='converted', sale_id=@sale_id,
        updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
      WHERE id=@id
    `),
    update: db.prepare(`
      UPDATE quotes
      SET customer_id=@customer_id, customer_name=@customer_name, customer_nit=@customer_nit,
          customer_phone=@customer_phone, customer_address=@customer_address,
          notes=@notes, valid_until=@valid_until,
          subtotal=@subtotal, tax_rate=@tax_rate, tax_amount=@tax_amount, total=@total,
          updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
      WHERE id=@id
    `),
  }

  const createQuote = db.transaction((quoteData, items) => {
    const id = Number(stmts.insert.run(quoteData).lastInsertRowid)
    for (const item of items) stmts.insertItem.run({ ...item, quote_id: id })
    return id
  })

  const updateQuote = db.transaction((id, quoteData, items) => {
    stmts.update.run({ ...quoteData, id })
    stmts.deleteItems.run(id)
    for (const item of items) stmts.insertItem.run({ ...item, quote_id: id })
  })

  return {
    findAll()          { return stmts.findAll.all() },
    findById(id)       { return stmts.findById.get(id) ?? null },
    findItems(id)      { return stmts.findItems.all(id) },
    createQuote,
    updateQuote,
    updateStatus(id, status)       { stmts.updateStatus.run({ id, status }) },
    markConverted(id, saleId)      { stmts.markConverted.run({ id, sale_id: saleId }) },
  }
}
