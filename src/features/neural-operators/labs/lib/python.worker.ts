// Python executes in an isolated worker so Stop can terminate a long run.
const runtimeUrl = 'https://cdn.jsdelivr.net/pyodide/v314.0.6/full/pyodide.mjs';
type Runtime = {
  loadPackage: (name: string) => Promise<void>;
  runPythonAsync: (code: string) => Promise<unknown>;
  runPython: (code: string) => unknown;
  setStdout: (value: { batched: (text: string) => void }) => void;
  setStderr: (value: { batched: (text: string) => void }) => void;
};
let runtime: Promise<Runtime> | undefined;
let busy = false;
self.onmessage = async (event: MessageEvent<{ code: string }>) => {
  if (busy) return;
  busy = true;
  try {
    if (!runtime) {
      self.postMessage({
        type: 'status',
        text: 'Loading Python and NumPy… The first run downloads the runtime.',
      });
      runtime = (async () => {
        const module = await import(/* @vite-ignore */ runtimeUrl);
        const py = (await module.loadPyodide({
          indexURL: 'https://cdn.jsdelivr.net/pyodide/v314.0.6/full/',
        })) as Runtime;
        await py.loadPackage('numpy');
        return py;
      })();
    }
    const py = await runtime;
    py.setStdout({
      batched: (text) => self.postMessage({ type: 'stdout', text }),
    });
    py.setStderr({
      batched: (text) => self.postMessage({ type: 'stdout', text }),
    });
    self.postMessage({ type: 'status', text: 'Running Python…' });
    py.runPython('plot_data = None');
    await py.runPythonAsync(event.data.code);
    const plot = py.runPython("__import__('json').dumps(plot_data)");
    self.postMessage({ type: 'done', plot });
  } catch (error) {
    runtime = undefined;
    self.postMessage({ type: 'error', text: String(error) });
  } finally {
    busy = false;
  }
};
