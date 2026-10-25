import React, { Component, type ReactNode } from "react";

/** A missing optional animation chunk must not take down the saved sheet. */
export class PresentationBoundary extends Component<{ children: ReactNode; total: number; onClose(): void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <article className="panel" role="status"><p>Animation unavailable. Saved roll: {this.props.total}</p><button type="button" onClick={this.props.onClose}>Close result</button></article> : this.props.children;
  }
}
