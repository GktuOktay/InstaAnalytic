import { createContext, useContext, useState, ReactNode } from 'react'
import { type Lang, t, type Translations } from '../i18n'

interface LangCtx {
  lang: Lang
  setLang: (l: Lang) => void
  T: Translations
}

const LangContext = createContext<LangCtx>({
  lang: 'tr',
  setLang: () => {},
  T: t('tr'),
})

export function LangProvider({ children }: { children: ReactNode }) {
  const stored = (localStorage.getItem('lang') as Lang) || 'tr'
  const [lang, setLangState] = useState<Lang>(stored)

  const setLang = (l: Lang) => {
    localStorage.setItem('lang', l)
    setLangState(l)
  }

  return (
    <LangContext.Provider value={{ lang, setLang, T: t(lang) }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  return useContext(LangContext)
}
