-- Creates a local PostgreSQL role and database for development
-- Adjust password/role names as needed

-- In psql as a superuser (e.g., postgres):
-- \i prisma/local-postgres.sql

DO $$ BEGIN
  CREATE ROLE astrahire WITH LOGIN PASSWORD 'astrahire_dev';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE DATABASE astrahire OWNER astrahire;
EXCEPTION WHEN duplicate_database THEN NULL; END $$;

-- Recommended extensions
\c astrahire
CREATE EXTENSION IF NOT EXISTS pgcrypto;
