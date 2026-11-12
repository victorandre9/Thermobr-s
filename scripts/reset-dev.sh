#!/usr/bin/env bash
# Recria o banco LOCAL de desenvolvimento (nunca use em homologação/produção).
set -euo pipefail
DB=${1:-thermobras_dev}
case "$DB" in *dev*|*test*) ;; *) echo "Recusado: nome de banco deve conter dev ou test"; exit 1;; esac
psql "postgres://postgres:postgres@localhost:5432/postgres" -c "drop database if exists $DB" -c "create database $DB"
DATABASE_URL="postgres://postgres:postgres@localhost:5432/$DB" npx tsx scripts/migrate.ts
