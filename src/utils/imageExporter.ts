import { toPng } from 'html-to-image'

export async function exportAnalyticsAsPng(
  element: HTMLElement,
  filename: string,
): Promise<void> {
  const dataUrl = await toPng(element, {
    cacheBust: true,
    // Capture full scrollable area by explicitly passing scrollHeight/scrollWidth
    height: element.scrollHeight,
    width: element.scrollWidth,
  })
  const link = document.createElement('a')
  link.download = filename
  link.href = dataUrl
  link.click()
}
