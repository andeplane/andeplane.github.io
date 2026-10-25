import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import Home from '@/pages/Home'
import Projects from '@/pages/Projects'
import ProjectDetail from '@/pages/ProjectDetail'
import Blog from '@/pages/Blog'
import BlogPost from '@/pages/BlogPost'
import About from '@/pages/About'
import Music from '@/pages/Music'
import Rendering from '@/pages/Rendering'

const Games = lazy(() => import('@/pages/Games'))
const Hardware = lazy(() => import('@/pages/Hardware'))
const Kiwi = lazy(() => import('@/features/kiwi/Kiwi'))
const Interests = lazy(() => import('@/pages/Interests'))
const Physics = lazy(() => import('@/pages/Physics'))
const NeuralOperators = lazy(() => import('@/features/neural-operators/NeuralOperators'))
const FnoSketch = lazy(() => import('@/features/fno-sketch/FnoSketch'))
const Constellation = lazy(() => import('@/features/constellation/Constellation'))

export const router = createBrowserRouter([
  { path: 'experiments/constellation', element: <Suspense fallback={<div aria-hidden="true" style={{ background: '#080e1b', minHeight: '100svh' }} />}><Constellation /></Suspense> },
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'projects', element: <Projects /> },
      { path: 'games', element: <Suspense fallback={<p>Loading games…</p>}><Games /></Suspense> },
      { path: 'hardware', element: <Suspense fallback={<p>Loading hardware…</p>}><Hardware /></Suspense> },
      { path: 'hardware/kiwi', element: <Suspense fallback={<p>Loading Kiwi…</p>}><Kiwi /></Suspense> },
      { path: 'hardware/kiwi/:variant', element: <Suspense fallback={<p>Loading Kiwi…</p>}><Kiwi /></Suspense> },
      { path: 'interests', element: <Suspense fallback={<p>Loading interests…</p>}><Interests /></Suspense> },
      { path: 'interests/physics', element: <Suspense fallback={<p>Loading physics…</p>}><Physics /></Suspense> },
      { path: 'interests/music', element: <Music /> },
      { path: 'interests/3d-rendering', element: <Rendering /> },
      { path: 'interests/neural-operators/fno-sketch', element: <Suspense fallback={<p>Loading…</p>}><FnoSketch /></Suspense> },
      { path: 'interests/neural-operators/:tab?', element: <Suspense fallback={<p>Loading research…</p>}><NeuralOperators /></Suspense> },
      { path: 'projects/:slug', element: <ProjectDetail /> },
      { path: 'blog', element: <Blog /> },
      { path: 'blog/:slug', element: <BlogPost /> },
      { path: 'about', element: <About /> },
    ],
  },
])
