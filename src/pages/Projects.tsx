import { useProjects } from '@/hooks/useProjects'
import ProjectCard from '@/components/projects/ProjectCard'

export default function Projects() {
  const projects = useProjects()

  return (
    <div>
      <div style={{ marginBottom: '3rem' }}>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: '#fff', margin: '0 0 0.75rem', letterSpacing: '-0.02em' }}>
          Projects
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '1.05rem', margin: 0, maxWidth: '55ch' }}>
          A collection of things I've built — simulations, games, developer tools, and experiments.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
        {projects.map((p) => <ProjectCard key={p.slug} project={p} />)}
      </div>
    </div>
  )
}
