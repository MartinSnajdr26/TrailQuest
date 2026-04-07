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

export async function fetchAllStories() {
  try {
    const { data } = await supabase.from('route_stories')
      .select('*')
      .eq('is_active', true)
      .order('title_cs')
    return data ?? []
  } catch { return [] }
}

export function getLocalizedStory(story, language = 'cs') {
  if (!story) return null
  const lang = ['cs', 'en', 'de'].includes(language) ? language : 'cs'
  // Parse narrative_template if stored as string
  let tmpl = story.narrative_template
  if (typeof tmpl === 'string') { try { tmpl = JSON.parse(tmpl) } catch { tmpl = null } }
  let tmplLang = lang !== 'cs' ? story[`narrative_template_${lang}`] : null
  if (typeof tmplLang === 'string') { try { tmplLang = JSON.parse(tmplLang) } catch { tmplLang = null } }

  return {
    ...story,
    title: story[`title_${lang}`] || story.title_cs,
    description: story[`description_${lang}`] || story.description_cs,
    narrative_template: tmplLang || tmpl,
  }
}

export function getStopNarrative(story, idx, language = 'cs') {
  const localized = getLocalizedStory(story, language)
  const stops = localized?.narrative_template?.stops
  if (stops?.length) return stops[idx % stops.length]?.atmosphere ?? null
  const prompts = localized?.narrative_template?.stop_prompts
  return prompts?.length ? prompts[idx % prompts.length] : null
}
