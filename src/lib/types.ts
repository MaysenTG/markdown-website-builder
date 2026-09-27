export type PageTheme = 'light' | 'dark' | 'auto'

export interface PageFrontmatter {
  title?: string
  theme?: PageTheme
  css?: string
  maxWidth?: string
  font?: string
  background?: string
  accent?: string
  hideChrome?: boolean
}

export interface ParsedPage {
  frontmatter: PageFrontmatter
  body: string
  raw: string
}
