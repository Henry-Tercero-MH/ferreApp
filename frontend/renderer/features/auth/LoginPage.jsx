import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, LogIn, DatabaseZap } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'

import { useAuthContext } from './AuthContext'
import { useBusinessSettings } from '@/hooks/useSettings'
import { ROUTES } from '../../lib/constants'
import { isElectron } from '@/services/webApiService.js'

const loginSchema = z.object({
  email:    z.string().trim().email('Email invalido'),
  password: z.string().min(1, 'Contraseña requerida'),
})

/**
 * Login migrado a tokens semanticos + shadcn. Sin CSS legacy.
 * La logica de auth (mock con MOCK_USERS) no se toca: sigue siendo
 * responsabilidad de useAuth/AuthContext.
 */
export default function LoginPage() {
  const { login } = useAuthContext()
  const navigate = useNavigate()
  const { name: appName, logo } = useBusinessSettings()
  const [authError,   setAuthError]   = useState(/** @type {string | null} */ (null))
  const [submitting,  setSubmitting]  = useState(false)
  const [setupRunning, setSetupRunning] = useState(false)

  const runSetup = async () => {
    const url = import.meta.env.VITE_APPS_SCRIPT_URL
    if (!url) { toast.error('VITE_APPS_SCRIPT_URL no configurado'); return }
    setSetupRunning(true)
    try {
      const res  = await fetch(`${url}?action=setup`, { method: 'GET' })
      const text = await res.text()
      let json
      try { json = JSON.parse(text) } catch { json = null }

      if (json?.ok === true) {
        toast.success('Hojas creadas correctamente. Ya puedes ingresar.')
      } else if (json?.error?.message?.includes("'sheet' requerido") ||
                 json?.error?.message?.includes("sheet")) {
        toast.error('El Apps Script necesita ser redesplegado con la versión actualizada de Code.gs', {
          description: 'Ve a script.google.com → Implementar → Nueva implementación.',
          duration: 8000,
        })
      } else {
        toast.error(json?.error?.message || 'Error al inicializar. Verifica el Apps Script.')
      }
    } catch {
      toast.error('No se pudo conectar con el servidor')
    } finally {
      setSetupRunning(false)
    }
  }

  useEffect(() => {
    if (localStorage.getItem('db_just_restored')) {
      localStorage.removeItem('db_just_restored')
      toast.success('Base de datos restaurada exitosamente', {
        description: 'Ingresa para continuar.',
        duration: 6000,
      })
    }
  }, [])

  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  /** @param {z.infer<typeof loginSchema>} values */
  const onSubmit = async (values) => {
    setAuthError(null)
    setSubmitting(true)
    try {
      await login(values.email, values.password)
      navigate(ROUTES.DASHBOARD)
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Error al ingresar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6"
      style={{ background: 'var(--sidebar-bg)' }}>
      <Card className="w-full max-w-6xl border-0 shadow-2xl overflow-hidden">
        <div className="flex min-h-[600px] lg:min-h-full">
          {/* Columna izquierda: Logo y branding */}
          <div className="hidden lg:flex w-1/2 flex-col items-center justify-center overflow-hidden border-r" 
            style={{ background: 'linear-gradient(135deg, var(--sidebar-bg) 0%, rgba(15, 61, 125, 0.8) 100%)' }}>
            {logo && (
              <img src={logo} alt={appName} className="w-full h-full object-cover" />
            )}
          </div>

          {/* Columna derecha: Formulario */}
          <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-8">
            <div className="w-full max-w-md">
              <div className="items-center text-center lg:hidden mb-6">
                {logo && (
                  <img src={logo} alt={appName} className="h-16 w-auto mx-auto mb-4" />
                )}
                <h2 className="text-2xl font-semibold">{appName}</h2>
                <p className="text-sm text-muted-foreground">Sistema de Gestion — Taller &amp; POS</p>
              </div>
              <div className="hidden lg:block items-center text-center mb-6">
                <h2 className="text-2xl font-semibold">{appName}</h2>
                <p className="text-sm text-muted-foreground">Sistema de Gestion — Taller &amp; POS</p>
              </div>

              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <div className="grid gap-2">
                  <Label htmlFor="email">Correo electronico</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="usuario@empresa.com"
                    {...form.register('email')}
                    aria-invalid={form.formState.errors.email ? 'true' : 'false'}
                  />
                  {form.formState.errors.email && (
                    <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    {...form.register('password')}
                    aria-invalid={form.formState.errors.password ? 'true' : 'false'}
                  />
                  {form.formState.errors.password && (
                    <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
                  )}
                </div>

                {authError && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{authError}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  variant="default"
                  className="w-full"
                  disabled={submitting}
                >
                  <LogIn className="mr-2 h-4 w-4" />
                  {submitting ? 'Ingresando...' : 'Ingresar'}
                </Button>
              </form>

              {!isElectron && (
                <div className="mt-4 border-t pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full text-xs text-muted-foreground"
                    disabled={setupRunning}
                    onClick={runSetup}
                  >
                    <DatabaseZap className="mr-2 h-3 w-3" />
                    {setupRunning ? 'Creando hojas...' : 'Inicializar base de datos en la nube'}
                  </Button>
                </div>
              )}

              <p className="mt-4 text-center text-xs text-muted-foreground/60">
                &copy; {new Date().getFullYear()} Ferreteria El Esfuerzo. Todos los derechos reservados.
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
