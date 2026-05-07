import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, LogIn, DatabaseZap, Eye, EyeOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'

import { useAuthContext } from './AuthContext'
import { ROUTES } from '../../lib/constants'
import { isElectron } from '@/services/webApiService.js'

const loginSchema = z.object({
  email:    z.string().trim().email('Email invalido'),
  password: z.string().min(1, 'Contraseña requerida'),
})

export default function LoginPage() {
  const { login } = useAuthContext()
  const navigate = useNavigate()
  const [authError,   setAuthError]   = useState(/** @type {string | null} */ (null))
  const [submitting,  setSubmitting]  = useState(false)
  const [setupRunning, setSetupRunning] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

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
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-4xl h-[600px] border-0 shadow-2xl overflow-hidden flex">
        {/* Columna izquierda: Formulario (azul) */}
        <div className="w-full lg:w-2/5 flex flex-col items-center justify-center px-8 py-6"
          style={{
            backgroundColor: '#4a6b8a'
          }}
        >
          <div className="w-full max-w-xs">
            {/* Header con LOGIN */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-white tracking-wide">LOGIN</h1>
            </div>

            {/* Formulario */}
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-1">
                <Label htmlFor="email" className="text-xs font-medium text-white/90">Correo</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="usuario@empresa.com"
                  className="h-9 text-sm"
                  {...form.register('email')}
                  aria-invalid={form.formState.errors.email ? 'true' : 'false'}
                />
                {form.formState.errors.email && (
                  <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="password" className="text-xs font-medium text-white/90">Contraseña</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="h-9 text-sm pr-9"
                    {...form.register('password')}
                    aria-invalid={form.formState.errors.password ? 'true' : 'false'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    title={showPassword ? 'Ocultar' : 'Mostrar'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {form.formState.errors.password && (
                  <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
                )}
              </div>

              {authError && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-9 text-sm font-medium"
                disabled={submitting}
              >
                <LogIn className="mr-2 h-3.5 w-3.5" />
                {submitting ? 'Ingresando...' : 'Ingresar'}
              </Button>
            </form>

            {/* Setup (solo web) */}
            {!isElectron && (
              <div className="mt-4 pt-3 border-t">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-8"
                  disabled={setupRunning}
                  onClick={runSetup}
                >
                  <DatabaseZap className="mr-1.5 h-3 w-3" />
                  {setupRunning ? 'Creando...' : 'Inicializar BD nube'}
                </Button>
              </div>
            )}

            {/* Copyright */}
            <p className="mt-4 text-center text-xs text-white/50">
              © {new Date().getFullYear()} Ferretería El Esfuerzo
            </p>
          </div>
        </div>

        {/* Columna derecha: Logo + Bienvenido (blanco, solo desktop) */}
        <div className="hidden lg:flex lg:w-3/5 flex-col items-center justify-center relative overflow-hidden bg-white">
          <img src="/logoEsfuerzo.png" alt="Ferretería El Esfuerzo" className="w-56 h-auto mb-12 drop-shadow-lg" />
          <h2 className="text-5xl font-bold text-gray-900 text-center">Bienvenido.</h2>
          <p className="text-gray-500 mt-3 text-sm">Ferretería El Esfuerzo</p>
        </div>
      </Card>
    </div>
  )
}
