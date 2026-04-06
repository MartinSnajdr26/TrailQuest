class AudioGuide {
  constructor() {
    this.enabled = localStorage.getItem('audioGuideEnabled') !== 'false'
    this.voice = null
    this.queue = []
    this.speaking = false
    this._initVoice()
  }

  _initVoice() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    const setVoice = () => {
      const voices = speechSynthesis.getVoices()
      this.voice =
        voices.find((v) => v.lang === 'cs-CZ') ||
        voices.find((v) => v.lang.startsWith('cs')) ||
        voices.find((v) => v.lang.startsWith('sk')) ||
        voices[0] || null
    }
    setVoice()
    speechSynthesis.onvoiceschanged = setVoice
  }

  speak(text, priority = 'normal') {
    if (!this.enabled || !window.speechSynthesis || !text) return
    if (priority === 'high') this.queue.unshift(text)
    else this.queue.push(text)
    if (!this.speaking) this._processQueue()
  }

  _processQueue() {
    if (this.queue.length === 0) {
      this.speaking = false
      return
    }
    this.speaking = true
    const text = this.queue.shift()
    const utterance = new SpeechSynthesisUtterance(text)
    if (this.voice) utterance.voice = this.voice
    utterance.lang = 'cs-CZ'
    utterance.rate = 0.95
    utterance.pitch = 1.0
    utterance.volume = 1.0
    utterance.onend = () => this._processQueue()
    utterance.onerror = () => this._processQueue()
    speechSynthesis.speak(utterance)
  }

  stop() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      speechSynthesis.cancel()
    }
    this.queue = []
    this.speaking = false
  }

  toggle() {
    this.enabled = !this.enabled
    localStorage.setItem('audioGuideEnabled', String(this.enabled))
    if (!this.enabled) this.stop()
    return this.enabled
  }
}

export const audioGuide = new AudioGuide()
