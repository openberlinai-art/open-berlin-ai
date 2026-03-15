'use client'
import { createContext, useContext, useState, useEffect } from 'react'

export type Lang = 'de' | 'en' | 'tr' | 'ar' | 'ru' | 'pl' | 'vi' | 'ro' | 'es' | 'it' | 'fr' | 'zh' | 'ja'

interface LanguageCtx {
  lang:    Lang
  setLang: (l: Lang) => void
}

const LanguageContext = createContext<LanguageCtx>({ lang: 'de', setLang: () => {} })

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('de')

  useEffect(() => {
    const stored = localStorage.getItem('kp-lang') as Lang | null
    if (stored && stored !== 'de') setLangState(stored)
  }, [])

  function setLang(l: Lang) {
    setLangState(l)
    localStorage.setItem('kp-lang', l)
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
