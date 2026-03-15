'use client'
import { useState, useEffect, useRef } from 'react'
import { Globe } from 'lucide-react'
import { useLanguage, type Lang } from '@/providers/LanguageProvider'

const LANGS: { code: Lang; label: string }[] = [
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'fr', label: 'Français' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'ar', label: 'العربية' },
  { code: 'ru', label: 'Русский' },
  { code: 'pl', label: 'Polski' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'ro', label: 'Română' },
]

export default function LanguageSelector() {
  const { lang, setLang } = useLanguage()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="Language"
        className={[
          'flex items-center gap-1 w-8 h-8 justify-center border-2 border-black hover:bg-black hover:text-white transition-colors',
          open ? 'bg-black text-white' : 'bg-white text-black',
        ].join(' ')}
      >
        <Globe size={13} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 z-[1000] bg-white border-2 border-black shadow-[4px_4px_0_#000] w-40 py-1">
          {LANGS.map(({ code, label }) => (
            <button
              key={code}
              onClick={() => { setLang(code); setOpen(false) }}
              className={[
                'w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-gray-100',
                lang === code ? 'font-bold' : '',
              ].join(' ')}
            >
              <span>{label}</span>
              <span className="text-[10px] text-gray-400 font-mono">{code.toUpperCase()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
