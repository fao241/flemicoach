import { supabase } from '../../supabase.js';

const sortByName = rows => [...(rows || [])].sort((a,b)=>(a.name || '').localeCompare(b.name || '','fr'));

export async function listMatches(teamId) {
  if (!teamId) return [];
  const { data, error } = await supabase.from('events')
    .select('id,title,event_date,start_time,location')
    .eq('team_id',teamId)
    .eq('type','match')
    .eq('cancelled',false)
    .order('event_date',{ascending:false})
    .limit(40);
  if (error) throw error;
  return data || [];
}

export async function loadCallups(eventId) {
  if (!eventId) throw new Error('Match invalide.');

  const { data: callups, error: callupError } = await supabase.from('match_callups')
    .select('player_id')
    .eq('event_id',eventId);
  if (callupError) throw callupError;

  const ids=[...new Set((callups || []).map(row=>row.player_id).filter(Boolean))];
  if (!ids.length) return [];

  const { data: players, error: playerError } = await supabase.from('players')
    .select('id,name')
    .in('id',ids);
  if (playerError) throw playerError;

  const byId=new Map((players || []).map(player=>[player.id,player]));
  const missing=ids.filter(id=>!byId.has(id));
  if(missing.length) throw new Error(`Impossible de charger ${missing.length} joueur(s) convoqué(s).`);

  return sortByName(ids.map(id=>byId.get(id)));
}

export async function loadComposition(eventId) {
  const { data, error } = await supabase.from('match_compositions')
    .select('id,event_id,format,formation,published,public_token,match_composition_players(player_id,status,x,y,is_captain,is_goalkeeper)')
    .eq('event_id',eventId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveComposition(state) {
  const { data: comp, error } = await supabase.from('match_compositions').upsert({
    event_id:state.eventId,
    format:state.format,
    formation:state.formation,
    published:state.published || false,
    published_at:state.published ? new Date().toISOString() : null
  },{onConflict:'event_id'}).select('id,public_token,published').single();
  if (error) throw error;

  const uniquePlayers=new Map();
  state.players.filter(p=>p.status!=='AVAILABLE').forEach(p=>uniquePlayers.set(p.playerId,p));
  const rows=[...uniquePlayers.values()].map(p=>({
    composition_id:comp.id,
    player_id:p.playerId,
    status:p.status,
    x:p.x,
    y:p.y,
    is_captain:!!p.captain,
    is_goalkeeper:!!p.goalkeeper
  }));

  const { error: deleteError } = await supabase.from('match_composition_players')
    .delete().eq('composition_id',comp.id);
  if (deleteError) throw deleteError;

  if(rows.length){
    const { error: insertError } = await supabase.from('match_composition_players').insert(rows);
    if(insertError) throw insertError;
  }
  return comp;
}

export async function publishComposition(state) {
  const comp=await saveComposition({...state,published:true});
  return comp.public_token;
}

export async function loadPublicComposition(token) {
  const { data, error } = await supabase.rpc('get_public_match_composition',{p_token:token});
  if(error) throw error;
  return data;
}
