/**
 * Check if a count-type answer is within tolerance.
 */
export function checkCountAnswer(userAnswer, correctAnswer, tolerance = 1) {
  const user = parseInt(userAnswer, 10)
  const correct = parseInt(correctAnswer, 10)
  if (isNaN(user) || isNaN(correct)) return false
  return Math.abs(user - correct) <= tolerance
}

/**
 * Map DB question_type → ChallengeCard display type.
 */
export function mapQuestionType(dbType) {
  switch (dbType) {
    case 'quiz': return 'quiz'
    case 'count': return 'count'
    case 'observe': return 'observation'
    case 'photo': return 'photo'
    case 'checkin': return 'checkin'
    case 'find': return 'find'
    default: return dbType ?? 'observation'
  }
}
