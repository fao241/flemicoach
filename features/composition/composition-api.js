import { supabase } from '../../supabase.js';

export async function listMatches(teamId) {
  const { data, error } = await supabase.from('events')
    .select('id,title,event_date,start_time,location')
    .eq('team_id', teamId).eq('type','match').eq('cancelled',false)
    .order('event_date',{ascending:false}).limit(40);
  if (error) throw error;
  return data || [];
}

export async function loadCallups(eventId) {
  const { data: callups, error: callupsError } = await supabase.from('match_callups')
    .select('player_id').eq('event_id', eventId);
  if (callupsError) throw callupsError;

  const playerIds = (callups || []).map(row => row.player_id).filter(Boolean);
  if (!playerIds.length) return [];

  const { data: players, error: playersError } = await supabase.from('players')
    .select('id,name').in('id', playerIds);
  if (playersError) throw playersError;

  if ((players || []).length !== playerIds.length) {
    throw new Error('La liste des joueurs convoqués est incomplète.');
  }

  return players.sort((a,b)=>a.name.localeCompare(b.name,'fr'));
}

export async function loadComposition(eventId) {
  const { data, error } = await supabase.from('match_compositions')
    .select('id,event_id,format,formation,published,public_token,match_composition_players(player_id,status,x,y,is_captain,is_goalkeeper)')
    .eq('event_id',eventId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveComposition(state) {
  const { data: comp, error } = await supabase.from('match_compositions').upsert({
    event_id:state.eventId, format:state.format, formation:state.formation,
    published:state.published || false, published_at:state.published ? new Date().toISOString() : null
  },{onConflict:'event_id'}).select('id,public_token,published').single();
  if (error) throw error;
  const { error: delError } = await supabase.from('match_composition_players').delete().eq('composition_id',comp.id);
  if (delError) throw delError;
  const rows=state.players.filter(p=>p.status!=='AVAILABLE').map(p=>({
    composition_id:comp.id,player_id:p.playerId,status:p.status,x:p.x,y:p.y,
    is_captain:!!p.captain,is_goalkeeper:!!p.goalkeeper
  }));
  if(rows.length){const {error:e}=await supabase.from('match_composition_players').insert(rows);if(e)throw e;}
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
