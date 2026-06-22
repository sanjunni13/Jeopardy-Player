// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BoardGrid, type BoardGridProps } from './BoardGrid'
import type { CategoryFormState } from '../../utils/builderFormStructure'

// Mock @dnd-kit to avoid complex DnD setup in unit tests
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: () => [],
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  horizontalListSortingStrategy: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    setActivatorNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => undefined } },
}))

function createCategory(name: string, clueCount: number): CategoryFormState {
  return {
    name,
    clues: Array.from({ length: clueCount }, () => ({
      value: '',
      clue: '',
      solution: '',
      dailyDouble: false,
    })),
    isDefaultName: name.startsWith('Category'),
  }
}

function renderGrid(overrides: Partial<BoardGridProps> = {}) {
  const defaultProps: BoardGridProps = {
    categories: [
      createCategory('Science', 5),
      createCategory('History', 5),
      createCategory('Music', 5),
    ],
    roundIndex: 0,
    pointValues: [200, 400, 600, 800, 1000],
    onCellClick: vi.fn(),
    onCategoryReorder: vi.fn(),
    onPointValueClick: vi.fn(),
    onAddColumn: vi.fn(),
    onAddRow: vi.fn(),
    onCategoryNameChange: vi.fn(),
    onOptionsOpen: vi.fn(),
  }
  const props = { ...defaultProps, ...overrides }
  const result = render(<BoardGrid {...props} />)
  return { ...result, props }
}

describe('BoardGrid', () => {
  it('renders a grid element with proper role and aria-label', () => {
    renderGrid({ roundIndex: 0 })
    const grid = screen.getByRole('grid')
    expect(grid).toHaveAttribute(
      'aria-label',
      'Round 1 game board, 3 categories, 5 rows'
    )
  })

  it('renders correct aria-label for different category/row counts', () => {
    renderGrid({
      categories: [createCategory('A', 3), createCategory('B', 3)],
      pointValues: [200, 400, 600],
      roundIndex: 1,
    })
    const grid = screen.getByRole('grid')
    expect(grid).toHaveAttribute(
      'aria-label',
      'Round 2 game board, 2 categories, 3 rows'
    )
  })

  it('renders category name inputs for each category', () => {
    renderGrid()
    expect(screen.getByLabelText('Category 1 name')).toBeInTheDocument()
    expect(screen.getByLabelText('Category 2 name')).toBeInTheDocument()
    expect(screen.getByLabelText('Category 3 name')).toBeInTheDocument()
  })

  it('renders point value labels for each row', () => {
    renderGrid({ pointValues: [200, 400, 600] })
    expect(screen.getByLabelText('Edit point value for row 1, currently 200 dollars')).toBeInTheDocument()
    expect(screen.getByLabelText('Edit point value for row 2, currently 400 dollars')).toBeInTheDocument()
    expect(screen.getByLabelText('Edit point value for row 3, currently 600 dollars')).toBeInTheDocument()
  })

  it('renders clue cells for each category × row combination', () => {
    const categories = [createCategory('Cat A', 3), createCategory('Cat B', 3)]
    renderGrid({ categories, pointValues: [200, 400, 600] })
    // 2 categories × 3 rows = 6 clue cells
    const clueCells = screen.getAllByText(/^\$\d+$/)
    // Point value labels (3) + clue cells showing point values (6) = 9 total
    expect(clueCells.length).toBe(9)
  })

  it('fires onCellClick with correct indices when a clue cell is clicked', () => {
    const onCellClick = vi.fn()
    const categories = [createCategory('Alpha', 2), createCategory('Beta', 2)]
    renderGrid({ categories, pointValues: [200, 400], onCellClick })
    // Click cell at "Beta, row 1, 200 dollars"
    const cell = screen.getByLabelText('Beta, row 1, 200 dollars')
    fireEvent.click(cell)
    expect(onCellClick).toHaveBeenCalledWith(1, 0)
  })

  it('fires onPointValueClick with row index when a point label is clicked', () => {
    const onPointValueClick = vi.fn()
    renderGrid({ pointValues: [200, 400, 600], onPointValueClick })
    fireEvent.click(screen.getByLabelText('Edit point value for row 2, currently 400 dollars'))
    expect(onPointValueClick).toHaveBeenCalledWith(1)
  })

  it('renders the Add Column button', () => {
    renderGrid()
    expect(screen.getByLabelText('Add category column')).toBeInTheDocument()
  })

  it('fires onAddColumn when Add Column button is clicked', () => {
    const onAddColumn = vi.fn()
    renderGrid({ onAddColumn })
    fireEvent.click(screen.getByLabelText('Add category column'))
    expect(onAddColumn).toHaveBeenCalledTimes(1)
  })

  it('renders the Add Row button', () => {
    renderGrid()
    expect(screen.getByLabelText('Add point value row')).toBeInTheDocument()
  })

  it('fires onAddRow when Add Row button is clicked', () => {
    const onAddRow = vi.fn()
    renderGrid({ onAddRow })
    fireEvent.click(screen.getByLabelText('Add point value row'))
    expect(onAddRow).toHaveBeenCalledTimes(1)
  })

  it('renders a drag handle for each category', () => {
    renderGrid()
    const handles = screen.getAllByLabelText(/^Drag to reorder/)
    expect(handles).toHaveLength(3)
  })

  it('renders options trigger for each category', () => {
    renderGrid()
    const optionsBtns = screen.getAllByTitle('Options')
    expect(optionsBtns).toHaveLength(3)
  })

  it('fires onOptionsOpen with the correct category index', () => {
    const onOptionsOpen = vi.fn()
    renderGrid({ onOptionsOpen })
    const optionsBtns = screen.getAllByTitle('Options')
    fireEvent.click(optionsBtns[1])
    expect(onOptionsOpen).toHaveBeenCalledWith(1)
  })

  it('fires onCategoryNameChange when a category name input changes', () => {
    const onCategoryNameChange = vi.fn()
    renderGrid({ onCategoryNameChange })
    const input = screen.getByLabelText('Category 2 name')
    fireEvent.change(input, { target: { value: 'New Name' } })
    expect(onCategoryNameChange).toHaveBeenCalledWith(1, 'New Name')
  })

  it('renders with 6 categories and 5 rows (default game size)', () => {
    const categories = Array.from({ length: 6 }, (_, i) =>
      createCategory(`Category ${i + 1}`, 5)
    )
    renderGrid({ categories, pointValues: [200, 400, 600, 800, 1000] })
    const grid = screen.getByRole('grid')
    expect(grid).toHaveAttribute(
      'aria-label',
      'Round 1 game board, 6 categories, 5 rows'
    )
    const nameInputs = screen.getAllByLabelText(/Category \d+ name/)
    expect(nameInputs).toHaveLength(6)
  })

  it('applies CSS grid template columns based on category count', () => {
    renderGrid()
    const grid = screen.getByRole('grid')
    expect(grid.style.gridTemplateColumns).toBe('auto repeat(3, 1fr) auto')
  })

  it('applies CSS grid template rows based on point value count', () => {
    renderGrid({ pointValues: [200, 400] })
    const grid = screen.getByRole('grid')
    expect(grid.style.gridTemplateRows).toBe('auto repeat(2, 1fr) auto')
  })
})
