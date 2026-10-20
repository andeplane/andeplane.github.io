import { Link } from 'react-router-dom'
import '@/features/kiwi/kiwi.css'

export default function Hardware() {
  return <div className="kiwi-page hardware-index">
    <span className="kiwi-eyebrow">FROM PIXELS TO PARTS</span>
    <h1>Hardware</h1>
    <p className="kiwi-lead">Things to print, assemble, and make move. CAD, components, and the experiments needed to turn a design into something real.</p>
    <Link to="/hardware/kiwi" className="hardware-project">
      <img src="/hardware/kiwi/concept.webp" alt="AI-generated concept of Kiwi, a small white three-wheel robot with a stereo camera" />
      <div><span className="kiwi-eyebrow">01 / ROBOTICS · PROTOTYPE DESIGN</span><h2>Kiwi</h2><p>A small robot for the house. Three omni wheels, stereo depth, and a model that chooses what to do next.</p><span className="kiwi-text-link">Explore the project ↗</span></div>
    </Link>
  </div>
}
