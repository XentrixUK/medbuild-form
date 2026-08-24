// mailer.js — Resend transactional emails.
// No-op if RESEND_API_KEY is unset (e.g. local dev without a key), so the app stays runnable.

import { Resend } from 'resend';

const FROM = 'Xentrix <hello@xentrix.xyz>';
const NOTIFY_TO = process.env.NOTIFY_EMAIL || 'hello@xentrix.xyz';
const APP_URL = process.env.APP_URL || 'https://medbuild-form.vercel.app';

const client = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const enabled = !!client;

const stageLabel = {
  final_year: 'Final / penultimate year',
  f1: 'FY1',
  f2: 'FY2',
  img: 'IMG',
  other: 'Other'
};

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function teamNotification(row) {
  const stage = stageLabel[row.career_stage] || row.career_stage;
  const upsell = row.wants_custom_domain ? ' <strong>· Interested in custom domain</strong>' : '';
  return {
    from: FROM,
    to: NOTIFY_TO,
    replyTo: row.email,
    subject: `New portfolio prospect: ${row.full_name} (${stage})`,
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:560px;color:#1a1a1a;line-height:1.5">
  <h2 style="margin:0 0 12px">New portfolio prospect</h2>
  <p style="color:#555;margin:0 0 20px">Submitted via medbuild-form.vercel.app${upsell}</p>
  <table cellpadding="6" style="border-collapse:collapse;font-size:14px">
    <tr><td style="color:#888">Name</td><td><strong>${esc(row.full_name)}</strong></td></tr>
    <tr><td style="color:#888">Email</td><td><a href="mailto:${esc(row.email)}">${esc(row.email)}</a></td></tr>
    <tr><td style="color:#888">Phone</td><td>${esc(row.phone) || '—'}</td></tr>
    <tr><td style="color:#888">Location</td><td>${esc(row.location) || '—'}</td></tr>
    <tr><td style="color:#888">Career stage</td><td>${esc(stage)}</td></tr>
    <tr><td style="color:#888">Medical school</td><td>${esc(row.medical_school) || '—'}</td></tr>
    <tr><td style="color:#888">Graduation</td><td>${esc(row.graduation_year) || '—'}</td></tr>
    <tr><td style="color:#888">Specialty</td><td>${esc(row.specialty) || '—'}</td></tr>
    <tr><td style="color:#888">Deanery</td><td>${esc(row.deanery) || '—'}</td></tr>
    <tr><td style="color:#888">GMC</td><td>${esc(row.gmc_number) || '—'}</td></tr>
    <tr><td style="color:#888">Tone</td><td>${esc(row.tone) || '—'}</td></tr>
    <tr><td style="color:#888">CV</td><td>${row.has_cv ? `<a href="${esc(row.cv_filename)}">Download CV</a>` : (row.build_cv_for_me ? 'Build one for me' : '—')}</td></tr>
    <tr><td style="color:#888">Source</td><td>${esc(row.source) || '—'}</td></tr>
    <tr><td style="color:#888">Marketing opt-in</td><td>${row.consent_marketing ? 'Yes' : 'No'}</td></tr>
  </table>
  ${row.notes ? `<p style="margin-top:20px;padding:12px;background:#f5f5f5;border-radius:6px"><strong>Notes:</strong><br>${esc(row.notes)}</p>` : ''}
  <p style="margin-top:24px;color:#888;font-size:12px">Prospect ID: ${row.id}</p>
</div>`
  };
}

function prospectAutoReply(row) {
  const first = (row.full_name || '').split(' ').slice(-1)[0] || row.full_name;
  return {
    from: FROM,
    to: row.email,
    replyTo: NOTIFY_TO,
    subject: `We've got your details, Dr ${first} — Xentrix portfolio build`,
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:560px;color:#1a1a1a;line-height:1.6">
  <h2 style="margin:0 0 12px">Welcome, Dr ${esc(first)} 👋</h2>
  <p>Thanks for sending your details through — we've got everything we need to start building your medical portfolio.</p>
  <p><strong>What happens next:</strong></p>
  <ul>
    <li>Our team reviews your submission (usually within 24–48 hours)</li>
    <li>We build the portfolio page and send you the live link</li>
    <li>Yours to keep, share with employers, and update as your career grows</li>
  </ul>
  <p>If you think of anything else you'd like included — a photo, a specific tone, a rotation you forgot — just reply to this email.</p>
  <p style="margin-top:24px">— The Xentrix team</p>
  <p style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;color:#888;font-size:12px">
    You can ask us to delete your data at any time by replying to this email.<br>
    Xentrix (XENTRIX XYZ LTD) · Registered in England &amp; Wales
  </p>
</div>`
  };
}

// Fire-and-forget. Never throws — email failure must not block the DB write.
export async function sendSubmitEmails(row) {
  if (!enabled) {
    console.log('[mailer] RESEND_API_KEY not set — skipping emails');
    return;
  }
  const jobs = [
    client.emails.send(teamNotification(row)),
    client.emails.send(prospectAutoReply(row))
  ];
  const results = await Promise.allSettled(jobs);
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[mailer] email ${i === 0 ? 'notify' : 'autoreply'} failed:`, r.reason);
    } else if (r.value?.error) {
      console.error(`[mailer] email ${i === 0 ? 'notify' : 'autoreply'} error:`, r.value.error);
    }
  });
}
