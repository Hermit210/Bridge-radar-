"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback: ReactNode;
}

interface State {
  hasError: boolean;
}

/** react-globe.gl (three.js/WebGL) throws an uncaught error when a WebGL
 * context can't be created — happens on real visitor devices too (mobile
 * Safari low-power mode, some Android WebViews, disabled hardware
 * acceleration, sandboxed browsers), not just headless test environments.
 * Without this boundary that error has no catch point and takes down the
 * entire page via Next's root error boundary instead of just the globe. */
export class GlobeErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("BridgeGlobe failed to render (likely no WebGL support):", error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
