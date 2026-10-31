import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('SZMC Alumni UI Error caught by ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-800/90 backdrop-blur-xl border border-slate-700/80 rounded-3xl p-6 sm:p-8 text-center shadow-2xl space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mx-auto flex items-center justify-center">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Display Issue Detected</h2>
              <p className="text-sm text-slate-300 mt-2">
                A temporary display conflict was recovered. Click below to refresh your feed.
              </p>
              {this.state.error?.message && (
                <div className="mt-3 p-2.5 bg-slate-950/60 rounded-xl text-left border border-slate-700/60 text-xs font-mono text-rose-300 max-h-24 overflow-y-auto">
                  {this.state.error.message}
                </div>
              )}
            </div>
            <div className="pt-2 space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  try {
                    sessionStorage.removeItem('szmc_cached_posts');
                    localStorage.removeItem('szmc_cached_posts');
                    localStorage.removeItem('szmc_offline_posts');
                  } catch {}
                  this.setState({ hasError: false, error: null });
                  window.location.hash = '#feed';
                  window.location.reload();
                }}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Refresh Alumni Feed</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
