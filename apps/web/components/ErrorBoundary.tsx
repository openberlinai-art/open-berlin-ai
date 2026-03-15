'use client'
import React from 'react'

interface State { hasError: boolean; error?: Error }

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex items-center justify-center p-8 text-center">
          <div>
            <p className="font-bold text-sm mb-1">Something went wrong</p>
            <p className="text-xs text-gray-500 mb-3">{this.state.error?.message}</p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="text-xs border-2 border-black px-3 py-1 hover:bg-black hover:text-white font-bold"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
