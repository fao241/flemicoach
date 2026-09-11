import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getSecretKey() {
  const modern = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (modern) {
    try { return JSON.parse(modern).default as string; } catch { /* fallback */ }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = getSecretKey();
  const resendKey = Deno.env.get('RESEND_API_KEY') || '';
  const cronSecret = Deno.env.get('CRON_SECRET') || '';
  const fromEmail = Deno.env.get('REMINDER_FROM_EMAIL') || 'FlemiCoach <onboarding@resend.dev>';
  const appUrl = Deno.env.get('APP_URL') || '';

  if (!url || !key || !resendKey || !cronSecret) {
    return Response.json({ error: 'Missing required secrets' }, { status: 500, headers: corsHeaders });
  }
  if (req.headers.get('x-cron-secret') !== cronSecret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: events, error } = await db.rpc('get_due_reminder_events');
  if (error) return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });

  let sent = 0;
  for (const event of events || []) {
    const { data: members } = await db.from('team_members').select('user_id').eq('team_id', event.team_id);
    const userIds = [...new Set((members || []).map(m => m.user_id).filter(Boolean))];
    if (!userIds.length) continue;

    const { data: profiles } = await db.from('profiles').select('id,email,full_name').in('id', userIds);
    for (const profile of profiles || []) {
      if (!profile.email) continue;
      const kind = event.reminder_kind;
      const { data: exists } = await db.from('reminder_log').select('id').eq('event_id', event.event_id).eq('recipient', profile.email).eq('reminder_kind', kind).maybeSingle();
      if (exists) continue;

      const parentLink = `${appUrl}?event=${event.public_token}`;
      const date = new Intl.DateTimeFormat('fr-FR', { weekday:'long', day:'2-digit', month:'long' }).format(new Date(`${event.event_date}T12:00:00`));
      const subject = `${event.team_name} — ${event.event_type === 'match' ? 'match' : 'entraînement'} ${date}`;
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111827">
          <h2 style="margin-bottom:8px">FlemiCoach</h2>
          <p><strong>${event.team_name}</strong> — ${event.event_type === 'match' ? event.title : 'Entraînement'}</p>
          <p>${date} à ${String(event.start_time).slice(0,5)}${event.location ? ` · ${event.location}` : ''}</p>
          <p>Il est temps de demander les disponibilités aux parents.</p>
          <p><a href="${parentLink}" style="display:inline-block;background:#111827;color:white;text-decoration:none;padding:12px 16px;border-radius:8px">Ouvrir le lien de présence</a></p>
        </div>`;

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromEmail, to: [profile.email], subject, html })
      });
      if (!response.ok) continue;

      await db.from('reminder_log').insert({ event_id: event.event_id, recipient: profile.email, reminder_kind: kind });
      sent++;
    }
  }

  return Response.json({ ok: true, sent }, { headers: { ...corsHeaders, 'Content-Type':'application/json' } });
});
