import { supabase } from './supabase.js'

export async function selectStory(region) {
  try {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase.from('route_stories').select('*').eq('is_active', true)
      .or(`region.is.null,region.ilike.%${region || ''}%`).lte('active_from', today).gte('active_to', today).limit(5)
    if (data?.length) return data[Math.floor(Math.random() * data.length)]
    const { data: fb } = await supabase.from('route_stories').select('*').eq('is_active', true).limit(3)
    return fb?.[Math.floor(Math.random() * (fb?.length || 1))] ?? null
  } catch { return null }
}

export function getStopNarrative(story, idx) {
  const prompts = story?.narrative_template?.stop_prompts
  return prompts?.length ? prompts[idx % prompts.length] : null
}
