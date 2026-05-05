import { Printer, X } from 'lucide-react'
import { Button }       from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { usePrinterSettings } from '@/hooks/useSettings'

/** @param {number} n @returns {string} */
const fmtMoney = (n) => new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n ?? 0)

const C_HEAD   = '#f5f5f5'   // fondo cabecera/tabla — gris claro
const C_BORDER = '#111'      // bordes — negro suave
const PRINT_COLOR = '-webkit-print-color-adjust:exact;print-color-adjust:exact;'
const MIN_ROWS = 8           // filas mínimas en la tabla (rellena hoja)

/**
 * Genera el HTML del cuerpo del recibo (se usa tanto en el preview como en la impresión).
 * Usa SOLO estilos inline para garantizar que el resultado sea igual en ambos contextos.
 */
/**
 * @param {any} data
 * @param {{ name: string, logo: string, nit: string, address: string, phone: string }} business
 * @param {boolean} taxEnabled
 * @returns {string}
 */
function buildInvoiceBody(data, business, taxEnabled) {
  const dd   = String(data.date.getDate()).padStart(2, '0')
  const mm   = String(data.date.getMonth() + 1).padStart(2, '0')
  const yyyy = data.date.getFullYear()
  const folio = String(data.saleId).padStart(6, '0')
  const esCOntado = data.paymentMethod !== 'credit'

  const discountAmount = data.discountAmount ?? (
    data.discount?.type === 'percent'
      ? data.items.reduce((s, i) => s + i.price * i.qty, 0) * (data.discount.value / 100)
      : data.discount?.type === 'fixed' ? data.discount.value : 0
  )

  // ── Filas de items ────────────────────────────────────────────────
  const itemRowsHtml = data.items.map(item => `
    <tr>
      <td style="text-align:center;border-bottom:1px solid #ddd;border-right:1px solid ${C_BORDER};padding:3px 4px;">${item.qty}</td>
      <td style="border-bottom:1px solid #ddd;border-right:1px solid ${C_BORDER};padding:3px 8px;">${item.name}${item.price !== item.price ? '' : ''}</td>
      <td style="text-align:right;border-bottom:1px solid #ddd;padding:3px 6px;">${fmtMoney(item.price * item.qty)}</td>
    </tr>`).join('')

  const emptyRows = Math.max(0, MIN_ROWS - data.items.length)
  const emptyRowsHtml = Array.from({ length: emptyRows }, () => `
    <tr style="height:22px;">
      <td style="border-bottom:1px solid #eee;border-right:1px solid ${C_BORDER};">&nbsp;</td>
      <td style="border-bottom:1px solid #eee;border-right:1px solid ${C_BORDER};">&nbsp;</td>
      <td style="border-bottom:1px solid #eee;">&nbsp;</td>
    </tr>`).join('')

  // ── Fila de subtotales (solo si hay descuento o IVA) ──────────────
  const extraTotals = []
  if (discountAmount > 0) {
    extraTotals.push(`<tr>
      <td colspan="2" style="text-align:right;padding:2px 8px;font-size:0.85em;border-right:1px solid ${C_BORDER};">Descuento${data.discount?.type === 'percent' ? ` (${data.discount.value}%)` : ''}:</td>
      <td style="text-align:right;padding:2px 6px;font-size:0.85em;">-${fmtMoney(discountAmount)}</td>
    </tr>`)
  }
  if (taxEnabled && data.taxAmount > 0) {
    extraTotals.push(`<tr>
      <td colspan="2" style="text-align:right;padding:2px 8px;font-size:0.85em;border-right:1px solid ${C_BORDER};">IVA (${Math.round(data.taxRate * 100)}%):</td>
      <td style="text-align:right;padding:2px 6px;font-size:0.85em;">${fmtMoney(data.taxAmount)}</td>
    </tr>`)
  }

  return `
  <div style="display:flex;flex-direction:column;width:100%;height:100%;font-family:Arial,sans-serif;font-size:13px;color:#111;">

    <!-- ══ CABECERA ══════════════════════════════════════════════════ -->
    <div style="display:flex;align-items:stretch;background:${C_HEAD};border:2px solid ${C_BORDER};gap:0;${PRINT_COLOR}">

      <!-- Logo -->
      <div style="padding:6px 10px;display:flex;align-items:center;justify-content:center;border-right:1px solid ${C_BORDER};min-width:140px;max-width:240px;background:${C_HEAD};${PRINT_COLOR}">
        ${business.logo
          ? `<img src="${business.logo}" style="max-width:275px;max-height:113px;object-fit:contain;" />`
          : ''}
      </div>

      <!-- Datos del negocio -->
      <div style="flex:1;padding:8px 12px;display:flex;flex-direction:column;justify-content:center;">
        <div style="font-size:1.25em;font-weight:800;letter-spacing:0.02em;">${business.name}</div>
        ${business.nit     ? `<div style="font-size:0.8em;margin-top:2px;">NIT: ${business.nit}</div>` : ''}
        ${business.address ? `<div style="font-size:0.8em;">${business.address}</div>` : ''}
        ${business.phone   ? `<div style="font-size:0.8em;">Tel: ${business.phone}</div>` : ''}
      </div>

      <!-- Bloque COMPROBANTE + tipo pago + fecha -->
      <div style="border-left:1px solid ${C_BORDER};min-width:170px;display:flex;flex-direction:column;">
        <!-- Título -->
        <div style="background:${C_BORDER};color:#fff;text-align:center;font-weight:800;font-size:1em;padding:5px 0;letter-spacing:0.05em;${PRINT_COLOR}">
          COMPROBANTE
        </div>
        <!-- Tipo de pago -->
        <div style="display:flex;gap:12px;justify-content:center;padding:4px 8px;font-size:0.85em;border-bottom:1px solid ${C_BORDER};">
          <span>${esCOntado ? '☑' : '☐'} CONTADO</span>
          <span>${!esCOntado ? '☑' : '☐'} CRÉDITO</span>
        </div>
        <!-- Fecha en cuadrícula -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);flex:1;">
          <div style="text-align:center;font-size:0.75em;font-weight:700;padding:2px;border-right:1px solid ${C_BORDER};">DÍA</div>
          <div style="text-align:center;font-size:0.75em;font-weight:700;padding:2px;border-right:1px solid ${C_BORDER};">MES</div>
          <div style="text-align:center;font-size:0.75em;font-weight:700;padding:2px;">AÑO</div>
          <div style="text-align:center;font-size:0.9em;padding:3px;border-top:1px solid ${C_BORDER};border-right:1px solid ${C_BORDER};">${dd}</div>
          <div style="text-align:center;font-size:0.9em;padding:3px;border-top:1px solid ${C_BORDER};border-right:1px solid ${C_BORDER};">${mm}</div>
          <div style="text-align:center;font-size:0.9em;padding:3px;border-top:1px solid ${C_BORDER};">${yyyy}</div>
        </div>
      </div>
    </div>

    <!-- ══ CLIENTE ════════════════════════════════════════════════════ -->
    <div style="display:flex;gap:0;border:2px solid ${C_BORDER};border-top:none;padding:5px 10px;align-items:center;font-size:0.9em;">
      <div style="flex:1;">
        Señor(a):&nbsp;
        <span style="border-bottom:1px solid #999;display:inline-block;min-width:220px;padding-bottom:1px;">${data.customerName}</span>
      </div>
      <div>
        NIT:&nbsp;
        <span style="border-bottom:1px solid #999;display:inline-block;min-width:90px;padding-bottom:1px;">${data.customerNit || 'C/F'}</span>
      </div>
    </div>

    <!-- ══ TABLA DE ITEMS ══════════════════════════════════════════════ -->
    <table style="width:100%;border-collapse:collapse;border:2px solid ${C_BORDER};border-top:none;flex:1;">
      <thead>
        <tr style="background:${C_HEAD};${PRINT_COLOR}">
          <th style="width:58px;text-align:center;border-bottom:2px solid ${C_BORDER};border-right:1px solid ${C_BORDER};padding:4px 2px;font-size:0.82em;">CANT.</th>
          <th style="text-align:center;border-bottom:2px solid ${C_BORDER};border-right:1px solid ${C_BORDER};padding:4px 2px;font-size:0.82em;">DETALLE</th>
          <th style="width:110px;text-align:center;border-bottom:2px solid ${C_BORDER};padding:4px 2px;font-size:0.82em;">TOTAL</th>
        </tr>
      </thead>
      <tbody>
        ${itemRowsHtml}
        ${emptyRowsHtml}
        ${extraTotals.join('')}
      </tbody>
    </table>

    <!-- ══ PIE ════════════════════════════════════════════════════════ -->
    <div style="display:flex;align-items:center;border:2px solid ${C_BORDER};border-top:none;padding:5px 10px;gap:10px;font-size:0.85em;">
      <div style="flex:1;">
        Recibido conforme:&nbsp;
        <span style="border-bottom:1px solid #999;display:inline-block;min-width:130px;">&nbsp;</span>
      </div>
      <div>Cód.&nbsp;#${folio}</div>
      <div style="font-weight:800;font-size:1.1em;border:2px solid ${C_BORDER};padding:4px 14px;background:${C_HEAD};${PRINT_COLOR}">
        Total&nbsp;${fmtMoney(data.total)}
      </div>
    </div>

  </div>`
}

// ── Dimensiones: media carta horizontal = 8.5" × 5.5" → 816 × 528 px a 96 dpi
const PREVIEW_W = 816
const PREVIEW_H = 528

/**
 * @param {{
 *   data: any,
 *   business: { name: string, logo: string, nit: string, address: string, phone: string },
 *   taxEnabled?: boolean,
 *   onClose: () => void,
 * }} props
 */
export function ReceiptModal({ data, business, taxEnabled = false, onClose }) {
  const { printerName, paperSize } = usePrinterSettings()

  async function handlePrint() {
    if (!data) return
    const body = buildInvoiceBody(data, business, taxEnabled)

    // Para thermal se mantiene el formato antiguo compacto; para carta/media carta se usa el formato factura
    const isThermal = paperSize === 'thermal-80'

    const pageCss = isThermal
      ? '@page { size: 80mm auto; margin: 2mm 3mm; }'
      : '@page { size: 8.5in 5.5in landscape; margin: 6mm 10mm; }'   // media carta horizontal

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  ${pageCss}
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 100%; height: 100%; }
  body { display: flex; justify-content: center; }
  .wrap { display: flex; flex-direction: column; width: 100%; min-height: 100%; }
  img { display: block; }
  table { border-collapse: collapse; }
  @media print {
    html, body { width: 8.5in; height: 5.5in; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .wrap { min-height: 100%; }
  }
</style>
</head>
<body>
  <div class="wrap">
    ${body}
  </div>
</body></html>`

    if (printerName && window.api?.printer) {
      const result = await window.api.printer.print(html, printerName, 'half-letter')
      if (!result.ok) openPrintDialog(html)
    } else {
      openPrintDialog(html)
    }
  }

  function openPrintDialog(html) {
    const win = window.open('', '_blank', 'width=860,height=600')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  if (!data) return null

  const body = buildInvoiceBody(data, business, taxEnabled)

  return (
    <Dialog open={!!data} onOpenChange={o => { if (!o) onClose() }}>
      {/* max-w-5xl ≈ 1024px para que quepan los 816px del preview + padding del dialog */}
      <DialogContent className="max-w-5xl p-0 gap-0 [&>button:last-child]:hidden">

        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-white sticky top-0 z-10">
          <span className="text-sm font-semibold">Comprobante — Vista previa (media carta horizontal)</span>
          <div className="flex gap-2">
            <Button size="sm" onClick={handlePrint}>
              <Printer className="mr-1.5 h-3.5 w-3.5" /> Imprimir
            </Button>
            <Button size="sm" variant="outline" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Preview: hoja de papel a escala real */}
        <div className="overflow-auto bg-gray-300 flex justify-center items-start py-5"
          style={{ maxHeight: 'calc(90vh - 56px)' }}>
          <div
            style={{
              width:      PREVIEW_W,
              height:     PREVIEW_H,
              background: '#fff',
              boxShadow:  '0 4px 16px rgba(0,0,0,0.18)',
              overflow:   'hidden',
            }}
            dangerouslySetInnerHTML={{ __html: body }}
          />
        </div>

      </DialogContent>
    </Dialog>
  )
}
