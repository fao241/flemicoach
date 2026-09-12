import { createClient } from 'npm:@supabase/supabase-js@2';

const BASE = 'https://api-dofa.fff.fr';
const headers = { 'Accept':'application/json', 'User-Agent':'FlemiCoach/1.0 club-index' };

function norm(s: unknown) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error:'Method not allowed' }, { status:405 });

  let body: any = {};
  try { body = await req.json(); } catch {}

  const start = Math.max(1, Number(body.start_page || 1));
  const end = Math.max(start, Math.min(start + 99, Number(body.end_page || start + 49)));
  const url = Deno.env.get('SUPABASE_URL') || '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !service) return Response.json({ error:'Supabase config missing' }, { status:500 });

  const db = createClient(url, service, { auth:{ persistSession:false } });
  let total = 0;
  let emptyPages = 0;
  const errors: any[] = [];
  const pages = Array.from({ length:end-start+1 }, (_, i) => start + i);

  for (let i=0; i<pages.length; i+=8) {
    const chunk = pages.slice(i, i+8);
    const results = await Promise.all(chunk.map(async page => {
      try {
        const r = await fetch(`${BASE}/api/clubs.json?filter=x&page=${page}`, { headers });
        if (!r.ok) return { page, error:`FFF ${r.status}`, rows:[] };
        const data = await r.json();
        const arr = Array.isArray(data) ? data : [];
        const rows = arr.map((c:any) => ({
          cl_no:Number(c.cl_no),
          affiliation_number:c.affiliation_number == null ? null : Number(c.affiliation_number),
          name:String(c.name || c.short_name || '').trim(),
          short_name:String(c.short_name || '').trim() || null,
          location:String(c.location || c.distributor_office || '').trim() || null,
          postal_code:String(c.postal_code || '').trim() || null,
          department_code:c.department_code == null ? null : Number(c.department_code),
          district_name:String(c.district?.name || '').trim() || null,
          district_short_name:String(c.district?.short_name || '').trim() || null,
          logo:String(c.logo || '').trim() || null,
          raw:null,
          search_text:norm([c.name,c.short_name,c.location,c.postal_code,c.district?.name,c.affiliation_number].filter(Boolean).join(' ')),
          synced_at:new Date().toISOString(),
        })).filter((x:any) => x.cl_no && x.name);
        return { page, rows };
      } catch (e) {
        return { page, error:e instanceof Error ? e.message : String(e), rows:[] };
      }
    }));

    for (const result of results) {
      if (result.error) { errors.push({ page:result.page, error:result.error }); continue; }
      if (!result.rows.length) { emptyPages++; continue; }
      const { error } = await db.from('fff_clubs').upsert(result.rows, { onConflict:'cl_no' });
      if (error) errors.push({ page:result.page, error:error.message });
      else total += result.rows.length;
    }
  }

  return Response.json({ ok:errors.length===0, start, end, total, emptyPages, errors:errors.slice(0,20) });
});
