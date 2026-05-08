-- 032_relax_cash_fk.sql
-- Relajar restricciones de clave extranjera en cash_sessions y cash_movements
-- Permite sincronizar datos sin errores por usuarios faltantes

-- Habilitar soporte de foreign keys
PRAGMA foreign_keys = ON;

-- Recrear cash_sessions sin REFERENCES a users
ALTER TABLE cash_sessions RENAME TO cash_sessions_old;

CREATE TABLE IF NOT EXISTS cash_sessions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  opened_by        INTEGER NOT NULL,
  opened_by_name   TEXT    NOT NULL,
  opened_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
  opening_amount   REAL    NOT NULL DEFAULT 0,
  closed_by        INTEGER,
  closed_by_name   TEXT,
  closed_at        TEXT,
  closing_amount   REAL,
  expected_amount  REAL,
  difference       REAL,
  notes            TEXT,
  status           TEXT    NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'closed'))
);

INSERT INTO cash_sessions SELECT * FROM cash_sessions_old;
DROP TABLE cash_sessions_old;

-- Recrear cash_movements sin REFERENCES a users
ALTER TABLE cash_movements RENAME TO cash_movements_old;

CREATE TABLE IF NOT EXISTS cash_movements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL,
  type        TEXT    NOT NULL CHECK (type IN ('in', 'out')),
  amount      REAL    NOT NULL CHECK (amount > 0),
  concept     TEXT    NOT NULL,
  created_by  INTEGER,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

INSERT INTO cash_movements SELECT * FROM cash_movements_old;
DROP TABLE cash_movements_old;

-- Recrear índices
CREATE INDEX IF NOT EXISTS idx_cash_sessions_status    ON cash_sessions(status);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_opened_at ON cash_sessions(opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_movements_session  ON cash_movements(session_id);
