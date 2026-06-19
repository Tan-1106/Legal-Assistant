import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '../i18n';

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-container items-center justify-center p-4">
          <section className="glass-panel p-8 text-center" role="alert">
            <h1 className="text-xl font-bold mb-4">{i18n.t('error.ui_crashed')}</h1>
            <p className="text-muted mb-4">{i18n.t('error.ui_crashed_desc')}</p>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              {i18n.t('error.reload_page')}
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
