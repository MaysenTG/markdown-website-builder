import { useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { readPayloadFromLocation } from '../lib/encode'
import { parsePageSource } from '../lib/parsePage'
import { PageView } from '../components/PageView'
import { Landing } from './Landing'

export function Viewer() {
  const location = useLocation()
  const payload = useMemo(() => readPayloadFromLocation(), [location.hash, location.search])
  const parsed = useMemo(() => (payload ? parsePageSource(payload) : null), [payload])

  useEffect(() => {
    document.title = parsed?.frontmatter.title ?? 'md-url-pages'
  }, [parsed?.frontmatter.title])

  if (!parsed) {
    return <Landing />
  }

  return <PageView frontmatter={parsed.frontmatter} body={parsed.body} />
}
