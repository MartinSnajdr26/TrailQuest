const WORDS = {
  1: ['X'], 2: ['OK', 'GO'],
  3: ['LES', 'HOP', 'PUB', 'VUL'],
  4: ['HRAD', 'HORA', 'PIVO', 'VODA', 'BRNO', 'LETO'],
  5: ['STEZA', 'KAMEN', 'HOLUB', 'KEBAB', 'LESIK'],
  6: ['NATURA', 'VIKEND', 'HOLUBI', 'TOURIS'],
  7: ['STEZKOU', 'TURISTU', 'PIVNICE'],
  8: ['TURISTKA', 'KRAJINOU', 'PIVOVARY'],
  9: ['ADVENTURE', 'PROCHAZKA'],
  10: ['TRAILQUEST', 'DOBRODRUZI'],
}

export function generateRebus(count) {
  const c = Math.max(1, Math.min(10, count || 4))
  const opts = WORDS[c]
  if (opts?.length) return opts[Math.floor(Math.random() * opts.length)]
  return 'TRAILQUEST'.slice(0, c).padEnd(c, 'X').slice(0, c)
}

export function getRebusProgress(word, revealed) {
  return word.split('').map((l, i) => i < revealed ? l : '_').join(' ')
}

export function buildRebusFinale(word, story) {
  return {
    type: 'rebus_finale',
    question: 'Složil jsi všechna písmena! Jaké slovo tvoří?',
    letters: word.split(''),
    correct_answer: word,
    celebration: `🎉 Správně! Tajné slovo je "${word}"!`,
    story_title: story?.title_cs,
    story_finale: story?.narrative_template?.finale,
  }
}

// Generic fallback riddles (no API needed)
const GENERIC_RIDDLES = [
  {
    riddle: 'Co je vždy před tebou, ale nikdy ho nevidíš?',
    options: ['A: Stín', 'B: Budoucnost', 'C: Záda', 'D: Vzduch'],
    correct_answer: 'B',
    hint: 'Nesouvisí s fyzickým světem.',
    correct_answer_text: 'Přesně! Budoucnost je vždy před námi.',
    wrong_answer_text: 'Zkus se zamyslet jinak.',
  },
  {
    riddle: 'Čím víc bereš, tím větší to je. Co to je?',
    options: ['A: Jáma', 'B: Hlas', 'C: Stres', 'D: Čas'],
    correct_answer: 'A',
    hint: 'Přemýšlej fyzicky — co roste odebíráním?',
    correct_answer_text: 'Správně! Jáma roste, čím víc ze ní bereš.',
    wrong_answer_text: 'Blízko, ale ne přesně.',
  },
  {
    riddle: 'Má ruce ale nemůže tleskat. Co to je?',
    options: ['A: Socha', 'B: Hodiny', 'C: Strom', 'D: Mapa'],
    correct_answer: 'B',
    hint: 'Každý den se na to díváš.',
    correct_answer_text: 'Výborně! Hodiny mají ručičky ale netleskají.',
    wrong_answer_text: 'Zkus to znovu!',
  },
  {
    riddle: 'Čím víc sušíš, tím víc mokré je. Co to je?',
    options: ['A: Ručník', 'B: Vlasy', 'C: Nádobí', 'D: Bota'],
    correct_answer: 'A',
    hint: 'Používáš to každý den po sprše.',
    correct_answer_text: 'Přesně tak! Ručník se namočí při sušení.',
    wrong_answer_text: 'To není správně.',
  },
  {
    riddle: 'Každý ho má, ale nikomu ho nelze dát. Co to je?',
    options: ['A: Jméno', 'B: Stín', 'C: Věk', 'D: Hlas'],
    correct_answer: 'C',
    hint: 'Roste každý rok a nejde předat.',
    correct_answer_text: 'Správně! Věk je náš a nelze ho přenést.',
    wrong_answer_text: 'Zkus to jinak.',
  },
  {
    riddle: 'Má zuby, ale nekouše. Co to je?',
    options: ['A: Hřeben', 'B: Had', 'C: Pilka', 'D: Klíč'],
    correct_answer: 'A',
    hint: 'Používáš to na vlasy.',
    correct_answer_text: 'Správně! Hřeben má zuby, ale nekouše.',
    wrong_answer_text: 'To není ono.',
  },
  {
    riddle: 'Čím víc ho krmíš, tím víc roste. Ale jakmile ho napojíš, zemře. Co to je?',
    options: ['A: Strom', 'B: Oheň', 'C: Zvíře', 'D: Plíseň'],
    correct_answer: 'B',
    hint: 'Dřevo ho živí, voda ho hasí.',
    correct_answer_text: 'Přesně! Oheň roste dřevem a hasí se vodou.',
    wrong_answer_text: 'Zkus se zamyslet znovu.',
  },
  {
    riddle: 'Spadnu z velké výšky a nic se mi nestane. Ale v kaluži se utopím. Co jsem?',
    options: ['A: Papír', 'B: List', 'C: Píro', 'D: Kamínek'],
    correct_answer: 'A',
    hint: 'Používáš ho každý den na psaní.',
    correct_answer_text: 'Správně! Papír přežije pád, ale rozmočí se ve vodě.',
    wrong_answer_text: 'Blízko, ale špatně.',
  },
]

export function getGenericRiddle(index) {
  return GENERIC_RIDDLES[index % GENERIC_RIDDLES.length]
}

export async function generateStoryRiddle(stopIndex, storyTheme, poiName, letter, anthropicKey) {
  if (!anthropicKey) return null
  const prompt = `Create a short fun riddle in Czech language for a city treasure hunt game.
Theme: "${storyTheme}"
Location: "${poiName}"
The answer should feel connected to the theme.
Keep it playful and solvable without specialist knowledge.

Respond ONLY with valid JSON (no markdown):
{
  "riddle": "short question in Czech (max 2 sentences)",
  "options": ["A: answer1", "B: answer2", "C: answer3", "D: answer4"],
  "correct_answer": "B",
  "hint": "short helpful hint in Czech",
  "correct_answer_text": "Brief fun confirmation text in Czech",
  "wrong_answer_text": "Brief wrong answer text in Czech"
}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await res.json()
    const text = data.content?.[0]?.text?.trim() || ''
    return JSON.parse(text.replace(/```json|```/g, '').trim())
  } catch {
    return null
  }
}
