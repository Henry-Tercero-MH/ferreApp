import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Building2, Check, Palette, Printer, ShieldCheck, Database, Download, Clock, HardDrive, LayoutList, CloudUpload, LockOpen } from 'lucide-react'

import { Button }   from '@/components/ui/button'
import { Input }    from '@/components/ui/input'
import { Label }    from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch }   from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import { PageHeader }     from '@/components/shared/PageHeader'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

import { useSettings }        from '@/hooks/useSettings'
import { useAuthContext }     from '@/features/auth/AuthContext'
import * as settingsService   from '@/services/settingsService.js'
import { syncBidirectional, startAutoSync } from '@/services/syncService.js'
import * as cashService       from '@/services/cashService.js'
import { isElectron }         from '@/services/webApiService.js'
import { settingsKeys }       from '@/hooks/queryKeys.js'
import { THEMES, THEME_MAP, applyTheme } from '@/lib/themes'

const THEME_GROUPS = [
  { label: 'Clásicos',  ids: ['crimson','tricolor','tricolor-buttons','ocean','forest','violet','slate','amber','rose','teal','indigo','emerald','coral','carbon'] },
  { label: 'Claros',    ids: ['light-sky','light-sand'] },
  { label: 'Mate',      ids: ['matte-steel','matte-earth'] },
  { label: 'Neón',      ids: ['neon-cyan','neon-magenta'] },
]

// ─────────────────────────────────────────────────────────────────────────────

/** @param {Record<string, Record<string,unknown>>} grouped */
function flat(grouped) {
  /** @type {Record<string,unknown>} */
  const out = {}
  for (const cat of Object.values(grouped ?? {})) Object.assign(out, cat)
  return out
}

// ── hooks ────────────────────────────────────────────────────────────────────

function useSetSetting() {
  const qc = useQueryClient()
  return useMutation({
    /** @param {{ key: string, value: unknown }} p */
    mutationFn: (p) => settingsService.set(p.key, p.value),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.all }),
    onError: (/** @type {unknown} */ e) =>
      toast.error(e instanceof Error ? e.message : 'Error al guardar'),
  })
}

function useUpsertSetting() {
  const qc = useQueryClient()
  return useMutation({
    /** @param {{ key: string, value: string }} p */
    mutationFn: (p) => settingsService.upsert(p.key, p.value),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.all }),
    onError: (/** @type {unknown} */ e) =>
      toast.error(e instanceof Error ? e.message : 'Error al guardar'),
  })
}

// ── componentes base ──────────────────────────────────────────────────────────

/**
 * @param {{ label: string, hint?: string, children: import('react').ReactNode }} p
 */
function Field({ label, hint, children }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

// ── sección selector de paleta ────────────────────────────────────────────────

/**
 * @param {{
 *   currentTheme: string
 *   appName: string
 *   upsertMut: ReturnType<typeof useUpsertSetting>
 * }} p
 */
function ThemeSection({ currentTheme, appName, upsertMut }) {
  const [open, setOpen]       = useState(false)
  const [preview, setPreview] = useState(currentTheme)
  const qc = useQueryClient()

  function handleOpen() { setPreview(currentTheme); setOpen(true) }

  /** @param {string} id */
  function handleSelect(id) { setPreview(id); applyTheme(id) }

  async function handleSave() {
    await upsertMut.mutateAsync({ key: 'app_theme', value: preview })
    await upsertMut.mutateAsync({ key: 'app_name',  value: appName  })
    qc.invalidateQueries({ queryKey: settingsKeys.all })
    toast.success('Tema aplicado')
    setOpen(false)
  }

  function handleCancel() { applyTheme(currentTheme); setOpen(false) }

  const active = THEMES.find(t => t.id === currentTheme) ?? THEMES[0]
  const saving = upsertMut.isPending

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="h-4 w-4 text-muted-foreground" />
            Apariencia de la app
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Nombre en sidebar / título">
            <Input
              defaultValue={appName}
              onBlur={async (e) => {
                const v = e.target.value.trim()
                if (v && v !== appName) {
                  await upsertMut.mutateAsync({ key: 'app_name', value: v })
                  toast.success('Nombre guardado')
                }
              }}
            />
          </Field>

          <div className="grid gap-1.5">
            <Label>Paleta de colores</Label>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-1.5">
                {[active.preview.primary, active.preview.accent, active.preview.sidebar].map((c, i) => (
                  <span key={i} className="block h-6 w-6 rounded-full border border-black/10" style={{ background: c }} />
                ))}
              </div>
              <span className="text-sm font-medium">{active.name}</span>
              <span className="text-xs text-muted-foreground">— {active.description}</span>
            </div>
            <Button size="sm" variant="outline" className="mt-1 w-fit" onClick={handleOpen}>
              <Palette className="mr-1.5 h-3.5 w-3.5" /> Cambiar paleta
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel() }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palette className="h-4 w-4" /> Elegir paleta de colores
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-4 py-1">
            {THEME_GROUPS.map(({ label, ids }) => {
              const themes = ids.map(id => THEME_MAP[id]).filter(Boolean)
              return (
                <div key={label}>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-0.5">{label}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {themes.map((theme) => {
                      const selected = preview === theme.id
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => handleSelect(theme.id)}
                          className={[
                            'relative flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-all',
                            selected
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-muted-foreground/40',
                          ].join(' ')}
                        >
                          <div className="flex gap-1 shrink-0">
                            {[theme.preview.primary, theme.preview.accent, theme.preview.sidebar].map((c, i) => (
                              <span key={i} className="block h-5 w-5 rounded-full border border-black/10" style={{ background: c }} />
                            ))}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold leading-tight truncate">{theme.name}</p>
                            <p className="text-xs text-muted-foreground leading-tight mt-0.5 line-clamp-2">{theme.description}</p>
                          </div>
                          {selected && (
                            <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={handleCancel}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Aplicar paleta'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── sección genérica con formulario ──────────────────────────────────────────

/**
 * @param {{
 *   title: string
 *   icon: import('react').ComponentType<{ className?: string }>
 *   fields: Array<{ key: string, label: string, hint?: string, type: 'string'|'number'|'boolean' }>
 *   defaults: Record<string, unknown>
 *   mut: ReturnType<typeof useSetSetting>
 * }} p
 */
function SettingsSection({ title, icon: Icon, fields, defaults, mut }) {
  const form = useForm({ defaultValues: defaults })

  useEffect(() => {
    form.reset(defaults)
  }, [JSON.stringify(defaults)]) // eslint-disable-line react-hooks/exhaustive-deps

  /** @param {Record<string,unknown>} values */
  async function onSubmit(values) {
    for (const [key, value] of Object.entries(values)) {
      await mut.mutateAsync({ key, value })
    }
    toast.success('Configuración guardada')
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {fields.map(({ key, label, hint, type }) => (
            <Field key={key} label={label} hint={hint}>
              {type === 'boolean' ? (
                <div className="flex items-center gap-2 pt-1">
                  <Switch
                    checked={!!form.watch(key)}
                    onCheckedChange={(v) => form.setValue(key, v, { shouldDirty: true })}
                  />
                </div>
              ) : type === 'number' ? (
                <Input type="number" step="any" {...form.register(key, { valueAsNumber: true })} />
              ) : (
                <Input {...form.register(key)} />
              )}
            </Field>
          ))}
          <div className="flex justify-end pt-2">
            <Button type="submit" size="sm" disabled={mut.isPending}>
              {mut.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

// ── sección logo ──────────────────────────────────────────────────────────────

/** @param {{ current: string, mut: ReturnType<typeof useSetSetting> }} p */
function LogoSection({ current, mut }) {
  const [preview, setPreview] = useState(current || null)
  const inputRef = useRef(/** @type {HTMLInputElement|null} */ (null))

  useEffect(() => { setPreview(current || null) }, [current])

  /** @param {import('react').ChangeEvent<HTMLInputElement>} e */
  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 300 * 1024) { toast.error('El logo no debe superar 300 KB'); return }
    const reader = new FileReader()
    reader.onload = (ev) => setPreview(/** @type {string} */ (ev.target?.result))
    reader.readAsDataURL(file)
  }

  async function handleSave() {
    if (!preview) return
    await mut.mutateAsync({ key: 'business_logo_base64', value: preview })
    toast.success('Logo guardado')
  }

  async function handleRemove() {
    setPreview(null)
    await mut.mutateAsync({ key: 'business_logo_base64', value: '' })
    toast.success('Logo eliminado')
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          Logo del negocio
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-6">
          <div className="flex h-24 w-24 items-center justify-center rounded-lg border-2 border-dashed border-muted bg-muted/20 overflow-hidden">
            {preview
              ? <img src={preview} alt="Logo" className="h-full w-full object-contain p-1" />
              : <span className="text-xs text-muted-foreground text-center px-2">Sin logo</span>
            }
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">PNG, JPG o SVG · máx. 300 KB</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
                Seleccionar archivo
              </Button>
              {preview && (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={handleRemove}>
                  Quitar
                </Button>
              )}
            </div>
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </div>
        </div>
        {preview !== current && (
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} disabled={mut.isPending}>
              {mut.isPending ? 'Guardando...' : 'Guardar logo'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── selector de impresora ─────────────────────────────────────────────────────

/**
 * @param {{ currentValue: string, mut: ReturnType<typeof useSetSetting> }} p
 */
function PrinterSelector({ currentValue, mut }) {
  const [printers, setPrinters] = useState(/** @type {{ name: string, isDefault: boolean }[]} */ ([]))

  useEffect(() => {
    const api = /** @type {any} */ (window.api)
    if (!api?.printer) return
    api.printer.list().then((/** @type {any} */ res) => {
      if (res.ok) setPrinters(res.data)
    })
  }, [])

  async function handleChange(/** @type {import('react').ChangeEvent<HTMLSelectElement>} */ e) {
    await mut.mutateAsync({ key: 'receipt_printer', value: e.target.value })
    toast.success('Impresora guardada')
  }

  return (
    <Field label="Impresora para recibos" hint="Vacío = abre el diálogo del sistema al imprimir">
      <select
        value={currentValue}
        onChange={handleChange}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">(Diálogo del sistema)</option>
        {printers.map(p => (
          <option key={p.name} value={p.name}>
            {p.name}{p.isDefault ? ' — predeterminada' : ''}
          </option>
        ))}
      </select>
    </Field>
  )
}

// ── sección ticket / impresión ────────────────────────────────────────────────

/**
 * @param {{ s: Record<string,unknown>, setMut: ReturnType<typeof useSetSetting> }} p
 */
function TicketSection({ s, setMut }) {
  return (
    <div className="space-y-0">
      <SettingsSection
        title="Ticket / Impresión"
        icon={Printer}
        mut={setMut}
        defaults={{
          ticket_footer_line1: s.ticket_footer_line1 ?? '',
          ticket_footer_line2: s.ticket_footer_line2 ?? '',
          ticket_show_logo:    s.ticket_show_logo    ?? true,
          ticket_show_tax:     s.ticket_show_tax     ?? true,
          ticket_copies:       s.ticket_copies       ?? 1,
          receipt_paper_size:  s.receipt_paper_size  ?? 'half-letter',
        }}
        fields={[
          { key: 'ticket_footer_line1', label: 'Pie de ticket — línea 1',  type: 'string',  hint: 'Ej. ¡Gracias por su preferencia!' },
          { key: 'ticket_footer_line2', label: 'Pie de ticket — línea 2',  type: 'string' },
          { key: 'ticket_show_logo',    label: 'Mostrar logo en ticket',   type: 'boolean' },
          { key: 'ticket_show_tax',     label: 'Desglosar IVA en ticket',  type: 'boolean' },
          { key: 'ticket_copies',       label: 'Copias por venta',         type: 'number' },
          { key: 'receipt_paper_size',  label: 'Tamaño de papel',          type: 'string',  hint: 'half-letter | letter | thermal-80' },
        ]}
      />
      <Card className="-mt-3 rounded-t-none border-t-0 pt-0">
        <CardContent className="pt-4">
          <PrinterSelector
            currentValue={typeof s.receipt_printer === 'string' ? s.receipt_printer : ''}
            mut={setMut}
          />
        </CardContent>
      </Card>
    </div>
  )
}

// ── página principal ──────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { data, isLoading, isError } = useSettings()
  const setMut    = useSetSetting()
  const upsertMut = useUpsertSetting()

  if (isLoading) return <div className="flex h-64 items-center justify-center"><LoadingSpinner /></div>
  if (isError)   return <div className="p-6 text-destructive">Error al cargar configuración.</div>

  const s = flat(data ?? {})

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Configuración" subtitle="Personaliza la aplicación para tu negocio" />

      <div className="grid gap-6 lg:grid-cols-2">

        <SettingsSection
          title="Datos del negocio"
          icon={Building2}
          mut={setMut}
          defaults={{
            business_name:    s.business_name    ?? '',
            business_nit:     s.business_nit     ?? '',
            business_address: s.business_address ?? '',
            business_phone:   s.business_phone   ?? '',
            business_email:   s.business_email   ?? '',
            business_website: s.business_website ?? '',
            business_city:    s.business_city    ?? '',
            business_country: s.business_country ?? 'Guatemala',
          }}
          fields={[
            { key: 'business_name',    label: 'Nombre / Razón social', type: 'string' },
            { key: 'business_nit',     label: 'NIT',                   type: 'string' },
            { key: 'business_address', label: 'Dirección',             type: 'string' },
            { key: 'business_phone',   label: 'Teléfono',              type: 'string' },
            { key: 'business_email',   label: 'Correo',                type: 'string' },
            { key: 'business_website', label: 'Sitio web',             type: 'string' },
            { key: 'business_city',    label: 'Ciudad',                type: 'string' },
            { key: 'business_country', label: 'País',                  type: 'string' },
          ]}
        />

        {/* LogoSection deshabilitado temporalmente */}

        <ThemeSection
          currentTheme={typeof s.app_theme === 'string' ? s.app_theme : 'crimson'}
          appName={typeof s.app_name  === 'string' ? s.app_name  : 'SerProMec'}
          upsertMut={upsertMut}
        />

        {false && (
          <SettingsSection
            title="Moneda e impuestos"
            icon={ShieldCheck}
            mut={setMut}
            defaults={{
              currency_code:         s.currency_code         ?? 'GTQ',
              currency_symbol:       s.currency_symbol       ?? 'Q',
              decimal_places:        s.decimal_places        ?? 2,
              tax_enabled:           s.tax_enabled           ?? false,
              tax_rate:              s.tax_rate              ?? 0.12,
              tax_included_in_price: s.tax_included_in_price ?? false,
            }}
            fields={[
              { key: 'currency_code',        label: 'Código moneda (ISO 4217)', type: 'string',  hint: 'GTQ, USD, MXN…' },
              { key: 'currency_symbol',      label: 'Símbolo',                  type: 'string' },
              { key: 'decimal_places',       label: 'Decimales',                type: 'number' },
              { key: 'tax_enabled',          label: 'Habilitar IVA',            type: 'boolean', hint: 'Activa el cálculo y visualización de IVA en toda la app' },
              { key: 'tax_rate',             label: 'Tasa de IVA (decimal)',    type: 'number',  hint: '0.12 = 12 %' },
              { key: 'tax_included_in_price',label: 'IVA embebido en el precio', type: 'boolean', hint: 'Activo: el IVA se extrae del precio ingresado. Inactivo: el IVA se agrega encima del precio base.' },
            ]}
          />
        )}

        <TicketSection s={s} setMut={setMut} />

        <BackupSection settings={s} />

        <CloudSyncSection />

        <SheetsSetupSection />

        <CashQuickSection />

        <NavVisibilitySection current={s.nav_visibility} setMut={setMut} />

      </div>
    </div>
  )
}

// ── Sección: Visibilidad del menú lateral ────────────────────────────────────

const NAV_ITEMS_CFG = [
  { key: 'pos',         label: 'Facturar' },
  { key: 'history',     label: 'Historial' },
  { key: 'inventory',   label: 'Productos / Stock' },
  { key: 'clients',     label: 'Clientes' },
  { key: 'reports',     label: 'Reportes' },
  { key: 'cash',        label: 'Caja' },
  { key: 'purchases',   label: 'Compras' },
  { key: 'receivables', label: 'Cuentas por Cobrar' },
  { key: 'quotes',      label: 'Cotizaciones' },
  { key: 'expenses',    label: 'Gastos' },
  { key: 'suppliers',   label: 'Proveedores' },
]

const ROLES_CFG = [
  { key: 'cashier',   label: 'Cajero' },
  { key: 'mechanic',  label: 'Mecánico' },
  { key: 'warehouse', label: 'Almacén' },
]

/** @param {{ current: unknown, setMut: ReturnType<typeof useSetSetting> }} p */
function NavVisibilitySection({ current, setMut }) {
  const visibility = /** @type {Record<string, Record<string, boolean>>} */ (
    (typeof current === 'object' && current !== null) ? current : {}
  )

  /** @param {string} itemKey @param {string} roleKey */
  function toggle(itemKey, roleKey) {
    const updated = {
      ...visibility,
      [itemKey]: {
        ...visibility[itemKey],
        [roleKey]: !(visibility[itemKey]?.[roleKey] ?? false),
      },
    }
    setMut.mutate({ key: 'nav_visibility', value: updated })
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <LayoutList className="h-4 w-4 text-muted-foreground" />
          Acceso al menú lateral por rol
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          El rol <strong>Administrador</strong> siempre tiene acceso completo. Los cambios se aplican de inmediato.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4 text-left font-medium text-muted-foreground">Módulo</th>
                {ROLES_CFG.map(r => (
                  <th key={r.key} className="py-2 px-4 text-center font-medium text-muted-foreground w-28">{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NAV_ITEMS_CFG.map((item, i) => (
                <tr key={item.key} className={i % 2 === 0 ? 'bg-muted/30' : ''}>
                  <td className="py-2 pr-4 font-medium">{item.label}</td>
                  {ROLES_CFG.map(role => (
                    <td key={role.key} className="py-2 px-4 text-center">
                      <Switch
                        checked={visibility[item.key]?.[role.key] ?? false}
                        onCheckedChange={() => toggle(item.key, role.key)}
                        disabled={setMut.isPending}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Sección: Respaldo de base de datos ───────────────────────────────────────

const INTERVAL_OPTIONS = [
  { label: 'Cada hora',    hours: 1    },
  { label: 'Cada 6 horas', hours: 6    },
  { label: 'Cada 12 horas',hours: 12   },
  { label: 'Diario',       hours: 24   },
  { label: 'Semanal',      hours: 168  },
  { label: 'Mensual',      hours: 720  },
]

/** @param {number} b */
const fmtBytes = (b) => b >= 1_048_576
  ? `${(b / 1_048_576).toFixed(1)} MB`
  : `${(b / 1024).toFixed(0)} KB`

const SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || ''

function SheetsSetupSection() {
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState(/** @type {string|null} */ (null))

  if (!SCRIPT_URL) return null

  const handleSetup = async () => {
    setLoading(true)
    setResult(null)
    try {
      const url = `${SCRIPT_URL}?action=setup`
      const res  = await fetch(url)
      const json = await res.json()
      if (json.ok) {
        setResult('Hojas inicializadas correctamente.')
      } else {
        setResult(`Error: ${json.error?.message ?? 'desconocido'}`)
      }
    } catch (err) {
      setResult(`Error de red: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4 text-muted-foreground" />
          Inicializar hojas en Google Sheets
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Crea las hojas que faltan en el spreadsheet (cash_sessions, cash_movements, etc.). Seguro ejecutar más de una vez — no borra datos existentes.
        </p>
        {result && (
          <p className={`text-xs ${result.startsWith('Error') ? 'text-destructive' : 'text-green-600'}`}>
            {result}
          </p>
        )}
        <Button size="sm" variant="outline" onClick={handleSetup} disabled={loading}>
          <Database className="mr-2 h-3.5 w-3.5" />
          {loading ? 'Inicializando...' : 'Ejecutar setupSheets()'}
        </Button>
      </CardContent>
    </Card>
  )
}

function CashQuickSection() {
  const { user } = useAuthContext()
  const [loading, setLoading] = useState(false)
  const [openModal, setOpenModal] = useState(false)
  const [amount, setAmount] = useState('100')
  const [session, setSession] = useState(/** @type {any} */ (null))

  useEffect(() => {
    cashService.getOpenSession().then(s => setSession(s)).catch(() => {})
  }, [])

  const handleOpen = async () => {
    setLoading(true)
    try {
      const s = await cashService.openSession({
        userId:        user?.id       ?? 0,
        userName:      user?.full_name ?? 'Admin',
        role:          user?.role      ?? 'admin',
        openingAmount: Number(amount) || 0,
        // campos web adapter
        opened_by:      user?.id       ?? 0,
        opened_by_name: user?.full_name ?? 'Admin',
        opening_amount: Number(amount) || 0,
      })
      setSession(s)
      setOpenModal(false)
      toast.success('Caja abierta correctamente')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al abrir caja')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = async () => {
    if (!session) return
    setLoading(true)
    try {
      await cashService.closeSession({
        id:             session.id,
        userId:         user?.id       ?? 0,
        userName:       user?.full_name ?? 'Admin',
        role:           user?.role      ?? 'admin',
        closingAmount:  session.opening_amount,
        // campos web adapter
        closed_by:      user?.id       ?? 0,
        closed_by_name: user?.full_name ?? 'Admin',
        closing_amount: session.opening_amount,
        expected_amount: session.opening_amount,
      })
      setSession(null)
      toast.success('Caja cerrada')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cerrar caja')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <LockOpen className="h-4 w-4 text-muted-foreground" />
            Caja rápida
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {session
              ? `Caja abierta desde ${new Date(session.opened_at).toLocaleTimeString('es-GT')} — Monto inicial: Q${session.opening_amount}`
              : 'No hay caja abierta.'}
          </p>
          {!session ? (
            <Button size="sm" onClick={() => setOpenModal(true)} disabled={loading}>
              <LockOpen className="mr-2 h-3.5 w-3.5" />
              Abrir caja
            </Button>
          ) : (
            <Button size="sm" variant="destructive" onClick={handleClose} disabled={loading}>
              {loading ? 'Cerrando...' : 'Cerrar caja'}
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Abrir caja</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Field label="Monto inicial en caja (Q)" hint="Ingresa el efectivo con el que inicia el turno.">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setOpenModal(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleOpen} disabled={loading}>
              {loading ? 'Abriendo...' : 'Abrir caja'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function CloudSyncSection() {
  const qc = useQueryClient()
  const [syncing,  setSyncing]  = useState(false)
  const [lastSync, setLastSync] = useState(/** @type {string|null} */ (localStorage.getItem('last_cloud_sync')))
  const [syncError, setSyncError] = useState(/** @type {string|null} */ (null))

  useEffect(() => {
    if (!isElectron) return
    const stop = startAutoSync(({ syncing: s, lastSync: ls, error }) => {
      setSyncing(s)
      if (ls) setLastSync(ls)
      setSyncError(error)
      if (!s && !error) {
        // Refresca queries afectadas por el pull
        qc.invalidateQueries()
      }
    })
    return stop
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSync = async () => {
    setSyncing(true)
    setSyncError(null)
    try {
      await syncBidirectional()
      const now = new Date().toISOString()
      localStorage.setItem('last_cloud_sync', now)
      setLastSync(now)
      qc.invalidateQueries()
      toast.success('Sincronización completada')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al sincronizar'
      setSyncError(msg)
      toast.error(msg)
    } finally {
      setSyncing(false)
    }
  }

  if (!isElectron) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CloudUpload className="h-4 w-4 text-muted-foreground" />
          Sincronización con la nube
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Sync automático cada 15 min: sube datos locales a Google Sheets y descarga cambios de productos, clientes y categorías.
        </p>
        {lastSync && (
          <p className="text-xs text-muted-foreground">
            Última sync: {new Intl.DateTimeFormat('es-GT', { dateStyle: 'short', timeStyle: 'short', hour12: false }).format(new Date(lastSync))}
          </p>
        )}
        {syncError && (
          <p className="text-xs text-destructive">{syncError}</p>
        )}
        <Button onClick={handleSync} disabled={syncing} size="sm">
          <CloudUpload className="mr-2 h-3.5 w-3.5" />
          {syncing ? 'Sincronizando...' : 'Sincronizar ahora'}
        </Button>
      </CardContent>
    </Card>
  )
}

/** @param {string} iso */
const fmtDate = (iso) => new Intl.DateTimeFormat('es-GT', {
  dateStyle: 'short', timeStyle: 'short', hour12: false,
}).format(new Date(iso))

/** @param {{ settings: Record<string,unknown> }} p */
function BackupSection({ settings: s }) {
  const qc  = useQueryClient()
  const api = /** @type {any} */ (isElectron ? window.api : null)

  // Intervalo actual leído de settings (default mensual)
  const savedHours = Number(s.backup_interval_hours ?? 720) || 720
  const savedMax   = Number(s.backup_max_copies     ?? 10)  || 10

  const [intervalHours,   setIntervalHours]   = useState(savedHours)
  const [maxCopies,       setMaxCopies]       = useState(savedMax)
  const [backups,         setBackups]         = useState(/** @type {any[]} */ ([]))
  const [loadingNow,      setLoadingNow]      = useState(false)
  const [loadingExport,   setLoadingExport]   = useState(false)
  const [loadingExcel,    setLoadingExcel]    = useState(false)
  const [savingCfg,       setSavingCfg]       = useState(false)
  const [restoring,       setRestoring]       = useState(false)
  const [confirmRestore,  setConfirmRestore]  = useState(/** @type {string|null} */ (null))

  // Sincronizar si los settings cambian desde fuera
  useEffect(() => { setIntervalHours(savedHours) }, [savedHours])
  useEffect(() => { setMaxCopies(savedMax) }, [savedMax])

  // Cargar lista de backups automáticos al montar (solo Electron)
  useEffect(() => {
    if (!api) return
    api.db.listBackups().then((/** @type {any} */ res) => {
      if (res.ok) setBackups(res.data)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isElectron) return null

  async function handleBackupNow() {
    setLoadingNow(true)
    try {
      const res = await api.db.backupNow()
      if (!res.ok) { toast.error(res.error?.message ?? 'Error'); return }
      toast.success(`Respaldo creado: ${res.data.filename}`)
      const list = await api.db.listBackups()
      if (list.ok) setBackups(list.data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear respaldo')
    } finally {
      setLoadingNow(false)
    }
  }

  async function handleExport() {
    setLoadingExport(true)
    try {
      const res = await api.db.backup()
      if (!res.ok) { toast.error(res.error?.message ?? 'Error'); return }
      if (res.data) toast.success(`Exportado en:\n${res.data}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoadingExport(false)
    }
  }

  async function handleExportToExcel() {
    setLoadingExcel(true)
    try {
      const scriptUrl = import.meta.env.VITE_APPS_SCRIPT_URL
      if (!scriptUrl) { toast.error('VITE_APPS_SCRIPT_URL no configurado'); return }
      const res = await api.db.exportToDrive(scriptUrl)
      if (!res.ok) { toast.error(res.error?.message ?? 'Error'); return }
      toast.success(res.data?.message || '✅ Datos sincronizados a Google Sheets')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al sincronizar')
    } finally {
      setLoadingExcel(false)
    }
  }

  async function handleSaveConfig() {
    setSavingCfg(true)
    try {
      await settingsService.set('backup_interval_hours', intervalHours)
      await settingsService.set('backup_max_copies',     maxCopies)
      await api.db.setBackupInterval(intervalHours, maxCopies)
      qc.invalidateQueries({ queryKey: settingsKeys.all })
      toast.success('Configuración de respaldo guardada')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSavingCfg(false)
    }
  }

  /** Restaura desde un backup de la lista interna (recibe la ruta absoluta) */
  async function handleRestoreFromPath(/** @type {string} */ filePath) {
    setConfirmRestore(null)
    setRestoring(true)
    try {
      const res = await api.db.restore(filePath)
      if (!res.ok) { toast.error(res.error?.message ?? 'Error al restaurar'); return }
      localStorage.setItem('db_just_restored', '1')
      toast.success('Respaldo restaurado. La app se reiniciará en un momento…')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al restaurar')
      setRestoring(false)
    }
  }

  /** Restaura abriendo el diálogo del sistema para elegir un archivo externo */
  async function handleRestoreExternal() {
    setRestoring(true)
    try {
      const res = await api.db.restore(undefined)
      if (!res.ok) { toast.error(res.error?.message ?? 'Error al restaurar'); setRestoring(false); return }
      if (res.data) {
        localStorage.setItem('db_just_restored', '1')
        toast.success('Respaldo restaurado. La app se reiniciará en un momento…')
      } else setRestoring(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al restaurar')
      setRestoring(false)
    }
  }

  const configChanged = intervalHours !== savedHours || maxCopies !== savedMax

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4 text-muted-foreground" /> Respaldo automático de datos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* ── Programación ── */}
        <div className="grid sm:grid-cols-2 gap-4 p-4 rounded-lg border bg-muted/30">
          <div className="grid gap-1.5">
            <Label className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" /> Frecuencia de respaldo
            </Label>
            <select
              value={intervalHours}
              onChange={e => setIntervalHours(Number(e.target.value))}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {INTERVAL_OPTIONS.map(o => (
                <option key={o.hours} value={o.hours}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-1.5">
            <Label className="flex items-center gap-1.5">
              <HardDrive className="h-3.5 w-3.5 text-muted-foreground" /> Copias a conservar
            </Label>
            <input
              type="number" min={1} max={50}
              value={maxCopies}
              onChange={e => setMaxCopies(Math.max(1, Number(e.target.value) || 1))}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>

          <div className="sm:col-span-2 flex justify-end">
            <Button size="sm" onClick={handleSaveConfig} disabled={savingCfg || !configChanged}>
              {savingCfg ? 'Guardando...' : 'Guardar programación'}
            </Button>
          </div>
        </div>

        {/* ── Acciones manuales ── */}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={handleBackupNow} disabled={loadingNow || restoring}>
            <Database className="mr-1.5 h-3.5 w-3.5" />
            {loadingNow ? 'Respaldando...' : 'Respaldar ahora'}
          </Button>
          <Button size="sm" variant="outline" onClick={handleExport} disabled={loadingExport || restoring}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {loadingExport ? 'Exportando...' : 'Exportar a archivo…'}
          </Button>
          <Button size="sm" variant="outline" onClick={handleRestoreExternal} disabled={restoring || loadingNow}>
            <Download className="mr-1.5 h-3.5 w-3.5 rotate-180" />
            {restoring ? 'Restaurando...' : 'Restaurar desde archivo…'}
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportToExcel} disabled={loadingExcel || restoring} title="Exporta datos a Google Drive (reemplaza archivo anterior)">
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {loadingExcel ? 'Sincronizando...' : 'Sincronizar a Drive'}
          </Button>
        </div>

        {/* ── Lista de respaldos automáticos ── */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Respaldos automáticos ({backups.length})
          </p>
          {backups.length === 0
            ? <p className="text-sm text-muted-foreground">Aún no hay respaldos automáticos.</p>
            : (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Archivo</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Fecha</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Tamaño</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {backups.map((b, i) => (
                      <tr key={b.filename} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
                        <td className="px-3 py-1.5 font-mono text-muted-foreground truncate max-w-[220px]">{b.filename}</td>
                        <td className="px-3 py-1.5">{fmtDate(b.createdAt)}</td>
                        <td className="px-3 py-1.5 text-right">{fmtBytes(b.size)}</td>
                        <td className="px-3 py-1.5 text-right">
                          <button
                            type="button"
                            disabled={restoring}
                            onClick={() => setConfirmRestore(b.path)}
                            className="text-primary hover:underline disabled:opacity-40"
                          >
                            Restaurar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>

        {/* ── Diálogo de confirmación de restauración ── */}
        <Dialog open={!!confirmRestore} onOpenChange={(o) => { if (!o) setConfirmRestore(null) }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>¿Restaurar este respaldo?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Se guardará una copia de seguridad del estado actual y luego se reemplazará
              la base de datos con el archivo seleccionado. <strong>La app se reiniciará automáticamente.</strong>
            </p>
            <p className="text-xs font-mono bg-muted rounded px-2 py-1 break-all">
              {confirmRestore?.split('/').pop() ?? confirmRestore}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmRestore(null)}>Cancelar</Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={restoring}
                onClick={() => confirmRestore && handleRestoreFromPath(confirmRestore)}
              >
                {restoring ? 'Restaurando...' : 'Sí, restaurar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

      </CardContent>
    </Card>
  )
}
