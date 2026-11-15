import { Component, type ReactNode } from "react";
import { Box, RotateCcw } from "lucide-react";
export class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="scene-fallback">
          <Box size={42} />
          <h3>The 3D view could not start.</h3>
          <p>
            Enable browser graphics acceleration. Experiments and controls
            remain available.
          </p>
          <button
            className="button secondary"
            onClick={() => this.setState({ failed: false })}
          >
            <RotateCcw size={15} />
            Try again
          </button>
        </div>
      );
    return this.props.children;
  }
}
