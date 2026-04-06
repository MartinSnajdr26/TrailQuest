const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY

async function callClaude(prompt, maxTokens = 200) {
  const key = ANTHROPIC_KEY
  if (!key) return null
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.content?.[0]?.text?.trim() ?? null
  } catch {
    return null
  }
}

function parseJsonArray(text) {
  if (!text) return null
  try { return JSON.parse(text.replace(/```json|```/g, '').trim()) } catch { return null }
}

/**
 * AUTO MODE: Claude selects best POIs from available list to form a logical loop.
 */
export async function selectPOIsWithClaude({ startLat, startLng, startName, distanceKm, challengeCount, poiPreferences, availablePOIs, activity }) {
  const poisForClaude = availablePOIs.slice(0, 30).map((p, i) => ({
    i, name: p.name, type: p.poiType ?? p.category, lat: Number(p.lat), lng: Number(p.lng), quality: p.quality ?? 5,
  }))

  const prompt = `You are a hiking route planner for Czech Republic.
Start: "${startName}" (${startLat}, ${startLng}). Target: ${distanceKm}km ${activity}. Stops: ${challengeCount}. Preferred: ${poiPreferences.join(', ')}.
POIs: ${JSON.stringify(poisForClaude)}
Select exactly ${challengeCount} POIs forming a geographic LOOP spread around the start. Return ONLY a JSON array of indexes in visit order, like [3,7,1]. No explanation.`

  const text = await callClaude(prompt, 200)
  const indexes = parseJsonArray(text)

  if (Array.isArray(indexes) && indexes.length > 0) {
    console.log('Claude selected POI indexes:', indexes)
    return indexes.filter((i) => i >= 0 && i < availablePOIs.length).map((i) => availablePOIs[i])
  }

  // Fallback: pick by quality + distance
  console.warn('Claude POI selection failed, using quality fallback')
  return availablePOIs
    .sort((a, b) => (b.quality ?? 5) - (a.quality ?? 5))
    .slice(0, challengeCount)
}

/**
 * MANUAL MODE: Claude optimizes user's POI visit order for shortest path.
 */
export async function optimizePOIOrderWithClaude({ startLat, startLng, selectedPOIs, isLoop }) {
  if (selectedPOIs.length <= 2) return selectedPOIs

  const poisForClaude = selectedPOIs.map((p, i) => ({
    i, name: p.name, lat: Number(p.lat), lng: Number(p.lng),
  }))

  const prompt = `Optimize hiking route order. Start: (${startLat}, ${startLng}). ${isLoop ? 'LOOP route.' : 'One-way.'}
Stops: ${JSON.stringify(poisForClaude)}
Reorder to minimize walking distance. Return ONLY JSON array of original indexes in optimal order. No explanation.`

  const text = await callClaude(prompt, 100)
  const order = parseJsonArray(text)

  if (Array.isArray(order) && order.length === selectedPOIs.length) {
    console.log('Claude optimized order:', order)
    return order.filter((i) => i >= 0 && i < selectedPOIs.length).map((i) => selectedPOIs[i])
  }

  console.warn('Claude order optimization failed, keeping original order')
  return selectedPOIs
}
