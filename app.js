// app.js — Express app for Xentrix medical portfolio intake.
// Exported so server.js can call listen (local dev) and api/index.js can hand it to Vercel.

import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import { randomUUID, createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { put } from '@vercel/blob';
import { insertProspect, listProspects, getProspect, deleteProspect, countProspects } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

export const ADMIN_KEY = process.env.ADMIN_KEY || 'xentrix-dev-key';
const HAS_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;

// --- Uploads (CV) -----------------------------------------------------------
// Memory storage everywhere; we decide per-request whether to persist to Vercel Blob or local disk.
const UPLOAD_DIR = join(__dirname, 'uploads');
if (!HAS_BLOB && !existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['.pdf', '.doc', '.docx'].includes(extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('CV must be PDF, DOC or DOCX'), ok);
  }
});

async function persistCV(file) {
  const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const name = `${Date.now()}-${randomUUID().slice(0, 8)}-${safe}`;
  if (HAS_BLOB) {
    const blob = await put(`cvs/${name}`, file.buffer, {
      access: 'public',
      contentType: file.mimetype
    });
    return blob.url;
  }
  writeFileSync(join(UPLOAD_DIR, name), file.buffer);
  return name;
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// --- Validation -------------------------------------------------------------
const asArray = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);

const schema = z.object({
  full_name: z.string().min(2, 'Name required').max(120),
  email: z.string().email('Valid email required').max(160),
  phone: z.string().max(40).optional().default(''),
  location: z.string().max(120).optional().default(''),
  career_stage: z.enum(['final_year', 'f1', 'f2', 'img', 'other']),
  medical_school: z.string().max(160).optional().default(''),
  graduation_year: z.string().max(10).optional().default(''),
  gmc_number: z.string().max(20).optional().default(''),
  specialty: z.string().max(120).optional().default(''),
  deanery: z.string().max(120).optional().default(''),
  professional_summary: z.string().max(1500).optional().default(''),
  education: z.string().max(3000).optional().default(''),
  rotations: z.string().max(3000).optional().default(''),
  research: z.string().max(3000).optional().default(''),
  teaching: z.string().max(2000).optional().default(''),
  certifications: z.string().max(1500).optional().default(''),
  memberships: z.string().max(1500).optional().default(''),
  achievements: z.string().max(2000).optional().default(''),
  build_cv_for_me: z.string().optional(),
  tone: z.string().max(40).optional().default(''),
  colour_direction: z.string().max(120).optional().default(''),
  sections_wanted: z.any().optional(),
  wants_custom_domain: z.string().optional(),
  linkedin: z.string().max(200).optional().default(''),
  orcid: z.string().max(200).optional().default(''),
  existing_site: z.string().max(200).optional().default(''),
  notes: z.string().max(2000).optional().default(''),
  source: z.string().max(120).optional().default(''),
  consent_data: z.string().refine((v) => v === 'on' || v === 'true', {
    message: 'You must agree to the data processing notice to continue.'
  }),
  consent_marketing: z.string().optional()
});

// --- Submit -----------------------------------------------------------------
app.post('/api/submit', upload.single('cv'), async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      errors: parsed.error.issues.map((i) => ({ field: i.path[0], message: i.message }))
    });
  }
  const d = parsed.data;
  const ipHint = createHash('sha256')
    .update((req.headers['x-forwarded-for'] || req.socket.remoteAddress || '') + '')
    .digest('hex')
    .slice(0, 16);

  let cvRef = null;
  if (req.file) {
    try {
      cvRef = await persistCV(req.file);
    } catch (err) {
      console.error('CV persist failed:', err);
      return res.status(500).json({ ok: false, errors: [{ message: 'Could not save your CV. Try again.' }] });
    }
  }

  const row = {
    id: randomUUID(),
    created_at: new Date().toISOString(),
    status: 'new',
    full_name: d.full_name.trim(),
    email: d.email.trim().toLowerCase(),
    phone: d.phone,
    location: d.location,
    career_stage: d.career_stage,
    medical_school: d.medical_school,
    graduation_year: d.graduation_year,
    gmc_number: d.gmc_number,
    specialty: d.specialty,
    deanery: d.deanery,
    professional_summary: d.professional_summary,
    education: d.education,
    rotations: d.rotations,
    research: d.research,
    teaching: d.teaching,
    certifications: d.certifications,
    memberships: d.memberships,
    achievements: d.achievements,
    has_cv: cvRef ? 1 : 0,
    cv_filename: cvRef,
    build_cv_for_me: d.build_cv_for_me === 'on' ? 1 : 0,
    tone: d.tone,
    colour_direction: d.colour_direction,
    sections_wanted: JSON.stringify(asArray(d.sections_wanted)),
    wants_custom_domain: d.wants_custom_domain === 'on' ? 1 : 0,
    links: JSON.stringify({ linkedin: d.linkedin, orcid: d.orcid, existing_site: d.existing_site }),
    notes: d.notes,
    consent_data: 1,
    consent_marketing: d.consent_marketing === 'on' ? 1 : 0,
    source: d.source,
    ip_hint: ipHint
  };

  try {
    await insertProspect(row);
    return res.json({ ok: true, id: row.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, errors: [{ message: 'Server error. Try again.' }] });
  }
});

// --- Admin ------------------------------------------------------------------
function requireAdmin(req, res, next) {
  const key = req.query.key || req.headers['x-admin-key'];
  if (key !== ADMIN_KEY) return res.status(401).json({ ok: false, error: 'Unauthorised' });
  next();
}

app.get('/api/prospects', requireAdmin, async (_req, res) => {
  const [count, prospects] = await Promise.all([countProspects(), listProspects()]);
  res.json({ ok: true, count, prospects });
});

app.get('/api/prospects/:id', requireAdmin, async (req, res) => {
  const p = await getProspect(req.params.id);
  if (!p) return res.status(404).json({ ok: false });
  res.json({ ok: true, prospect: p });
});

app.delete('/api/prospects/:id', requireAdmin, async (req, res) => {
  const r = await deleteProspect(req.params.id);
  res.json({ ok: true, deleted: r.changes });
});

app.get('/health', async (_req, res) => res.json({ ok: true, count: await countProspects() }));

export default app;
