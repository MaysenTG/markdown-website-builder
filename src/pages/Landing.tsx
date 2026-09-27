import { Link } from 'react-router-dom'
import { ViewerSiteFooter } from '../components/ViewerSiteFooter'
import { exampleShareLinks } from '../lib/examples'
import './Landing.css'

export function Landing() {
  const examples = exampleShareLinks()

  return (
    <div className="landing-page">
      <main className="landing">
        <div className="landing__card">
          <p className="landing__eyebrow">Markdown website builder</p>
          <h1>Pages that live in the link</h1>
          <p className="landing__lead">
            Write markdown plus optional YAML frontmatter. The compressed payload sits in the URL hash —
            no server, no account. Open a link and the page renders with your theme, layout, and custom CSS.
          </p>
          <div className="landing__actions">
            <Link className="landing__btn landing__btn--primary" to="/edit">
              Open editor
            </Link>
          </div>
          <section className="landing__examples">
            <h2>Examples</h2>
            <ul>
              {examples.map(({ label, href }) => (
                <li key={label}>
                  <a href={href}>{label}</a>
                </li>
              ))}
            </ul>
          </section>
          <p className="landing__hint">
            Paste a shared <code>#p=…</code> link in the address bar, or start from{' '}
            <Link to="/edit">/edit</Link>.
          </p>
        </div>
      </main>
      <ViewerSiteFooter className="viewer-site-footer--landing" />
    </div>
  )
}
