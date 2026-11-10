-- À exécuter une fois dans la console de la base D1 (voir DEPLOIEMENT.md).
CREATE TABLE IF NOT EXISTS records (
  id      TEXT PRIMARY KEY,
  kind    TEXT NOT NULL,
  data    TEXT NOT NULL,
  updated INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  rev     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS records_rev ON records (rev);
