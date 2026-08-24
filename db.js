// db.js — libSQL/Turso store for medical portfolio prospects
// Local dev: falls back to a file: URL (SQLite on disk). Prod: point TURSO_DATABASE_URL at a Turso instance.

import { createClient } from '@libsql/client';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const url = process.env.TURSO_DATABASE_URL || `file:${join(__dirname, 'prospects.db')}`;
const authToken = process.env.TURSO_AUTH_TOKEN;

export const db = createClient({ url, authToken });

// --- Schema -----------------------------------------------------------------
// GDPR erasure = one DELETE by id or email. Long-form fields stored as JSON text.
await db.execute(`
  CREATE TABLE IF NOT EXISTS prospects (
    id                TEXT PRIMARY KEY,
    created_at        TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'new',

    full_name         TEXT NOT NULL,
    email             TEXT NOT NULL,
    phone             TEXT,
    location          TEXT,

    career_stage      TEXT NOT NULL,
    medical_school    TEXT,
    graduation_year   TEXT,
    gmc_number        TEXT,
    specialty         TEXT,
    deanery           TEXT,

    professional_summary  TEXT,
    education         TEXT,
    rotations         TEXT,
    research          TEXT,
    teaching          TEXT,
    certifications    TEXT,
    memberships       TEXT,
    achievements      TEXT,

    has_cv            INTEGER NOT NULL DEFAULT 0,
    cv_filename       TEXT,
    build_cv_for_me   INTEGER NOT NULL DEFAULT 0,
    tone              TEXT,
    colour_direction  TEXT,
    sections_wanted   TEXT,
    wants_custom_domain INTEGER NOT NULL DEFAULT 0,
    links             TEXT,
    notes             TEXT,

    consent_data      INTEGER NOT NULL DEFAULT 0,
    consent_marketing INTEGER NOT NULL DEFAULT 0,

    source            TEXT,
    ip_hint           TEXT
  )
`);
await db.execute(`CREATE INDEX IF NOT EXISTS idx_prospects_email  ON prospects(email)`);
await db.execute(`CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status)`);
await db.execute(`CREATE INDEX IF NOT EXISTS idx_prospects_stage  ON prospects(career_stage)`);

// --- Helpers ----------------------------------------------------------------
const INSERT_SQL = `
  INSERT INTO prospects (
    id, created_at, status,
    full_name, email, phone, location,
    career_stage, medical_school, graduation_year, gmc_number, specialty, deanery,
    professional_summary, education, rotations, research, teaching, certifications, memberships, achievements,
    has_cv, cv_filename, build_cv_for_me, tone, colour_direction, sections_wanted, wants_custom_domain, links, notes,
    consent_data, consent_marketing, source, ip_hint
  ) VALUES (
    :id, :created_at, :status,
    :full_name, :email, :phone, :location,
    :career_stage, :medical_school, :graduation_year, :gmc_number, :specialty, :deanery,
    :professional_summary, :education, :rotations, :research, :teaching, :certifications, :memberships, :achievements,
    :has_cv, :cv_filename, :build_cv_for_me, :tone, :colour_direction, :sections_wanted, :wants_custom_domain, :links, :notes,
    :consent_data, :consent_marketing, :source, :ip_hint
  )
`;

export async function insertProspect(row) {
  await db.execute({ sql: INSERT_SQL, args: row });
  return row.id;
}

export async function listProspects() {
  const r = await db.execute('SELECT * FROM prospects ORDER BY created_at DESC');
  return r.rows;
}

export async function getProspect(id) {
  const r = await db.execute({ sql: 'SELECT * FROM prospects WHERE id = ?', args: [id] });
  return r.rows[0] || null;
}

export async function deleteProspect(id) {
  const r = await db.execute({ sql: 'DELETE FROM prospects WHERE id = ?', args: [id] });
  return { changes: r.rowsAffected };
}

export async function countProspects() {
  const r = await db.execute('SELECT COUNT(*) AS n FROM prospects');
  return Number(r.rows[0].n);
}

export default db;
