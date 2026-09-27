// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { describeSelection, findSelectedElement, pickSelectable } from '../src/lib/ai/describeSelection'

const html = `
  <div class="page-body">
    <h1>Field Notes</h1>
    <p>Intro paragraph</p>
    <h2>Morning light</h2>
    <p><img alt="Placeholder hills" src="https://example.com/h.jpg"></p>
    <h2>Sketches</h2>
    <ul>
      <li><strong>Grid studies</strong></li>
    </ul>
  </div>
`

describe('preview selection', () => {
  it('describes the element under the cursor in plain language', () => {
    document.body.innerHTML = html
    const root = document.querySelector('.page-body')
    expect(root).toBeTruthy()
    if (!root) return

    const strong = root.querySelector('strong')
    expect(strong).toBeTruthy()
    if (!strong) return
    const item = pickSelectable(strong, root)
    expect(item?.tagName).toBe('LI')
    if (!item) return
    const described = describeSelection(item, root)
    expect(described.tag).toBe('li')
    expect(described.label).toBe('List item')
    expect(described.textExcerpt).toContain('Grid studies')
    expect(described.headingPath).toEqual(['Field Notes', 'Sketches'])
    expect(described.positionHint).toContain('under “Sketches”')

    const image = root.querySelector('img')
    expect(image).toBeTruthy()
    if (!image) return
    const pickedImage = pickSelectable(image, root)
    expect(pickedImage?.tagName).toBe('IMG')
    if (!pickedImage) return
    const imageSelection = describeSelection(pickedImage, root)
    expect(imageSelection.textExcerpt).toBe('Placeholder hills')
    expect(imageSelection.headingPath).toEqual(['Field Notes', 'Morning light'])

    const heading = root.querySelectorAll('h2')[0]
    expect(heading).toBeTruthy()
    if (!(heading instanceof HTMLElement)) return
    const headingSelection = describeSelection(heading, root)
    expect(headingSelection.index).toBe(0)
    expect(headingSelection.headingPath).toEqual(['Field Notes', 'Morning light'])
    expect(findSelectedElement(root, headingSelection)).toBe(heading)

    expect(pickSelectable(root, root)).toBeNull()
  })
})