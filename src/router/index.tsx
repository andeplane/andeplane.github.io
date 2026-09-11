import { lazy, Suspense } from 'react'
import { createHashRouter } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import Home from '@/pages/Home'
import Projects from '@/pages/Projects'
import ProjectDetail from '@/pages/ProjectDetail'
import Blog from '@/pages/Blog'
import BlogPost from '@/pages/BlogPost'
import About from '@/pages/About'

const Interests = lazy(() => import('@/pages/Interests'))
const Music = lazy(() => import('@/pages/Music'))
const Rendering = lazy(() => import('@/pages/Rendering'))
const NeuralOperators = lazy(() => import('@/features/neural-operators/NeuralOperators'))

export const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'projects', element: <Projects /> },
      { path: 'interests', element: <Suspense fallback={<p>Loading interests…</p>}><Interests /></Suspense> },
      { path: 'interests/music', element: <Suspense fallback={<p>Loading music…</p>}><Music /></Suspense> },
      { path: 'interests/3d-rendering', element: <Suspense fallback={<p>Loading 3D rendering…</p>}><Rendering /></Suspense> },
      { path: 'interests/neural-operators/:tab?', element: <Suspense fallback={<p>Loading research…</p>}><NeuralOperators /></Suspense> },
      { path: 'projects/:slug', element: <ProjectDetail /> },
      { path: 'blog', element: <Blog /> },
      { path: 'blog/:slug', element: <BlogPost /> },
      { path: 'about', element: <About /> },
    ],
  },
])
