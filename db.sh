#!/bin/bash
# ---------------------------------------------------------------------------
# Arranque manual de PostgreSQL 17 (Homebrew) para Arqueo.
#
# A proposito NO usamos `brew services start`, que registraria el servidor en
# el arranque del Mac. Este script lo levanta solo cuando tu lo pides.
#
#   ./db.sh start    -> arranca el servidor
#   ./db.sh stop     -> lo detiene
#   ./db.sh status   -> dice si esta corriendo
#   ./db.sh psql     -> abre una consola SQL sobre la BD de la app
#   ./db.sh logs     -> ultimas lineas del log del servidor
#
# Datos de conexion (los mismos que van en backend/.env y en DBeaver):
#   host localhost  puerto 5432  base arqueo  usuario arqueo  password arqueo
# ---------------------------------------------------------------------------
set -e

PG_BIN="/opt/homebrew/opt/postgresql@17/bin"
PG_DATA="/opt/homebrew/var/postgresql@17"
PG_LOG="$PG_DATA/server.log"
DB_NAME="arqueo"
DB_USER="arqueo"

case "${1:-status}" in
  start)
    "$PG_BIN/pg_ctl" -D "$PG_DATA" -l "$PG_LOG" start
    ;;
  stop)
    "$PG_BIN/pg_ctl" -D "$PG_DATA" stop
    ;;
  restart)
    "$PG_BIN/pg_ctl" -D "$PG_DATA" -l "$PG_LOG" restart
    ;;
  status)
    "$PG_BIN/pg_ctl" -D "$PG_DATA" status
    ;;
  psql)
    PGPASSWORD=arqueo "$PG_BIN/psql" -h localhost -U "$DB_USER" -d "$DB_NAME"
    ;;
  logs)
    tail -n 40 "$PG_LOG"
    ;;
  *)
    echo "Uso: ./db.sh {start|stop|restart|status|psql|logs}"
    exit 1
    ;;
esac
