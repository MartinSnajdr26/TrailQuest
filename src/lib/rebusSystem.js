const WORDS = { 3: ['LES', 'HOP', 'PUB'], 4: ['HRAD', 'HORA', 'PIVO'], 5: ['STEZA', 'KAMEN', 'CESKO'], 6: ['NATURA', 'PIVOOO'], 7: ['STEZKOU', 'TURISTU'], 8: ['TURISTKA', 'KRAJINOU'], 9: ['ADVENTURE'], 10: ['TRAILQUEST'] }

export function generateRebus(count) {
  const opts = WORDS[count]
  if (opts?.length) return opts[Math.floor(Math.random() * opts.length)]
  return 'TRAILQUEST'.slice(0, Math.min(count, 10)).padEnd(count, 'X').slice(0, count)
}

export function getRebusProgress(word, revealed) {
  return word.split('').map((l, i) => i < revealed ? l : '_').join(' ')
}

export function buildRebusFinale(word) {
  return { type: 'rebus_finale', question: 'Složil jsi všechna písmena! Jaké slovo tvoří?', letters: word.split(''), correct_answer: word, celebration: `🎉 Správně! Tajné slovo je "${word}"!` }
}
