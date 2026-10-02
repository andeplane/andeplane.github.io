import { Link } from 'react-router-dom'
import { useProjects } from '@/hooks/useProjects'
import './games.css'

const order = ['broadside', 'fuse-riders', 'verdant', 'particle-defence', 'flow-defence', 'lunarlander', 'sunken', 'three-lefts', 'curling-simulator', 'interval-trainer']
export default function Games() {
  const projects = useProjects().filter(p => (p.tags.includes('Game') || order.includes(p.slug)) && p.liveUrl)
    .sort((a, b) => (order.indexOf(a.slug) < 0 ? 99 : order.indexOf(a.slug)) - (order.indexOf(b.slug) < 0 ? 99 : order.indexOf(b.slug)))
  return <div className="games-page">
    <div className="games-intro"><span className="games-kicker">THE PLAY ROOM</span><h1>Games</h1><p>Little adventures, friendly competition, and worlds to get lost in. Pick a game and play right in your browser.</p></div>
    <div className="games-grid">{projects.map((game, i) => <article key={game.slug} className={`game-card ${i === 0 ? 'game-featured' : ''}`}>
      <a href={game.liveUrl} className="game-picture" aria-label={`Play ${game.title}`}>
        {game.screenshot ? <img src={game.screenshot} alt={`${game.title} gameplay`} loading={i === 0 ? 'eager' : 'lazy'} /> : <span className="game-placeholder">{game.title}</span>}
        {i === 0 && <span className="game-new">NEW ADVENTURE</span>}
      </a>
      <div className="game-copy"><div className="game-tags">{game.tags.filter(t => t !== 'Game').slice(0, 3).join(' · ')}</div><h2>{game.title}</h2><p>{game.description}</p><div className="game-actions"><a href={game.liveUrl} className="game-play">Play now <span aria-hidden="true">↗</span></a><Link to={`/projects/${game.slug}`}>About the game</Link></div></div>
    </article>)}</div>
  </div>
}
