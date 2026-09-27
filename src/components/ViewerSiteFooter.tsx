import { Link, useLocation } from 'react-router-dom'
import './ViewerSiteFooter.css'

interface ViewerSiteFooterProps {
  className?: string
}

export function ViewerSiteFooter({ className }: ViewerSiteFooterProps) {
  const location = useLocation()
  const editTo = { pathname: '/edit', hash: location.hash, search: location.search }

  return (
    <footer
      className={['viewer-site-footer', className].filter(Boolean).join(' ')}
      aria-label="Site"
    >
      <nav className="viewer-site-footer__nav" aria-label="Site links">
        <Link className="viewer-site-footer__link" to="/">
          About
        </Link>
        <Link className="viewer-site-footer__link" to={editTo}>
          Editor
        </Link>
        <a
          className="viewer-site-footer__link"
          href="https://github.com/MaysenTG"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
      </nav>
    </footer>
  )
}
