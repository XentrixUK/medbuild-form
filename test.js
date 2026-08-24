// test.js — in-process integration test using supertest-style raw http
import { spawn } from 'child_process';
import { setTimeout as wait } from 'timers/promises';

const BASE = 'http://localhost:3111';
const env = { ...process.env, PORT: '3111', ADMIN_KEY: 'test-key' };

const srv = spawn('node', ['server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let booted = false;
srv.stdout.on('data', (d) => { if (/running/.test(d.toString())) booted = true; });
srv.stderr.on('data', (d) => console.error('SRV ERR:', d.toString()));

async function waitForBoot() {
  for (let i = 0; i < 30; i++) { if (booted) return; await wait(100); }
  throw new Error('server did not boot');
}

// build a multipart body manually
function multipart(fields, file) {
  const b = '----t' + Date.now();
  let parts = [];
  for (const [k, v] of Object.entries(fields)) {
    for (const val of [].concat(v)) {
      parts.push(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${val}\r\n`);
    }
  }
  if (file) {
    parts.push(`--${b}\r\nContent-Disposition: form-data; name="cv"; filename="${file.name}"\r\nContent-Type: application/pdf\r\n\r\n${file.content}\r\n`);
  }
  parts.push(`--${b}--\r\n`);
  return { body: parts.join(''), type: `multipart/form-data; boundary=${b}` };
}

let pass = 0, fail = 0;
function check(name, cond) { cond ? (pass++, console.log('  ✓ ' + name)) : (fail++, console.log('  ✗ ' + name)); }

try {
  await waitForBoot();
  console.log('Server booted.\n');

  // 1. health
  let r = await fetch(`${BASE}/health`).then(r => r.json());
  console.log('1. Health check');
  check('returns ok', r.ok === true);

  // 2. valid submission with CV
  console.log('2. Valid submission (with CV)');
  const mp = multipart({
    full_name: 'Dr Aisha Rahman', email: 'Aisha@NHS.net', phone: '07700900000',
    career_stage: 'f1', medical_school: 'University of Leeds', graduation_year: '2026',
    specialty: 'Acute medicine', professional_summary: 'Keen on acute med.',
    tone: 'warm', sections_wanted: ['about', 'research'], wants_custom_domain: 'on',
    consent_data: 'on', consent_marketing: 'on', source: 'Facebook group'
  }, { name: 'aisha-cv.pdf', content: 'FAKE PDF BYTES' });
  r = await fetch(`${BASE}/api/submit`, { method: 'POST', headers: { 'Content-Type': mp.type }, body: mp.body }).then(r => r.json());
  check('accepted', r.ok === true);
  check('returns id', typeof r.id === 'string' && r.id.length > 10);

  // 3. invalid: no consent, bad email, short name
  console.log('3. Invalid submission (bad email, no consent)');
  const bad = multipart({ full_name: 'X', email: 'not-email', career_stage: 'f1' });
  r = await fetch(`${BASE}/api/submit`, { method: 'POST', headers: { 'Content-Type': bad.type }, body: bad.body });
  const badJson = await r.json();
  check('rejected with 400', r.status === 400);
  check('has field errors', Array.isArray(badJson.errors) && badJson.errors.length > 0);
  check('flags email', badJson.errors.some(e => e.field === 'email'));
  check('flags consent', badJson.errors.some(e => e.field === 'consent_data'));

  // 4. second valid submission (no CV, build-for-me)
  console.log('4. Second submission (build CV for me, no upload)');
  const mp2 = multipart({
    full_name: 'Dr Tom Okafor', email: 'tom@example.com', career_stage: 'final_year',
    build_cv_for_me: 'on', consent_data: 'on'
  });
  r = await fetch(`${BASE}/api/submit`, { method: 'POST', headers: { 'Content-Type': mp2.type }, body: mp2.body }).then(r => r.json());
  check('accepted', r.ok === true);

  // 5. admin list — unauthorised
  console.log('5. Admin auth gate');
  r = await fetch(`${BASE}/api/prospects`);
  check('blocks without key (401)', r.status === 401);

  // 6. admin list — authorised
  r = await fetch(`${BASE}/api/prospects?key=test-key`).then(r => r.json());
  check('lists with key', r.ok === true);
  check('count >= 2', r.count >= 2);
  const aisha = r.prospects.find(p => p.email === 'aisha@nhs.net');
  check('email lowercased', !!aisha);
  check('CV recorded', aisha && aisha.has_cv === 1 && !!aisha.cv_filename);
  check('sections stored as JSON', aisha && JSON.parse(aisha.sections_wanted).includes('research'));
  check('upsell signal captured', aisha && aisha.wants_custom_domain === 1);
  check('IP hashed not raw', aisha && /^[a-f0-9]{16}$/.test(aisha.ip_hint));

  // 7. GDPR delete
  console.log('6. GDPR erasure');
  r = await fetch(`${BASE}/api/prospects/${aisha.id}?key=test-key`, { method: 'DELETE' }).then(r => r.json());
  check('deletes record', r.ok === true && r.deleted === 1);
  r = await fetch(`${BASE}/api/prospects?key=test-key`).then(r => r.json());
  check('record gone', !r.prospects.find(p => p.email === 'aisha@nhs.net'));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
} catch (e) {
  console.error('TEST HARNESS ERROR:', e);
  fail++;
} finally {
  srv.kill();
  process.exit(fail === 0 ? 0 : 1);
}
