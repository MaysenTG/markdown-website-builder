export interface Box {
  top: number
  left: number
  width: number
  height: number
}

export function placePanel(
  selection: Box,
  frame: { width: number; height: number },
  panel: { width: number; height: number },
  gap = 10,
): { top: number; left: number } {
  const margin = 8
  const maxLeft = Math.max(margin, frame.width - margin - panel.width)
  const maxTop = Math.max(margin, frame.height - margin - panel.height)

  let left = selection.left
  if (left > maxLeft) left = maxLeft
  if (left < margin) left = margin

  let top = selection.top + selection.height + gap
  if (top > maxTop) {
    const above = selection.top - gap - panel.height
    top = above >= margin ? above : maxTop
  }
  if (top < margin) top = margin
  if (top > maxTop) top = maxTop

  return { top, left }
}
