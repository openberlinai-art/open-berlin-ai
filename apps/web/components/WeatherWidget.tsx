'use client'

import { useState, useEffect } from 'react'
import { useWeather } from '@/hooks/useCulturalData'

const WMO_EMOJI: Record<number, string> = {
  0:  '☀️',
  1:  '🌤', 2: '🌤',
  3:  '☁️',
  45: '🌫', 48: '🌫',
  51: '🌧', 53: '🌧', 55: '🌧',
  61: '🌧', 63: '🌧', 65: '🌧',
  66: '🌧', 67: '🌧',
  71: '❄️', 73: '❄️', 75: '❄️', 77: '❄️',
  80: '🌦', 81: '🌦', 82: '🌦',
  95: '⛈', 96: '⛈', 99: '⛈',
}

function weatherEmoji(code: number): string {
  if (WMO_EMOJI[code]) return WMO_EMOJI[code]
  if (code >= 51 && code <= 67) return '🌧'
  if (code >= 71 && code <= 77) return '❄️'
  if (code >= 80 && code <= 82) return '🌦'
  if (code >= 95) return '⛈'
  return '🌤'
}

function useBerlinClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    function tick() {
      setTime(new Date().toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return time
}

export default function WeatherWidget() {
  const { data } = useWeather()
  const clock = useBerlinClock()
  const current = data?.current as Record<string, number> | undefined

  if (!current) return (
    <span className="text-xs text-gray-400 ml-1.5 font-mono">{clock}</span>
  )

  const temp  = Math.round(current.temperature_2m)
  const emoji = weatherEmoji(current.weather_code)

  return (
    <span className="text-xs text-gray-400 ml-1.5">
      {emoji} {temp}°C <span className="font-mono">{clock}</span>
    </span>
  )
}
