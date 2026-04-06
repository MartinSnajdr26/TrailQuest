const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY

export async function generateQuiz(placeName, placeType, region) {
  if (!ANTHROPIC_KEY) return fallbackQuiz(placeName)

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [
          {
            role: 'user',
            content: `Vytvoř zábavnou kvízovou otázku o místě "${placeName}" (${placeType}) v oblasti ${region} v České republice.
Odpověz POUZE validním JSON objektem bez markdown:
{"question":"...","options":["A","B","C","D"],"correct_answer":"A","fun_fact":"..."}`,
          },
        ],
      }),
    })

    if (!res.ok) return fallbackQuiz(placeName)

    const data = await res.json()
    const text = data.content?.[0]?.text?.trim()
    if (!text) return fallbackQuiz(placeName)

    const quiz = JSON.parse(text)
    return {
      task: quiz.question,
      options: quiz.options,
      correct_answer: quiz.correct_answer,
      fun_fact: quiz.fun_fact ?? '',
      place_name: placeName,
    }
  } catch {
    return fallbackQuiz(placeName)
  }
}

function fallbackQuiz(placeName) {
  return {
    task: `Co víš o ${placeName}?`,
    options: [
      'Je to historická památka',
      'Pochází z 18. století',
      'Je to přírodní útvar',
      'Není to v Čechách',
    ],
    correct_answer: 'Je to historická památka',
    fun_fact: '',
    place_name: placeName,
  }
}
