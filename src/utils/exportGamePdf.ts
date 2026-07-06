import jsPDF from 'jspdf'
import 'jspdf-autotable'
import type { NormalizedGame, RoundName } from '../types/game'

const ROUND_LABELS: Record<RoundName, string> = {
  single: 'Jeopardy!',
  double: 'Double Jeopardy!',
  triple: 'Triple Jeopardy!',
  quadruple: 'Quadruple Jeopardy!',
  quintuple: 'Quintuple Jeopardy!',
  sextuple: 'Sextuple Jeopardy!',
}

const ROUND_ORDER: RoundName[] = ['single', 'double', 'triple', 'quadruple', 'quintuple', 'sextuple']

/**
 * Strips basic HTML tags from a string (some clues use html formatting).
 */
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').trim()
}

/**
 * Export a NormalizedGame as a print-ready PDF with:
 * - Category headers and clue/answer grid per round
 * - A separate answer key page at the end
 */
export function exportGamePdf(game: NormalizedGame, gameName?: string): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()

  const orderedRounds = ROUND_ORDER.filter(name => name in game.rounds)

  // ─── Clue Pages (one page per round) ──────────────────────────────────────
  orderedRounds.forEach((roundName, roundIdx) => {
    if (roundIdx > 0) doc.addPage()

    const categories = game.rounds[roundName]
    const roundLabel = ROUND_LABELS[roundName]

    // Round title
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text(roundLabel, pageWidth / 2, 36, { align: 'center' })

    if (gameName) {
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(gameName, pageWidth / 2, 52, { align: 'center' })
    }

    // Build table: columns = categories, rows = clue values
    const numClues = categories[0]?.clues.length ?? 5
    const headers = categories.map(c => c.category)

    const body: string[][] = []
    for (let clueIdx = 0; clueIdx < numClues; clueIdx++) {
      const row: string[] = []
      for (const cat of categories) {
        const clue = cat.clues[clueIdx]
        if (clue) {
          const prefix = `$${clue.value}${clue.dailyDouble ? ' ★' : ''}`
          const clueText = stripHtml(clue.clue)
          row.push(`${prefix}\n${clueText}`)
        } else {
          row.push('')
        }
      }
      body.push(row)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(doc as any).autoTable({
      startY: gameName ? 62 : 48,
      head: [headers],
      body,
      theme: 'grid',
      styles: {
        fontSize: 7.5,
        cellPadding: 4,
        valign: 'top',
        overflow: 'linebreak',
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: [16, 24, 72],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center',
        valign: 'middle',
      },
      columnStyles: Object.fromEntries(
        categories.map((_, i) => [i, { cellWidth: (pageWidth - 60) / categories.length }])
      ),
      margin: { left: 30, right: 30 },
    })
  })

  // ─── Final Jeopardy clue page ─────────────────────────────────────────────
  if (game.final) {
    doc.addPage()
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('Final Jeopardy!', pageWidth / 2, 36, { align: 'center' })

    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(`Category: ${game.final.category}`, pageWidth / 2, 72, { align: 'center' })

    doc.setFontSize(12)
    doc.setFont('helvetica', 'normal')
    const clueLines = doc.splitTextToSize(stripHtml(game.final.clue), pageWidth - 120)
    doc.text(clueLines, pageWidth / 2, 108, { align: 'center' })
  }

  // ─── Answer Key Pages ─────────────────────────────────────────────────────
  doc.addPage()
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('Answer Key', pageWidth / 2, 36, { align: 'center' })

  let answerPageStartY = 56

  orderedRounds.forEach((roundName) => {
    const categories = game.rounds[roundName]
    const roundLabel = ROUND_LABELS[roundName]
    const numClues = categories[0]?.clues.length ?? 5

    const headers = categories.map(c => c.category)
    const body: string[][] = []

    for (let clueIdx = 0; clueIdx < numClues; clueIdx++) {
      const row: string[] = []
      for (const cat of categories) {
        const clue = cat.clues[clueIdx]
        if (clue) {
          row.push(`$${clue.value}: ${stripHtml(clue.solution)}`)
        } else {
          row.push('')
        }
      }
      body.push(row)
    }

    // Check if we need a new page (rough estimate)
    const estimatedHeight = 20 + (numClues + 1) * 24
    if (answerPageStartY + estimatedHeight > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage()
      answerPageStartY = 36
    }

    // Round sub-header
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(roundLabel, 30, answerPageStartY)
    answerPageStartY += 14

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(doc as any).autoTable({
      startY: answerPageStartY,
      head: [headers],
      body,
      theme: 'grid',
      styles: {
        fontSize: 7,
        cellPadding: 3,
        valign: 'top',
        overflow: 'linebreak',
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: [60, 60, 60],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5,
        halign: 'center',
      },
      columnStyles: Object.fromEntries(
        categories.map((_, i) => [i, { cellWidth: (pageWidth - 60) / categories.length }])
      ),
      margin: { left: 30, right: 30 },
      didDrawPage: () => {
        // Reset startY tracking on new auto-pages
      },
    })

    // Get where the table ended
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = (doc as any).lastAutoTable?.finalY as number | undefined
    answerPageStartY = finalY != null ? finalY + 20 : answerPageStartY + estimatedHeight
  })

  // Final Jeopardy answer
  if (game.final) {
    const fjHeight = 60
    if (answerPageStartY + fjHeight > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage()
      answerPageStartY = 36
    }

    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Final Jeopardy!', 30, answerPageStartY)
    answerPageStartY += 16

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Category: ${game.final.category}`, 30, answerPageStartY)
    answerPageStartY += 14
    doc.text(`Answer: ${stripHtml(game.final.solution)}`, 30, answerPageStartY)
  }

  // ─── Save ─────────────────────────────────────────────────────────────────
  const filename = gameName
    ? `${gameName.replace(/[^a-zA-Z0-9 _-]/g, '').trim()}.pdf`
    : 'jeopardy-game.pdf'

  // Use data URI approach to avoid blob URL insecure-connection warnings on HTTP
  const pdfDataUri = doc.output('datauristring', { filename })
  const link = document.createElement('a')
  link.href = pdfDataUri
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
