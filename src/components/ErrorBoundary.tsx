"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Recomp error boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4"
          role="alert"
          aria-live="assertive"
        >
          <h2 className="text-xl font-semibold text-[var(--foreground)]">Something went wrong</h2>
          <p className="max-w-md text-center text-[var(--muted)]">
            We hit an unexpected error. Please refresh the page or try again later.
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="btn-primary"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
