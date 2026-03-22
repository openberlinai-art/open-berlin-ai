'use client'
import { useRef, useCallback, useEffect } from 'react'

type SnapState = 'collapsed' | 'half' | 'full'

const SNAP_HEIGHTS: Record<SnapState, string> = {
  collapsed: '80px',
  half:      '40vh',
  full:      '90vh',
}

const SNAP_VALUES: Record<SnapState, number> = {
  collapsed: 80,
  half:      0.4,
  full:      0.9,
}

interface Props {
  children: React.ReactNode
  isOpen: boolean
  onClose: () => void
}

export default function BottomSheet({ children, isOpen, onClose }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{
    startY: number
    startHeight: number
    currentHeight: number
  } | null>(null)

  const getSnapHeight = useCallback((state: SnapState) => {
    const vh = window.innerHeight
    const val = SNAP_VALUES[state]
    return val < 1 ? vh * val : val
  }, [])

  const snapTo = useCallback((state: SnapState) => {
    const el = sheetRef.current
    if (!el) return
    if (state === 'collapsed' && dragState.current) {
      // Check if dragged below collapse threshold — close
    }
    el.style.transition = 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    el.style.height = SNAP_HEIGHTS[state]
    setTimeout(() => {
      if (el) el.style.transition = ''
    }, 300)
  }, [])

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const el = sheetRef.current
    if (!el) return
    dragState.current = {
      startY: e.touches[0].clientY,
      startHeight: el.getBoundingClientRect().height,
      currentHeight: el.getBoundingClientRect().height,
    }
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragState.current || !sheetRef.current) return
    const deltaY = dragState.current.startY - e.touches[0].clientY
    const newHeight = Math.max(0, Math.min(window.innerHeight * 0.95, dragState.current.startHeight + deltaY))
    dragState.current.currentHeight = newHeight
    sheetRef.current.style.height = `${newHeight}px`
  }, [])

  const onTouchEnd = useCallback(() => {
    if (!dragState.current) return
    const height = dragState.current.currentHeight
    const vh = window.innerHeight
    dragState.current = null

    // If dragged below 40px, close
    if (height < 40) {
      onClose()
      return
    }

    // Snap to nearest state
    const snapPoints: [SnapState, number][] = [
      ['collapsed', getSnapHeight('collapsed')],
      ['half', getSnapHeight('half')],
      ['full', getSnapHeight('full')],
    ]

    let nearest: SnapState = 'collapsed'
    let minDist = Infinity
    for (const [state, snapH] of snapPoints) {
      const dist = Math.abs(height - snapH)
      if (dist < minDist) {
        minDist = dist
        nearest = state
      }
    }
    snapTo(nearest)
  }, [onClose, getSnapHeight, snapTo])

  // Close on backdrop click
  const onBackdropClick = useCallback(() => {
    onClose()
  }, [onClose])

  // Set initial height when opening
  useEffect(() => {
    if (isOpen && sheetRef.current) {
      sheetRef.current.style.height = '0px'
      requestAnimationFrame(() => {
        snapTo('half')
      })
    }
  }, [isOpen, snapTo])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/30"
        onClick={onBackdropClick}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="fixed bottom-0 left-0 right-0 z-[61] bg-white border-t-2 border-black overflow-hidden"
        style={{
          willChange: 'height',
          borderRadius: '12px 12px 0 0',
        }}
      >
        {/* Drag handle */}
        <div
          className="flex items-center justify-center py-3 cursor-grab active:cursor-grabbing"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{ touchAction: 'none' }}
        >
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-4 pb-4" style={{ maxHeight: 'calc(100% - 40px)' }}>
          {children}
        </div>
      </div>
    </>
  )
}
