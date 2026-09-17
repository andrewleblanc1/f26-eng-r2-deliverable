-- Migration: add an `endangered` flag to the species table.
--
-- Run this once in the Supabase SQL Editor (SQL Editor > New query > paste > Run)
-- against an existing database. `setup.sql` already includes this column, so a
-- database created from scratch does not need this migration.
--
-- The column is NOT NULL with a default of false, so every existing species row
-- is backfilled as "not endangered" and the generated Typescript type is a plain
-- boolean rather than a nullable one.

alter table public.species
  add column if not exists endangered boolean not null default false;
