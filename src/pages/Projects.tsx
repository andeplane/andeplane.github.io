import { Link, useSearchParams } from 'react-router-dom'
import { matchesCategory, projectCategories } from '@/lib/projectCategories'
import { useProjects } from '@/hooks/useProjects'
import ProjectCard from '@/components/projects/ProjectCard'

export default function Projects() {
  const [params] = useSearchParams()
  const category = projectCategories.find(item => item.id === params.get('category'))
  const projects = useProjects().filter(project => matchesCategory(project, category?.id ?? 'all'))

  return (
    <div>
      <div style={{ marginBottom: '3rem' }}>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: '#fff', margin: '0 0 0.75rem', letterSpacing: '-0.02em' }}>
          {category ? `${category.label} projects` : 'Projects'}
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '1.05rem', margin: 0, maxWidth: '55ch' }}>
          A collection of things I've built — simulations, games, developer tools, and experiments.
        </p>
      </div>

      <nav className="project-filters" aria-label="Filter projects">
        <Link to="/projects" aria-current={!category ? 'page' : undefined}>All</Link>
        {projectCategories.map(item => <Link key={item.id} to={`/projects?category=${item.id}`} aria-current={category?.id === item.id ? 'page' : undefined}>{item.label}</Link>)}
      </nav>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '1.25rem' }}>
        {projects.map((p) => <ProjectCard key={p.slug} project={p} />)}
      </div>
    </div>
  )
}
