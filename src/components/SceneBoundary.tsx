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
          <h3>A visualização 3D não pôde iniciar.</h3>
          <p>
            Ative a aceleração gráfica do navegador. Os experimentos e controles
            continuam disponíveis.
          </p>
          <button
            className="button secondary"
            onClick={() => this.setState({ failed: false })}
          >
            <RotateCcw size={15} />
            Tentar novamente
          </button>
        </div>
      );
    return this.props.children;
  }
}
