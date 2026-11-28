"use client";

import { Component, type ReactNode } from "react";

/** Local error boundary: a broken widget shows a small notice instead of taking the whole page down. */
export class Safe extends Component<{ children: ReactNode; label?: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    if (typeof console !== "undefined") console.error("[widget]", this.props.label ?? "", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="grid min-h-[120px] place-items-center rounded-xl border border-dashed p-4 text-center text-[13px] text-muted-foreground">
          <div>
            Не удалось показать {this.props.label ?? "этот блок"}.
            <button className="ml-1 underline underline-offset-2 hover:text-foreground" onClick={() => this.setState({ failed: false })}>
              Повторить
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
