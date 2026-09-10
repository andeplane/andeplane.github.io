import { useSearchParams } from 'react-router-dom';
import Course from './labs/app/page';
import './labs/labs.css';
import 'katex/dist/katex.min.css';
const lessons = [
  { id: 'fields', label: 'Fields & samples' },
  { id: 'grids', label: 'Why grids matter' },
  { id: 'integral', label: 'Build an integral' },
  { id: 'thermal', label: 'Thermal · learn the kernel' },
  { id: 'architectures', label: 'Real architectures' },
  { id: 'evaluation', label: 'Evaluate a model' },
  { id: 'fourier-heat', label: 'Fourier heat case study' },
  { id: 'fourier-layer', label: 'Fourier layer example' },
];
const steps = ['Overview', 'Field → pixels', 'Pixels → waves', 'Learn the change', 'Predict finer', 'Theory & code'];
const stepIds = ['overview', 'pixels', 'waves', 'training', 'prediction', 'theory'];
export default function Labs() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('lesson') === 'paper' ? 'evaluation' : params.get('lesson');
  const found = lessons.findIndex(lesson => lesson.id === requested);
  const chapter = found < 0 ? 0 : found;
  const stepIndex = Math.max(0, stepIds.indexOf(params.get('step') ?? 'overview'));
  const go = (index: number, step = 0) => {
    setParams(index === 6 ? { lesson: lessons[index].id, step: stepIds[step] } : { lesson: lessons[index].id });
    document.getElementById('lab-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const previous = chapter === 6 && stepIndex > 0
    ? { label: steps[stepIndex - 1], go: () => go(6, stepIndex - 1) }
    : chapter > 0 ? { label: lessons[chapter - 1].label, go: () => go(chapter - 1, chapter === 7 ? 5 : 0) } : null;
  const next = chapter === 6 && stepIndex < steps.length - 1
    ? { label: steps[stepIndex + 1], go: () => go(6, stepIndex + 1) }
    : chapter < lessons.length - 1 ? { label: lessons[chapter + 1].label, go: () => go(chapter + 1) } : null;
  return <div className="no-reading-layout no-lab-layout">
    <label className="no-mobile-lessons">Learning labs
      <select aria-label="Choose a lesson or Fourier step" value={chapter === 6 ? `6:${stepIndex}` : String(chapter)} onChange={event => { const [index, step] = event.target.value.split(':').map(Number); go(index, step || 0); }}>
        <optgroup label="Foundations">{lessons.slice(0, 6).map((lesson, index) => <option key={lesson.id} value={index}>{index + 1}. {lesson.label}</option>)}</optgroup>
        <optgroup label="Fourier heat case study">{steps.map((label, index) => <option key={label} value={`6:${index}`}>{label}</option>)}</optgroup>
        <optgroup label="Fourier layer"><option value="7">Fourier layer example</option></optgroup>
      </select>
    </label>
    <nav className="no-side-nav" aria-label="Learning lab lessons">
      {lessons.map((lesson, index) => <div key={lesson.id}>
        {(index === 0 || index === 6) && <p className="no-eyebrow no-lesson-group">{index === 0 ? 'Foundations · 6 lessons' : 'Fourier experiments'}</p>}
        <button className="no-lesson-link" aria-current={chapter === index ? 'page' : undefined} onClick={() => go(index)}>
          {index < 6 && <span>{String(index + 1).padStart(2, '0')}</span>}{lesson.label}
        </button>
        {chapter === 6 && index === 6 && <div className="no-lesson-steps" aria-label="Fourier heat steps">
          {steps.map((label, i) => <button key={label} aria-current={stepIndex === i ? 'step' : undefined} onClick={() => go(6, i)}>{label}</button>)}
        </div>}
      </div>)}
    </nav>
    <div className="no-labs" id="lab-content">
      <Course chapter={chapter} step={stepIndex - 1} setStep={step => go(6, step + 1)} />
      <nav className="no-lesson-pager" aria-label="Lesson progression">
        {previous ? <button onClick={previous.go}><small>← Previous</small>{previous.label}</button> : <span />}
        {next ? <button onClick={next.go}><small>{chapter === 6 && stepIndex < 5 ? 'Next step' : 'Next lesson'} →</small>{next.label}</button> : <a href="#/interests/neural-operators/graph"><small>Explore the research →</small>Literature graph</a>}
      </nav>
    </div>
  </div>;
}
