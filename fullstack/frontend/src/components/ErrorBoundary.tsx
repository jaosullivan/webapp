import { Component, ErrorInfo } from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught error:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Error</p>
        <h2 className="text-xl font-semibold text-foreground">Something went wrong</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          {this.state.error?.message ?? "An unexpected error occurred."}
        </p>
        <button
          onClick={() => this.setState({ hasError: false, error: null })}
          className="mt-2 px-4 py-2 text-sm rounded-md border border-[var(--border)] text-foreground hover:bg-accent transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }
}
