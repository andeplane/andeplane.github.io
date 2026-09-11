import { lazy, Suspense } from 'react'
import { createHashRouter } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import Home from '@/pages/Home'
import Projects from '@/pages/Projects'
import ProjectDetail from '@/pages/ProjectDetail'
import Blog from '@/pages/Blog'
import BlogPost from '@/pages/BlogPost'
import About from '@/pages/About'
import Music from '@/pages/Music'
import Rendering from '@/pages/Rendering'

const Interests = lazy(() => import('@/pages/Interests'))
const Physics = lazy(() => import('@/pages/Physics'))
const NeuralOperators = lazy(() => import('@/features/neural-operators/NeuralOperators'))

export const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'projects', element: <Projects /> },
      { path: 'interests', element: <Suspense fallback={<p>Loading interests…</p>}><Interests /></Suspense> },
      { path: 'interests/physics', element: <Suspense fallback={<p>Loading physics…</p>}><Physics /></Suspense> },
      { path: 'interests/music', element: <Music /> },
      { path: 'interests/3d-rendering', element: <Rendering /> },
      { path: 'interests/neural-operators/:tab?', element: <Suspense fallback={<p>Loading research…</p>}><NeuralOperators /></Suspense> },
      { path: 'projects/:slug', element: <ProjectDetail /> },
      { path: 'blog', element: <Blog /> },
      { path: 'blog/:slug', element: <BlogPost /> },
      { path: 'about', element: <About /> },
    ],
  },
])
