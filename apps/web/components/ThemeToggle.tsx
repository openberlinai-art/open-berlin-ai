'use client'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '@/providers/ThemeProvider'

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  function cycle() {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
    setTheme(next)
  }

  return (
    <button
      onClick={cycle}
      className="flex items-center justify-center w-8 h-8 border-2 border-[var(--border-primary)] hover:bg-[var(--accent)] hover:text-[var(--accent-text)]"
      title={`Theme: ${theme}`}
    >
      {theme === 'dark' ? <Moon size={14} /> : theme === 'light' ? <Sun size={14} /> : <Monitor size={14} />}
    </button>
  )
}
