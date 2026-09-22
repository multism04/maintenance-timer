import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled error in app', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <h1>問題が発生しました</h1>
          <p>アプリの表示中にエラーが発生しました。再読み込みしてください。</p>
          <button type="button" className="primary-button" onClick={() => window.location.reload()}>
            再読み込み
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
