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
  let current = text
  let previous: string
  do {
    previous = current
    current = current.replace(/<[^>]*>/g, '')
  } while (current !== previous)
  return current.trim()
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

/**
 * Co-op player contribution data for PDF export.
 */
export interface CoopPlayerContribution {
  name: string
  correctCount: number
  incorrectCount: number
  totalEarned: number
}

/**
 * Options for exporting a co-op game PDF.
 */
export interface CoopPdfOptions {
  teamPool: number
  targetScore: number
  boardTotal: number
  players: CoopPlayerContribution[]
  gameName?: string
}

/**
 * Export a Co-op Mode game result as a PDF with:
 * - Team result (Victory / Defeat)
 * - Final pool vs target comparison
 * - Player contribution table
 * Omits individual rankings and winner declaration.
 */
export function exportCoopGamePdf(options: CoopPdfOptions): void {
  const { teamPool, targetScore, boardTotal, players, gameName } = options
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()

  const isVictory = teamPool >= targetScore

  // ─── Title ────────────────────────────────────────────────────────────────
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text('Co-op Game Results', pageWidth / 2, 40, { align: 'center' })

  if (gameName) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.text(gameName, pageWidth / 2, 58, { align: 'center' })
  }

  // ─── Team Result ──────────────────────────────────────────────────────────
  let yPos = gameName ? 90 : 76

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  const resultText = isVictory ? 'Team Result: Victory' : 'Team Result: Defeat'
  doc.text(resultText, pageWidth / 2, yPos, { align: 'center' })

  // ─── Pool vs Target ───────────────────────────────────────────────────────
  yPos += 32

  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(`Final Team Pool: ${teamPool} pts`, pageWidth / 2, yPos, { align: 'center' })

  yPos += 18
  doc.text(`Target Score: ${targetScore} pts`, pageWidth / 2, yPos, { align: 'center' })

  yPos += 18
  doc.text(`Board Total: ${boardTotal} pts`, pageWidth / 2, yPos, { align: 'center' })

  yPos += 18
  const percentage = targetScore > 0 ? Math.round((teamPool / targetScore) * 100) : 100
  doc.text(`Achievement: ${percentage}% of target`, pageWidth / 2, yPos, { align: 'center' })

  // ─── Progress Bar ─────────────────────────────────────────────────────────
  yPos += 24

  const barWidth = 300
  const barHeight = 18
  const barX = (pageWidth - barWidth) / 2
  const fillRatio = targetScore > 0 ? Math.min(1, Math.max(0, teamPool / targetScore)) : 1

  // Background bar
  doc.setFillColor(220, 220, 220)
  doc.rect(barX, yPos, barWidth, barHeight, 'F')

  // Filled bar
  if (isVictory) {
    doc.setFillColor(34, 197, 94) // green
  } else {
    doc.setFillColor(139, 92, 246) // purple
  }
  doc.rect(barX, yPos, barWidth * fillRatio, barHeight, 'F')

  // Bar border
  doc.setDrawColor(100, 100, 100)
  doc.rect(barX, yPos, barWidth, barHeight, 'S')

  // ─── Contribution Table ───────────────────────────────────────────────────
  yPos += barHeight + 36

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Team Contributions', pageWidth / 2, yPos, { align: 'center' })

  yPos += 16

  const tableHeaders = ['Player', 'Correct', 'Incorrect', 'Net Contribution']
  const tableBody = players.map(p => [
    p.name,
    String(p.correctCount),
    String(p.incorrectCount),
    `${p.totalEarned >= 0 ? '+' : ''}${p.totalEarned} pts`,
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(doc as any).autoTable({
    startY: yPos,
    head: [tableHeaders],
    body: tableBody,
    theme: 'grid',
    styles: {
      fontSize: 10,
      cellPadding: 6,
      valign: 'middle',
      halign: 'center',
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [16, 24, 72],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10,
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 180 },
    },
    margin: { left: 60, right: 60 },
  })

  // ─── Save ─────────────────────────────────────────────────────────────────
  const filename = gameName
    ? `${gameName.replace(/[^a-zA-Z0-9 _-]/g, '').trim()} - Co-op Results.pdf`
    : 'jeopardy-coop-results.pdf'

  const pdfDataUri = doc.output('datauristring', { filename })
  const link = document.createElement('a')
  link.href = pdfDataUri
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}