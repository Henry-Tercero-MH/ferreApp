import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../features/auth/AuthContext';
import { useBusinessSettings, useSettings } from '../hooks/useSettings';
import { useInventoryProducts } from '../features/warehouses/inventoryStore';
import { ROUTES } from '../lib/constants';
import {
  MdDashboard,
  MdPointOfSale,
  MdInventory,
  MdPeopleOutline,
  MdInsertChartOutlined,
  MdReceiptLong,
  MdExitToApp,
  MdManageAccounts,
  MdSettings,
  MdChevronLeft,
  MdChevronRight,
  MdShield,
  MdMenu,
} from 'react-icons/md';
import { Landmark, ShoppingCart, Wallet, FileText, TrendingDown, Truck, RefreshCw } from 'lucide-react'
import { GlobalSearch } from '@/components/shared/GlobalSearch';
import { pullFromCloud } from '../services/syncService.js';
import { isElectron } from '../services/webApiService.js';

/** Todos los ítems configurables del sidebar (key = identificador en nav_visibility) */
const ALL_NAV = [
  { key: 'pos',         to: ROUTES.POS,         label: 'Facturar',           icon: MdPointOfSale },
  { key: 'history',     to: ROUTES.HISTORY,      label: 'Historial',          icon: MdReceiptLong },
  { key: 'inventory',   to: ROUTES.INVENTORY,    label: 'Productos / Stock',  icon: MdInventory },
  { key: 'clients',     to: ROUTES.CLIENTS,      label: 'Clientes',           icon: MdPeopleOutline },
  { key: 'reports',     to: ROUTES.REPORTS,      label: 'Reportes',           icon: MdInsertChartOutlined },
  { key: 'cash',        to: ROUTES.CASH,         label: 'Caja',               icon: Landmark,        adminSection: true },
  { key: 'purchases',   to: ROUTES.PURCHASES,    label: 'Compras',            icon: ShoppingCart,    adminSection: true },
  { key: 'receivables', to: ROUTES.RECEIVABLES,  label: 'Cuentas por Cobrar', icon: Wallet,          adminSection: true },
  { key: 'quotes',      to: ROUTES.QUOTES,       label: 'Cotizaciones',       icon: FileText,        adminSection: true },
  { key: 'expenses',    to: ROUTES.EXPENSES,     label: 'Gastos',             icon: TrendingDown,    adminSection: true },
  { key: 'suppliers',   to: ROUTES.SUPPLIERS,    label: 'Proveedores',        icon: Truck,           adminSection: true },
]

/** Siempre admin-only, no configurables */
const ADMIN_ONLY_NAV = [
  { key: 'users',    to: ROUTES.USERS,    label: 'Usuarios',      icon: MdManageAccounts, adminSection: true },
  { key: 'settings', to: ROUTES.SETTINGS, label: 'Configuración', icon: MdSettings,       adminSection: true },
  { key: 'audit',    to: ROUTES.AUDIT,    label: 'Bitácora',      icon: MdShield,         adminSection: true },
]

/** @type {Record<string, boolean>} */
const DEFAULT_VISIBILITY = {
  pos: true, history: true, inventory: true,
  clients: false, reports: false, cash: false, purchases: false,
  receivables: false, quotes: false, expenses: false, suppliers: false,
}

/** @returns {[boolean, () => void]} */
function useCollapsed() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === 'true'
  );
  function toggle() {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  }
  return /** @type {[boolean, () => void]} */ ([collapsed, toggle]);
}

export default function AppLayout() {
  const { user, logout } = useAuthContext();
  const navigate = useNavigate();
  const [collapsed, toggleCollapsed] = useCollapsed();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  function handleLogout() {
    logout();
    navigate(ROUTES.LOGIN);
  }

  async function handleSync() {
    if (!isElectron) return; // Solo en Electron
    setSyncing(true);
    try {
      await pullFromCloud();
    } catch (err) {
      console.error('Sync error:', err);
    } finally {
      setSyncing(false);
    }
  }

  async function handleNavItemClick() {
    // Sincronizar silenciosamente cuando navega (sin mostrar loading)
    if (!isElectron) return;
    setSyncing(true);
    try {
      await pullFromCloud();
    } catch (err) {
      console.error('Background sync error:', err);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    const closeSidebarOnResize = () => {
      if (window.innerWidth > 768) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', closeSidebarOnResize);
    return () => window.removeEventListener('resize', closeSidebarOnResize);
  }, []);

  const isAdmin = user?.role === 'admin';
  const { name: appName, logo } = useBusinessSettings();
  const { data: products = [] }  = useInventoryProducts();
  const lowStockCount = products.filter(p => p.is_active === 1 && p.stock <= p.min_stock).length;

  // Leer visibilidad del menú desde settings
  const { data: allSettings } = useSettings()
  /** @type {Record<string, Record<string, boolean>>} */
  const navVisibility = /** @type {any} */ (allSettings?.access?.nav_visibility) ?? {}

  // Para no-admin: calcular qué ítems puede ver según su rol
  const role = user?.role ?? ''
  const visibleMain  = isAdmin ? ALL_NAV.filter(i => !i.adminSection) : ALL_NAV.filter(i => !i.adminSection && (navVisibility[i.key]?.[role] ?? DEFAULT_VISIBILITY[i.key] ?? false))
  const visibleAdmin = isAdmin ? [...ALL_NAV.filter(i => i.adminSection), ...ADMIN_ONLY_NAV] : ALL_NAV.filter(i => i.adminSection && (navVisibility[i.key]?.[role] ?? false))

  /** @param {{ to: string, label: string, icon: any, adminSection?: boolean, key: string }} item */
  function renderNavItem({ to, label, icon: Icon }) {
    return (
      <NavLink
        key={to}
        to={to}
        title={collapsed ? label : undefined}
        onClick={() => {
          if (window.innerWidth <= 768) setSidebarOpen(false);
          handleNavItemClick(); // Sincronizar al navegar
        }}
        className={({ isActive }) =>
          `nav-item${isActive ? ' nav-item-active' : ''}${collapsed ? ' nav-item-collapsed' : ''}`
        }
      >
        <span className="relative">
          <Icon className="nav-icon" />
          {to === ROUTES.INVENTORY && lowStockCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 h-4 min-w-[16px] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
              {lowStockCount > 9 ? '9+' : lowStockCount}
            </span>
          )}
        </span>
        {!collapsed && <span className="nav-label">{label}</span>}
      </NavLink>
    )
  }

  return (
    <div className={`app-shell${collapsed ? ' sidebar-collapsed' : ''}${sidebarOpen ? ' sidebar-open' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          {!collapsed && (
            logo
              ? <img src={logo} alt={appName} className="brand-logo" />
              : <span className="brand-icon">▦</span>
          )}
          {!collapsed && <span className="brand-name">{appName}</span>}
          <button
            className="sidebar-toggle"
            onClick={toggleCollapsed}
            title={collapsed ? 'Expandir' : 'Colapsar'}
          >
            {collapsed ? <MdChevronRight /> : <MdChevronLeft />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {/* Dashboard: solo admin */}
          {isAdmin && (
            <NavLink
              to={ROUTES.DASHBOARD}
              title={collapsed ? 'Dashboard' : undefined}
              onClick={() => {
                if (window.innerWidth <= 768) setSidebarOpen(false);
                handleNavItemClick(); // Sincronizar al navegar
              }}
              className={({ isActive }) =>
                `nav-item${isActive ? ' nav-item-active' : ''}${collapsed ? ' nav-item-collapsed' : ''}`
              }
            >
              <MdDashboard className="nav-icon" />
              {!collapsed && <span className="nav-label">Dashboard</span>}
            </NavLink>
          )}

          {visibleMain.map(renderNavItem)}

          {visibleAdmin.length > 0 && (
            <>
              {!collapsed && <div className="nav-section-label">Administración</div>}
              {collapsed && <div className="nav-section-divider" />}
              {visibleAdmin.map(renderNavItem)}
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <button className="btn-logout-full" onClick={handleLogout} title={collapsed ? 'Cerrar sesión' : undefined}>
            <MdExitToApp className="logout-icon" />
            {!collapsed && <span>Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      <div className="main-wrapper">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="topbar-sidebar-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title={sidebarOpen ? 'Cerrar menú' : 'Abrir menú'}
            >
              <MdMenu style={{ fontSize: 20 }} />
            </button>
            <GlobalSearch />
          </div>
          <div className="topbar-right">
            {isElectron && (
              <button
                className="topbar-audit-btn"
                title={syncing ? 'Sincronizando...' : 'Sincronizar con Google Sheets (Click manual)'}
                onClick={handleSync}
                disabled={syncing}
              >
                <RefreshCw style={{ fontSize: 18, animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
              </button>
            )}
            {isAdmin && (
              <button
                className="topbar-audit-btn"
                title="Bitácora"
                onClick={() => navigate(ROUTES.AUDIT)}
              >
                <MdShield style={{ fontSize: 18 }} />
              </button>
            )}
            <div className="topbar-user">
              <div className="topbar-avatar">
                {user?.avatar
                  ? <img src={user.avatar} alt={user.full_name} className="topbar-avatar-img" />
                  : (user?.full_name?.[0]?.toUpperCase() ?? '?')
                }
              </div>
              <div className="topbar-user-info">
                <span className="topbar-user-name">{user?.full_name ?? '—'}</span>
                <span className="topbar-user-role">{user?.role ?? ''}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
