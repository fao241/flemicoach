import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FFF_BASE = 'https://api-dofa.fff.fr';

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function getMembers(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.['hydra:member'])) return payload['hydra:member'];
  if (Array.isArray(payload?.member)) return payload.member;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function pickName(v: any): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  return String(v.name || v.short_name || v.shortName || v.nom || v.cl_name || v.label || v.libelle || '').trim();
}

function pickId(v: any): string {
  if (!v) return '';
  if (typeof v === 'number' || typeof v === 'string') return String(v);
  const raw = v.id ?? v.cl_no ?? v.club_id ?? v.team_id ?? v.numero ?? v.number ?? v['@id'];
  if (raw == null) return '';
  return String(raw).split('/').filter(Boolean).pop() || String(raw);
}

async function fffFetch(path: string) {
  const res = await fetch(`${FFF_BASE}${path}`, {
    headers: {
      'Accept': 'application/json, application/ld+json;q=0.9, */*;q=0.1',
      'User-Agent': 'FlemiCoach/1.0 calendar-sync',
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`FFF ${res.status}: ${text.slice(0, 180)}`);
  try { return JSON.parse(text); }
  catch { throw new Error('La FFF n’a pas renvoyé de JSON exploitable.'); }
}

function simplifyClub(c: any) {
  return {
    id: Number(c.cl_no ?? c.id ?? pickId(c)) || null,
    name: pickName(c) || pickName(c.club),
    city: String(c.commune?.name || c.city || c.ville || c.address?.city || '').trim(),
    district: pickName(c.district || c.cdg || c.club?.district),
    affiliation: String(c.affiliation_number || c.affiliation || c.num_affiliation || '').trim(),
  };
}

function teamKey(team: any, engagement: any, index: number) {
  return [
    team.id ?? team.eq_no ?? team.number ?? team.numero ?? index,
    engagement?.competition?.cp_no ?? engagement?.competition?.id ?? '',
    engagement?.poule?.stage_number ?? engagement?.poule?.number ?? engagement?.poule?.id ?? '',
  ].join(':');
}

function simplifyTeams(payload: any) {
  const teams = getMembers(payload).length ? getMembers(payload) : (Array.isArray(payload) ? payload : Object.values(payload || {}).filter(v => v && typeof v === 'object'));
  const out: any[] = [];
  teams.forEach((team: any, ti: number) => {
    const engagements = Array.isArray(team.engagements) && team.engagements.length ? team.engagements : [null];
    engagements.forEach((engagement: any, ei: number) => {
      const competition = engagement?.competition || {};
      const poule = engagement?.poule || {};
      const category = String(team.category_code || team.category?.code || team.category?.name || '').trim();
      const number = Number(team.number ?? team.numero ?? 1) || 1;
      const compName = pickName(competition);
      const label = [category || pickName(team) || 'Équipe', number > 1 ? `${number}` : '', compName ? `— ${compName}` : ''].filter(Boolean).join(' ');
      out.push({
        key: teamKey(team, engagement, ti * 100 + ei),
        label,
        category,
        number,
        season: team.season || engagement?.season || null,
        competition_id: Number(competition.cp_no ?? competition.id) || null,
        competition_name: compName,
        phase: Number(engagement?.phase?.number ?? engagement?.phase_number ?? poule?.phase_number ?? 1) || 1,
        poule: Number(poule.stage_number ?? poule.number ?? poule.id) || 1,
      });
    });
  });
  return out.filter((x, i, arr) => x.competition_id && arr.findIndex(y => y.key === x.key) === i);
}

function collectObjects(root: any) {
  const seen = new Set<any>();
  const out: any[] = [];
  const walk = (v: any) => {
    if (!v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (!Array.isArray(v)) out.push(v);
    for (const child of Array.isArray(v) ? v : Object.values(v)) walk(child);
  };
  walk(root);
  return out;
}

function firstValue(o: any, keys: string[]) {
  for (const k of keys) if (o?.[k] != null && o[k] !== '') return o[k];
  return null;
}

function dateOnly(v: any): string {
  if (!v) return '';
  const s = String(v);
  const m = s.match(/(20\d{2})[-\/]([01]\d)[-\/]([0-3]\d)/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const fr = s.match(/([0-3]\d)[-\/]([01]\d)[-\/](20\d{2})/);
  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
  return '';
}

function timeOnly(v: any): string {
  if (!v) return '00:00';
  const s = String(v);
  const m = s.match(/([0-2]\d):([0-5]\d)/);
  return m ? `${m[1]}:${m[2]}` : '00:00';
}

function side(o: any, home: boolean) {
  const keys = home
    ? ['home_team','homeTeam','home','equipe1','team1','club1','recevant','local','home_club']
    : ['away_team','awayTeam','away','equipe2','team2','club2','visiteur','visitor','away_club'];
  return firstValue(o, keys);
}

function sideClubId(v: any): string {
  if (!v) return '';
  return pickId(v.club || v.club_entity || v) || pickId(v);
}

function extractMatches(payload: any, clubId: number, clubName: string) {
  const wantedClubId = String(clubId);
  const wantedName = clubName.trim().toLowerCase();
  const candidates = collectObjects(payload);
  const result: any[] = [];

  for (const o of candidates) {
    const homeObj = side(o, true);
    const awayObj = side(o, false);
    const home = pickName(homeObj);
    const away = pickName(awayObj);
    if (!home || !away) continue;

    const date = dateOnly(firstValue(o, ['date','match_date','date_match','event_date','datetime','date_time','scheduled_at','start_at']));
    if (!date) continue;

    const homeId = sideClubId(homeObj);
    const awayId = sideClubId(awayObj);
    const byId = homeId === wantedClubId || awayId === wantedClubId;
    const byName = wantedName && (home.toLowerCase().includes(wantedName) || away.toLowerCase().includes(wantedName));
    if (!byId && !byName) continue;

    const rawId = firstValue(o, ['ma_no','match_id','id','numero','number','@id']);
    const stableId = rawId ? String(rawId).split('/').filter(Boolean).pop()! : `${date}:${home}:${away}`;
    const isHome = homeId === wantedClubId || (!homeId && home.toLowerCase().includes(wantedName));
    const opponent = isHome ? away : home;
    const venueObj = firstValue(o, ['terrain','stadium','venue','ground','installation','lieu','location']);
    const location = pickName(venueObj) || (typeof venueObj === 'string' ? venueObj : '');
    const rawTime = firstValue(o, ['time','hour','heure','kickoff','start_time','datetime','date_time','scheduled_at']);

    result.push({
      source_event_id: stableId,
      title: opponent || `${home} - ${away}`,
      event_date: date,
      start_time: timeOnly(rawTime),
      location,
      payload: o,
    });
  }

  const unique = new Map<string, any>();
  for (const m of result) unique.set(m.source_event_id, m);
  return [...unique.values()].sort((a,b) => `${a.event_date}${a.start_time}`.localeCompare(`${b.event_date}${b.start_time}`));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (!supabaseUrl || !anonKey) return json({ error: 'Supabase config missing' }, 500);

  const db = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: userData } = await db.auth.getUser();
  if (!userData.user) return json({ error: 'Unauthorized' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  try {
    if (body.action === 'search_clubs') {
      const q = String(body.query || '').trim();
      if (q.length < 2) return json({ clubs: [] });
      const payload = await fffFetch(`/api/clubs?filter=${encodeURIComponent(q)}`);
      const clubs = getMembers(payload).map(simplifyClub).filter((c:any) => c.id && c.name).slice(0, 20);
      return json({ clubs });
    }

    if (body.action === 'list_teams') {
      const clubId = Number(body.club_id);
      if (!clubId) return json({ error: 'club_id required' }, 400);
      const payload = await fffFetch(`/api/clubs/${clubId}/equipes.json?filter=`);
      return json({ teams: simplifyTeams(payload) });
    }

    if (body.action === 'sync') {
      const teamId = String(body.team_id || '');
      const clubId = Number(body.club_id);
      const clubName = String(body.club_name || '').trim();
      const selected = body.fff_team || {};
      const competitionId = Number(selected.competition_id);
      const phase = Number(selected.phase || 1);
      const poule = Number(selected.poule || 1);
      if (!teamId || !clubId || !competitionId) return json({ error: 'Données de synchronisation incomplètes.' }, 400);

      const { data: teamRow, error: teamError } = await db.from('teams').select('id').eq('id', teamId).maybeSingle();
      if (teamError || !teamRow) return json({ error: 'Équipe inaccessible.' }, 403);

      const payload = await fffFetch(`/api/compets/${competitionId}/phases/${phase}/poules/${poule}/calendrier`);
      const matches = extractMatches(payload, clubId, clubName);
      if (!matches.length) {
        return json({ error: 'Aucun match de cette équipe n’a pu être identifié dans le calendrier FFF. Aucune donnée n’a été importée.' }, 422);
      }

      let created = 0, updated = 0;
      for (const m of matches) {
        const { data: existing } = await db.from('events')
          .select('id')
          .eq('team_id', teamId)
          .eq('source', 'fff')
          .eq('source_event_id', m.source_event_id)
          .maybeSingle();

        const row = {
          team_id: teamId,
          type: 'match',
          title: m.title,
          event_date: m.event_date,
          start_time: m.start_time,
          location: m.location || '',
          generated: false,
          source: 'fff',
          source_event_id: m.source_event_id,
          source_payload: m.payload,
          created_by: userData.user.id,
        };
        const { error } = await db.from('events').upsert(row, { onConflict: 'team_id,source,source_event_id' });
        if (error) throw error;
        existing ? updated++ : created++;
      }

      const { error: updateTeamError } = await db.from('teams').update({
        fff_club_id: clubId,
        fff_club_name: clubName,
        fff_team_key: String(selected.key || ''),
        fff_team_label: String(selected.label || ''),
        fff_competition_id: competitionId,
        fff_phase: phase,
        fff_poule: poule,
        fff_last_synced_at: new Date().toISOString(),
      }).eq('id', teamId);
      if (updateTeamError) throw updateTeamError;

      return json({ ok: true, created, updated, total: matches.length, synced_at: new Date().toISOString() });
    }

    if (body.action === 'resync') {
      const teamId = String(body.team_id || '');
      const { data: team, error } = await db.from('teams')
        .select('id,fff_club_id,fff_club_name,fff_team_key,fff_team_label,fff_competition_id,fff_phase,fff_poule')
        .eq('id', teamId).maybeSingle();
      if (error || !team?.fff_club_id || !team?.fff_competition_id) return json({ error: 'Aucune synchronisation FFF configurée pour cette équipe.' }, 400);
      body = {
        action: 'sync', team_id: team.id, club_id: team.fff_club_id, club_name: team.fff_club_name,
        fff_team: { key: team.fff_team_key, label: team.fff_team_label, competition_id: team.fff_competition_id, phase: team.fff_phase, poule: team.fff_poule }
      };
      const payload = await fffFetch(`/api/compets/${body.fff_team.competition_id}/phases/${body.fff_team.phase || 1}/poules/${body.fff_team.poule || 1}/calendrier`);
      const matches = extractMatches(payload, Number(body.club_id), String(body.club_name || ''));
      if (!matches.length) return json({ error: 'Aucun match FFF identifiable. Aucune donnée existante n’a été modifiée.' }, 422);
      let created = 0, updated = 0;
      for (const m of matches) {
        const { data: existing } = await db.from('events').select('id').eq('team_id', teamId).eq('source','fff').eq('source_event_id',m.source_event_id).maybeSingle();
        const { error: upsertError } = await db.from('events').upsert({
          team_id: teamId, type:'match', title:m.title, event_date:m.event_date, start_time:m.start_time,
          location:m.location || '', generated:false, source:'fff', source_event_id:m.source_event_id,
          source_payload:m.payload, created_by:userData.user.id,
        }, { onConflict:'team_id,source,source_event_id' });
        if (upsertError) throw upsertError;
        existing ? updated++ : created++;
      }
      await db.from('teams').update({ fff_last_synced_at:new Date().toISOString() }).eq('id', teamId);
      return json({ ok:true, created, updated, total:matches.length, synced_at:new Date().toISOString() });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'Erreur de synchronisation FFF' }, 500);
  }
});
