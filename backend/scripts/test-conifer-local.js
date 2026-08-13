/**
 * Local Conifer research smoke test against http://127.0.0.1:7878
 */
const BASE = process.env.BASE_URL || 'http://127.0.0.1:7878';
const EMAIL = 'local-conifer@recall.local';
const PASS = 'TestPass123!';

async function req(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

async function main() {
  console.log('== health ==');
  const health = await req('/health');
  console.log(health.status, JSON.stringify(health.data));
  if (health.status !== 200) process.exit(1);

  console.log('== register ==');
  await req('/auth/register', { method: 'POST', body: { email: EMAIL, password: PASS } });

  // Best-effort verify via SQL is docker-only; try login and if email_not_verified, print hint
  console.log('== login ==');
  let login = await req('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASS } });
  console.log(login.status, login.data?.error || 'ok', login.data?.code || '');

  if (!login.data?.access_token && login.data?.code === 'email_not_verified') {
    console.log('Need email verify — attempting DB update via docker...');
    const { execSync } = require('child_process');
    try {
      execSync(
        `docker compose exec -T postgres psql -U recall -d recall -c "UPDATE users SET email_verified=true, email_verified_at=(EXTRACT(EPOCH FROM now())*1000)::bigint WHERE email='${EMAIL}';"`,
        { cwd: require('path').join(__dirname, '..', '..'), stdio: 'inherit' },
      );
    } catch (e) {
      console.error('verify failed', e.message);
    }
    login = await req('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASS } });
  }

  const token = login.data?.access_token;
  if (!token) {
    console.error('No token', login.data);
    process.exit(1);
  }
  console.log('token_ok');

  console.log('== start research Conifer ==');
  const start = await req('/research/startups', {
    method: 'POST',
    token,
    body: {
      trigger_url: 'https://www.conifer.build/',
      trigger_type: 'company_website',
      note: 'Local smoke test of YC research tab pipeline',
      tags: ['local-test', 'conifer'],
      extracted: {
        page_type: 'company_website',
        company_name: 'Conifer',
        website: 'https://www.conifer.build/',
        short_description: 'Routes every query to the cheapest model that can do the job',
        visible_text: 'Conifer · The front door to all inference. Routes every query to the cheapest model that can do the job, starting with the free ones on your own hardware.',
        founders: [],
      },
    },
  });
  console.log(start.status, JSON.stringify(start.data, null, 2).slice(0, 800));
  const jobId = start.data?.research_job_id || start.data?.job_id;
  const companyId = start.data?.company_id;
  if (!jobId) {
    console.error('No job id');
    process.exit(1);
  }

  console.log('== poll job ==', jobId);
  let last = '';
  for (let i = 0; i < 90; i += 1) {
    await new Promise((r) => setTimeout(r, 4000));
    const job = await req(`/research/jobs/${jobId}`, { token });
    const progress = JSON.stringify(job.data?.job?.progress || job.data?.progress || {});
    const status = job.data?.job?.status || job.data?.status;
    const line = `${status} ${progress}`;
    if (line !== last) {
      console.log(`[${i}]`, line);
      last = line;
    }
    if (['completed', 'failed', 'needs_review'].includes(status)) {
      break;
    }
  }

  if (companyId) {
    console.log('== company detail ==');
    const detail = await req(`/research/companies/${companyId}`, { token });
    const c = detail.data?.company || detail.data;
    const a = detail.data?.analysis;
    console.log(JSON.stringify({
      name: c?.name,
      status: c?.status,
      website: c?.website,
      funding_summary: c?.funding_summary,
      founders: (detail.data?.founders || []).map((f) => f.full_name),
      pages: (detail.data?.pages || []).length,
      funding_rounds: (detail.data?.funding || []).length,
      one_line: a?.one_line_understanding,
      opportunity_score: a?.opportunity_score,
      job: detail.data?.jobs?.[0]?.status,
      job_progress: detail.data?.jobs?.[0]?.progress,
      job_error: detail.data?.jobs?.[0]?.error_message,
    }, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
