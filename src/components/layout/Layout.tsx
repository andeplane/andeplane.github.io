import { Outlet, ScrollRestoration } from 'react-router-dom'
import Navbar from './Navbar'
import Footer from './Footer'

export default function Layout() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <ScrollRestoration />
      <Navbar />
      <main style={{ flex: 1, maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '3rem 1.5rem' }}>
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
