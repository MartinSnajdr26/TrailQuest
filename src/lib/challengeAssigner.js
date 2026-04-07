import { supabase } from './supabase.js'

const CHECKIN = {
  minipivovar: (n) => ({ task: `Zastav se v ${n}! 🍺 Dej si místní pivo.`, alternative: 'Vyfotit vývěsní štít', fun_fact: 'Každý minipivovar vaří pivo podle vlastního receptu.' }),
  hospoda: (n) => ({ task: `Zastav se v ${n}! Dej si něco k pití. 🥘`, alternative: 'Vyfotit jídelní lístek' }),
  horska_chata: (n) => ({ task: `Dojdi do ${n} a razítkuj turistický pas! 🏠`, alternative: 'Vyfotit ceduli s názvem chaty' }),
  vinna_sklep: (n) => ({ task: `Zastav se v ${n} a ochutnej víno! 🍷`, alternative: 'Vyfotit lahve' }),
}
const PHOTO = [(n) => ({ task: `Vyfoť výhled z ${n} 📸`, alternative: `Popiš co vidíš z ${n}` }), (n) => ({ task: `Selfie s ${n} v pozadí! 🤳`, alternative: `Popiš ${n}` })]
const OBS = [(n) => ({ task: `U ${n} najdi informační tabuli — co je na ní?`, answer_type: 'text' }), (n) => ({ task: `Kolik oken má průčelí ${n}?`, answer_type: 'number' }), (n) => ({ task: `Jakou barvu mají dveře ${n}?`, answer_type: 'text' })]
const FIND = [(n) => ({ task: `U ${n} najdi směrovník — jaké místo ukazuje?` }), (n) => ({ task: `Najdi u ${n} informační ceduli o historii` })]

async function getQuizFromDB(poi) {
  try {
    const { data } = await supabase.from('poi_questions').select('*').eq('is_approved', true).ilike('poi_name', `%${poi.name}%`).eq('question_type', 'quiz').limit(3)
    if (data?.length) { const q = data[Math.floor(Math.random() * data.length)]; return { question: q.question, options: q.options, correct_answer: q.correct_answer, fun_fact: q.fun_fact } }
    const { data: near } = await supabase.from('poi_questions').select('*').eq('is_approved', true).gte('gps_lat', (poi.gps_lat ?? poi.lat) - 0.01).lte('gps_lat', (poi.gps_lat ?? poi.lat) + 0.01).gte('gps_lng', (poi.gps_lng ?? poi.lng) - 0.01).lte('gps_lng', (poi.gps_lng ?? poi.lng) + 0.01).limit(5)
    if (near?.length) { const q = near[Math.floor(Math.random() * near.length)]; return { question: q.question, options: q.options, correct_answer: q.correct_answer, fun_fact: q.fun_fact } }
  } catch {} return null
}

async function generateQuizClaude(poi, region, key) {
  if (!key) return null
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 300, messages: [{ role: 'user', content: `Vytvoř 1 kvízovou otázku o "${poi.name}" (${poi.poi_category}, ${region}). POUZE JSON: {"question":"...","options":["A","B","C","D"],"correct_answer":"A","fun_fact":"..."}` }] }) })
    const d = await res.json(); return JSON.parse((d.content?.[0]?.text ?? '').replace(/```json|```/g, '').trim())
  } catch { return null }
}

function genericQuiz(poi) {
  return { question: `Jaký typ místa je ${poi.name}?`, options: [poi.poi_category || 'Turistický cíl', 'Restaurace', 'Hotel', 'Muzeum'], correct_answer: poi.poi_category || 'Turistický cíl', fun_fact: poi.description || `${poi.name} stojí za návštěvu!` }
}

export async function assignChallenge({ poi, stopIndex, experienceType, rebusWord, storyNarrative, region, anthropicKey }) {
  const cat = poi.poi_category ?? 'other'
  let type, content

  // Determine type
  const isFood = ['minipivovar', 'hospoda', 'vinna_sklep', 'horska_chata', 'koliba'].includes(cat)
  const isCulture = ['hrad', 'zamek', 'kostel', 'kaple', 'pamatnik', 'muzeum'].includes(cat)
  const isView = ['rozhledna', 'vyhlidka', 'vrchol'].includes(cat)

  if (experienceType === 'quiz') type = 'quiz'
  else if (experienceType === 'tasks') { type = isFood ? 'checkin' : isView ? 'photo' : ['photo', 'observation', 'find'][stopIndex % 3] }
  else if (experienceType === 'rebus') type = 'quiz'
  else { type = isFood ? 'checkin' : isCulture ? 'quiz' : isView ? 'photo' : ['quiz', 'photo', 'observation', 'find'][stopIndex % 4] }

  // Build content
  if (type === 'checkin') {
    const tmpl = CHECKIN[cat]; content = tmpl ? tmpl(poi.name) : { task: `Zastav se v ${poi.name}! ✅`, alternative: 'Vyfotit místo' }
    content = { ...content, place_name: poi.name, question_type: 'checkin' }
  } else if (type === 'photo') {
    content = { ...PHOTO[stopIndex % PHOTO.length](poi.name), place_name: poi.name, question_type: 'photo' }
  } else if (type === 'observation') {
    content = { ...OBS[stopIndex % OBS.length](poi.name), place_name: poi.name, question_type: 'observation' }
  } else if (type === 'find') {
    content = { ...FIND[stopIndex % FIND.length](poi.name), place_name: poi.name, question_type: 'find' }
  } else {
    // quiz — DB first, Claude second, generic fallback
    let quiz = await getQuizFromDB(poi)
    if (!quiz) quiz = await generateQuizClaude(poi, region, anthropicKey)
    if (!quiz) quiz = genericQuiz(poi)
    content = { ...quiz, place_name: poi.name, question_type: 'quiz' }
  }

  // Rebus overlay
  if (rebusWord && stopIndex < rebusWord.length) {
    const letter = rebusWord[stopIndex]
    content.rebus_letter = letter; content.rebus_index = stopIndex + 1; content.rebus_total = rebusWord.length
    content.rebus_hint = `Písmeno č. ${stopIndex + 1}/${rebusWord.length}: "${letter}"`
  }
  if (storyNarrative) content.story_intro = storyNarrative
  if (poi.is_partner) { content.is_partner = true; content.partner_discount = poi.partner_discount }
  if (poi.source === 'custom_db' && poi.id) content.custom_poi_id = poi.id

  return { type, content_json: content }
}
