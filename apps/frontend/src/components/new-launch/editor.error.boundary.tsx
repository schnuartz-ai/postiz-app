'use client';

import { Component, ReactNode } from 'react';

export class EditorErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div role="alert" className="p-6">
          The editor could not be loaded. Please close this window and open the
          editor again.
        </div>
      );
    }
    return this.props.children;
  }
}
