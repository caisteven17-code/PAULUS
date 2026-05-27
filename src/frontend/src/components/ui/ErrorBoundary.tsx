import React, { ReactNode, ReactElement } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactElement;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component to catch React component errors
 * Displays a user-friendly error message instead of white screen
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
              <div className="flex items-center gap-4 mb-4">
                <AlertCircle className="w-8 h-8 text-red-600 flex-shrink-0" />
                <h1 className="text-xl font-bold text-gray-900">Something went wrong</h1>
              </div>
              <p className="text-gray-600 text-sm mb-6">
                We encountered an unexpected error. Please try refreshing the page.
              </p>
              <details className="text-xs text-gray-500 bg-gray-100 p-3 rounded mb-6 max-h-40 overflow-y-auto">
                <summary className="cursor-pointer font-semibold text-gray-700 mb-2">
                  Error Details
                </summary>
                <pre className="whitespace-pre-wrap break-words">{this.state.error?.message}</pre>
              </details>
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition-colors font-medium"
              >
                Refresh Page
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
