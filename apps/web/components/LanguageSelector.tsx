'use client'
import { useLanguage, type Lang } from '@/providers/LanguageProvider'

const LANGS: { code: Lang; label: string }[] = [
  { code: 'de', label: 'DE' },
  { code: 'en', label: 'EN' },
  { code: 'es', label: 'ES' },
  { code: 'it', label: 'IT' },
  { code: 'fr', label: 'FR' },
  { code: 'zh', label: 'ZH' },
  { code: 'ja', label: 'JA' },
  { code: 'tr', label: 'TR' },
  { code: 'ar', label: 'AR' },
  { code: 'ru', label: 'RU' },
  { code: 'pl', label: 'PL' },
  { code: 'vi', label: 'VI' },
  { code: 'ro', label: 'RO' },
]

export default function LanguageSelector() {
  const { lang, setLang } = useLanguage()
  return (
    <div className="flex items-center gap-px mt-2">
      {LANGS.map(({ code, label }) => (
        <button
          key={code}
          onClick={() => setLang(code)}
          className={[
            'text-[10px] font-bold px-1.5 py-0.5 border transition-colors',
            lang === code
              ? 'bg-black text-white border-black'
              : 'bg-white text-gray-500 border-gray-300 hover:border-black hover:text-black',
          ].join(' ')}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
