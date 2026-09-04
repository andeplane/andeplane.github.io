import { TheProblem } from './essay/TheProblem'
import { Amplitudes101 } from './essay/Amplitudes101'
import { TheMyth } from './essay/TheMyth'
import { TheOracle } from './essay/TheOracle'
import { TheDiffusion } from './essay/TheDiffusion'
import { TwoMirrors } from './essay/TwoMirrors'
import { SyncedViews } from './essay/SyncedViews'
import { WhySqrtN } from './essay/WhySqrtN'
import { TheCircuit } from './essay/TheCircuit'
import { ManyWinners } from './essay/ManyWinners'
import { BreakIt } from './essay/BreakIt'
import { Closing } from './essay/Closing'

export function App() {
  return (
    <main className="essay">
      <header className="masthead">
        <div className="kicker">An interactive essay · quantum search</div>
        <h1>
          Grover's Algorithm
          <br />
          Is Two Mirrors
        </h1>
        <p className="dek">
          Run quantum search live, watch amplitudes reflect and rotate, and see exactly
          where √N comes from — including what goes wrong when you can't stop climbing.
        </p>
        <div className="rule" />
      </header>

      <TheProblem />
      <Amplitudes101 />
      <TheMyth />
      <TheOracle />
      <TheDiffusion />
      <TwoMirrors />
      <SyncedViews />
      <WhySqrtN />
      <TheCircuit />
      <ManyWinners />
      <BreakIt />
      <Closing />

      <footer className="colophon">
        <p>
          Every widget on this page runs the ~200-line simulator shown in §&nbsp;9, live
          in your tab. ·{' '}
          <a href="https://github.com/andeplane/andeplane.github.io/tree/main/demos/grover">
            source
          </a>{' '}
          · <a href="/#/blog">back to the blog</a>
        </p>
      </footer>
    </main>
  )
}
