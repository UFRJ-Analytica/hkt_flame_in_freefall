import { runEnsemble, type EngineInput } from "./engine";

self.onmessage = (event: MessageEvent<{ id: number; input: EngineInput; seeds: number[] }>) => {
  const { id, input, seeds } = event.data;
  const result = runEnsemble(input, seeds);
  const transfer = [...result.arrivals, ...result.contacts].map((array) => array.buffer);
  (self as unknown as Worker).postMessage({ id, result }, transfer);
};
