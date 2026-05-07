import { useState, useEffect } from 'react'
import ActivationPage from '../features/activation/ActivationPage'
import { isElectron } from '../services/webApiService.js'

export default function LicenseGuard({ children }) {
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    // En modo web no hay licencia local — acceso directo
    if (!isElectron) { setStatus('active'); return }

    window.api.license.status().then(res => {
      setStatus(res.ok && res.data.activated ? 'active' : 'inactive')
    }).catch(() => setStatus('inactive'))
  }, [])

  if (status === 'checking') return null
  if (status === 'inactive') return <ActivationPage onActivated={() => setStatus('active')} />
  return children
}
