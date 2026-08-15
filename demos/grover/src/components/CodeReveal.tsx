import statevectorSource from '../sim/statevector.ts?raw'
import groverSource from '../sim/grover.ts?raw'

/**
 * The essay's receipts: the entire simulator, verbatim from the files this
 * page is actually running. Nothing up the sleeve.
 */
export function CodeReveal() {
  return (
    <>
      <details className="code-reveal">
        <summary>statevector.ts — the whole simulator ({statevectorSource.split('\n').length} lines)</summary>
        <pre>{statevectorSource}</pre>
      </details>
      <details className="code-reveal">
        <summary>grover.ts — the two mirrors ({groverSource.split('\n').length} lines)</summary>
        <pre>{groverSource}</pre>
      </details>
    </>
  )
}
