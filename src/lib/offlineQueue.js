import { supabase } from './supabase.js'

const QUEUE_KEY = 'tq_offline_queue'

function getQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}

export function enqueueCompletion(payload) {
  const queue = getQueue()
  queue.push({ ...payload, _queued_at: Date.now() })
  saveQueue(queue)
}

export async function flushQueue() {
  const queue = getQueue()
  if (queue.length === 0) return

  const remaining = []
  for (const item of queue) {
    const { _queued_at, ...payload } = item
    try {
      const { error } = await supabase
        .from('user_challenge_completions')
        .insert(payload)
      if (error) remaining.push(item)
    } catch {
      remaining.push(item)
    }
  }
  saveQueue(remaining)
}

export function setupOnlineSync() {
  window.addEventListener('online', flushQueue)
  // Try flushing on startup too
  if (navigator.onLine) flushQueue()
  return () => window.removeEventListener('online', flushQueue)
}
