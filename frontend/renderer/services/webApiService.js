// ─── Web API Service ────────────────────────────────────────
// Capa única de comunicación con el Apps Script desplegado en Google.
// Solo se usa cuando la app corre en el navegador (fuera de Electron).
//
// Configura VITE_APPS_SCRIPT_URL en .env.local:
//   VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/<ID>/exec
// Configura VITE_APPS_SCRIPT_API_KEY si habilitaste la protección por API key.

const BASE_URL  = import.meta.env.VITE_APPS_SCRIPT_URL  || "";
const API_KEY   = import.meta.env.VITE_APPS_SCRIPT_API_KEY || "";

// ─── Detección de entorno ────────────────────────────────────
export const isElectron = typeof window !== "undefined" && !!window?.api;

// ─── Helpers internos ───────────────────────────────────────

function _buildUrl(params = {}) {
  if (!BASE_URL) throw new Error("VITE_APPS_SCRIPT_URL no está configurado.");
  const url = new URL(BASE_URL);
  if (API_KEY) url.searchParams.set("apiKey", API_KEY);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });
  return url.toString();
}

async function _parseResponse(res) {
  const json = await res.json();
  if (!json.ok) {
    const err = new Error(json.error?.message || "Error en el servidor");
    err.code  = json.error?.code || "UNKNOWN";
    throw err;
  }
  return json.data;
}

// ─── GET: leer filas ─────────────────────────────────────────
// webApi.get("products")                 → todas las filas
// webApi.get("products", { id: 5 })      → fila exacta por id
// webApi.get("products", { search: "x" })→ búsqueda full-text
// webApi.get("products", { limit: 100 }) → primeras N filas
export async function get(sheet, params = {}) {
  const url = _buildUrl({ sheet, ...params });
  const res = await fetch(url, { method: "GET" });
  return _parseResponse(res);
}

// ─── POST: mutaciones ────────────────────────────────────────
async function _post(action, sheet, payload) {
  if (!BASE_URL) throw new Error("VITE_APPS_SCRIPT_URL no está configurado.");
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" }, // Apps Script requiere text/plain para evitar preflight CORS
    body: JSON.stringify({ action, sheet, apiKey: API_KEY, ...payload })
  });
  return _parseResponse(res);
}

export const insert     = (sheet, data)        => _post("insert",  sheet, { data });
export const update     = (sheet, data)        => _post("update",  sheet, { data });
export const remove     = (sheet, id)          => _post("delete",  sheet, { data: { id } });
export const upsert     = (sheet, data)        => _post("upsert",  sheet, { data });
export const bulkUpsert = (sheet, rows)        => _post("bulk",    sheet, { rows });

// ─── Envolturas con forma { ok, data } (compatibles con unwrap) ─
// Permiten reutilizar la misma función unwrap() que usa IPC.

export function envelope(promise) {
  return promise
    .then(data  => ({ ok: true, data }))
    .catch(err  => ({ ok: false, error: { code: err.code || "FETCH_ERROR", message: err.message } }));
}
