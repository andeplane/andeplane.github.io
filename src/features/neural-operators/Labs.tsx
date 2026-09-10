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
  { id: 'paper', label: 'Read the paper' },
  { id: 'fourier-heat', label: 'Fourier heat case study' },
  { id: 'fourier-layer', label: 'Fourier layer example' },
];
export default function Labs() {
  const [params, setParams] = useSearchParams();
  const found = lessons.findIndex(lesson => lesson.id === params.get('lesson'));
  const chapter = found < 0 ? 0 : found;
  const setChapter = (index: number) => setParams({ lesson: lessons[index].id });
  return <div className="no-reading-layout no-lab-layout">
    <nav className="no-side-nav" aria-label="Learning lab lessons">
      <p className="no-eyebrow">Interactive lessons</p>
      {lessons.map((lesson, index) => <button key={lesson.id} aria-current={chapter === index ? 'page' : undefined} onClick={() => setChapter(index)}>
        <span>{String(index + 1).padStart(2, '0')}</span>{lesson.label}
      </button>)}
    </nav>
    <div className="no-labs"><Course chapter={chapter} setChapter={setChapter} /></div>
  </div>;
}
