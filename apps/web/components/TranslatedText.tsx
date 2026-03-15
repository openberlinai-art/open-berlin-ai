'use client'
import { useLanguage } from '@/providers/LanguageProvider'
import { useTranslation } from '@/hooks/useTranslation'
import { cn } from '@/lib/utils'

interface Props {
  text:      string
  className?: string
}

export default function TranslatedText({ text, className }: Props) {
  const { lang } = useLanguage()
  const { data: translated, isPending } = useTranslation(text, lang)
  const display = (lang !== 'de' && translated) ? translated : text
  return (
    <span className={cn(className, lang !== 'de' && isPending && 'animate-pulse text-gray-400')}>
      {display}
    </span>
  )
}
