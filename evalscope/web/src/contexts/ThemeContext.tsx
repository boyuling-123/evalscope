import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Theme = 'dark' | 'light'

interface ThemeCtx {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeCtx>({
  theme: 'dark',
  toggleTheme: () => {},
})

function resolveInitialTheme(defaultTheme: Theme): Theme {
  const saved = localStorage.getItem('evalscope-theme')
  if (saved === 'light' || saved === 'dark') return saved
  return defaultTheme
}

export function ThemeProvider({
  children,
  defaultTheme = 'dark',
}: {
  children: ReactNode
  defaultTheme?: Theme
}) {
  const [theme, setThemeState] = useState<Theme>(() => resolveInitialTheme(defaultTheme))

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem('evalscope-theme', next)
      return next
    })
  }, [])

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  return useContext(ThemeContext)
}
