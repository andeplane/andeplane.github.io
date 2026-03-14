import { createHashRouter } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import Home from '@/pages/Home'
import Projects from '@/pages/Projects'
import ProjectDetail from '@/pages/ProjectDetail'
import Blog from '@/pages/Blog'
import BlogPost from '@/pages/BlogPost'
import About from '@/pages/About'

export const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'projects', element: <Projects /> },
      { path: 'projects/:slug', element: <ProjectDetail /> },
      { path: 'blog', element: <Blog /> },
      { path: 'blog/:slug', element: <BlogPost /> },
      { path: 'about', element: <About /> },
    ],
  },
])
