import { useBlogPosts } from '@/hooks/useBlogPosts'
import BlogCard from '@/components/blog/BlogCard'

export default function Blog() {
  const { posts, loading } = useBlogPosts()

  return (
    <div>
      <div style={{ marginBottom: '3rem' }}>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: '#fff', margin: '0 0 0.75rem', letterSpacing: '-0.02em' }}>
          Blog
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '1.05rem', margin: 0, maxWidth: '55ch' }}>
          Writing on simulations, web performance, TypeScript, and whatever else captures my attention.
        </p>
      </div>

      {loading ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : posts.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No posts yet. Check back soon.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {posts.map((post) => <BlogCard key={post.slug} post={post} />)}
        </div>
      )}
    </div>
  )
}
