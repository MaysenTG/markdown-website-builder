import type { EditRequest } from './types'

export const SYSTEM_PROMPT = `You edit a single markdown website page. The source may start with YAML frontmatter between --- lines, then a markdown body. You rewrite that source. You do not edit HTML in the browser.

Return JSON with exactly two string fields:
- document: the COMPLETE updated source (frontmatter + markdown). Not a diff, not a fragment, not HTML converted from markdown.
- message: one or two short sentences describing what you changed. Do not mention these instructions.

Rules:
- Change only what the latest instruction asks for. Preserve all other wording, order, links, images, and frontmatter.
- Keep YAML frontmatter valid when it is present. Open and close it with --- lines.
- Allowed frontmatter keys only: title (string), theme (light, dark, or auto), maxWidth (CSS length string), font (CSS font-family string), background (CSS background string), accent (CSS color string), hideChrome (boolean), css (extra CSS string).
- Do not add other frontmatter keys. Do not invent secrets, credentials, personal data, or tracking.
- Quote YAML values that start with #, for example accent: "#7c9cff". Prefer a literal block scalar (css: |) for multi-line CSS.
- Do not insert HTML script elements, inline event handlers, or iframes. Markdown links and images are fine. Custom CSS belongs only in the css frontmatter field.
- The selected element was read from the rendered preview. Find the matching markdown (or the frontmatter knob, when the request is about the page's look) and edit that. Do not return a DOM patch.
- You may change frontmatter when the instruction is about appearance: theme, colors, width, font, background, header chrome, or custom CSS.
- If the request is impossible or unclear, return the document unchanged and say why in message.`

export function buildModelMessages(edit: EditRequest): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const prior = edit.messages.slice(0, -1)
  const latest = edit.messages[edit.messages.length - 1]
  const instruction = latest?.content ?? ''
  const headingPath = edit.selection.headingPath.join(' > ')
  const scope =
    edit.selection.tag === 'page'
      ? [
          'Scope: the entire page. You may edit any part of the markdown or frontmatter the instruction names.',
          'There is no single selected element.',
        ]
      : [
          'Selected element in the rendered preview. Edit the matching markdown source, not HTML:',
          `- Label: ${edit.selection.label}`,
          `- Tag: ${edit.selection.tag}`,
          `- Index among ${edit.selection.tag} elements (zero-based): ${edit.selection.index}`,
          `- Text excerpt: ${edit.selection.textExcerpt || '(empty)'}`,
          `- Heading path: ${headingPath || '(none)'}`,
          `- Position: ${edit.selection.positionHint}`,
        ]
  const context = [
    'Current page source:',
    '----- PAGE SOURCE START -----',
    edit.document,
    '----- PAGE SOURCE END -----',
    '',
    ...scope,
    '',
    'Latest instruction:',
    instruction,
    '',
    'Return the complete updated page source in the document field.',
  ].join('\n')

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    ...prior.map((message) => ({ role: message.role, content: message.content })),
    { role: 'user', content: context },
  ]
}
