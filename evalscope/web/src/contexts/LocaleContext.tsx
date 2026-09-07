import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { lookupTranslation, type Locale } from '@/i18n/translations'

/**
 * The translate function's contract.
 *
 * Exported so a presentational component that is handed `t` as a prop can type it
 * without re-declaring the signature, which is how two copies of it drifted apart.
 */
export type Translate = (path: string, vars?: Record<string, string | number>) => string

interface LocaleCtx {
  locale: Locale
  setLocale: (l: Locale) => void
  t: Translate
}

const LocaleContext = createContext<LocaleCtx>({
  locale: 'en',
  setLocale: () => {},
  t: (p) => p,
})

export function LocaleProvider({
  children,
  defaultLocale = 'en',
}: {
  children: ReactNode
  defaultLocale?: Locale
}) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem('evalscope-locale')
    return saved === 'en' || saved === 'zh' ? saved : defaultLocale
  })

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  }, [locale])

  const setLocale = useCallback((l: Locale) => {
    localStorage.setItem('evalscope-locale', l)
    setLocaleState(l)
  }, [])

  const t = useCallback(
    (path: string, vars?: Record<string, string | number>) => {
      const text = lookupTranslation(locale, path)
      if (!vars) return text
      // Substitute ${name} placeholders with the provided values, leaving
      // unknown placeholders untouched.
      return text.replace(/\$\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match))
    },
    [locale],
  )

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLocale() {
  return useContext(LocaleContext)
}
