import { useQuery } from '@tanstack/react-query'

async function fetchTranslation(text: string, targetLang: string): Promise<string> {
  const res = await fetch('/api/translate', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ text, targetLang }),
  })
  if (!res.ok) return text
  const data = await res.json() as { translated?: string }
  return data.translated ?? text
}

export function useTranslation(text: string | null | undefined, targetLang: string) {
  return useQuery({
    queryKey:  ['translate', targetLang, text],
    queryFn:   () => fetchTranslation(text!, targetLang),
    enabled:   !!text && targetLang !== 'de',
    staleTime: Infinity,
  })
}
