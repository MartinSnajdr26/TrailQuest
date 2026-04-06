import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import cs from './cs.js'
import en from './en.js'
import de from './de.js'

const savedLang = typeof localStorage !== 'undefined'
  ? localStorage.getItem('tq_lang')
  : null

i18n.use(initReactI18next).init({
  resources: { cs, en, de },
  lng: savedLang || 'cs',
  fallbackLng: 'cs',
  interpolation: { escapeValue: false },
})

export default i18n
