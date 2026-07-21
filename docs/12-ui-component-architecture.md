# UI Component Architecture

## Purpose

The UI Component Architecture defines the design system foundations, styling approach, icon libraries, animation patterns, and reusable component library used across the entire application. It provides a consistent visual language and developer experience through composable, accessible UI primitives.

## Architecture Overview

```
Design System Stack
    │
    ├── Radix UI (headless primitives) + shadcn/ui pattern
    ├── TailwindCSS 4 (utility-first styling)
    ├── class-variance-authority (component variants)
    ├── tailwind-merge (class conflict resolution)
    ├── Framer Motion / motion (animations)
    ├── HugeIcons + Lucide React (icons)
    ├── react-toastify (notifications)
    └── canvas-confetti (celebrations)
```

### Styling Philosophy

The project uses a utility-first approach with TailwindCSS, augmented by CSS Modules for complex component-specific styles. The `cn()` utility (from `lib/utils.ts`) combines `clsx` and `tailwind-merge` for safe class composition:

```typescript
// lib/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

## Key Files

| File | Responsibility |
|------|---------------|
| `lib/utils.ts` | `cn()` class merge utility |
| `components.json` | shadcn/ui configuration |
| `src/components/ui/` | Radix-based primitives (buttons, dialogs, etc.) |
| `src/components/ui/framer-motion-animations/` | Pre-built animation components |

## Component Layers

### Layer 1: Radix UI Primitives

Headless, accessible components from Radix UI (`radix-ui` package):
- Dialog, Dropdown Menu, Tabs, Toggle, Tooltip, etc.
- Provide accessibility (ARIA, keyboard navigation, focus management) out of the box
- Styled via TailwindCSS classes following the shadcn/ui pattern

### Layer 2: shadcn/ui Pattern

The project follows the shadcn/ui approach:
- Components are copied into the project (not imported from a library)
- Configured via `components.json`
- Customizable per-project without fighting a library's opinions
- Uses `class-variance-authority` (CVA) for defining component variants

### Layer 3: Custom Application Components

Built on top of the primitives:
- `ToggleSwitch` — Custom boolean toggle with label
- `RoundsSelector` — Round count selector (1-5)
- `MenuCard` — Navigation card with icon and description
- `BackButton` — Consistent navigation back button
- `ElasticSlider` — Custom range slider with elastic feel
- `CloudSpinner` — Loading spinner
- `FAQCard` — Expandable FAQ item

## Styling Approach

### TailwindCSS 4

- Configured via `@tailwindcss/vite` plugin (no `tailwind.config.js` needed in v4)
- Custom theme through CSS variables
- Dark/light theme via `data-theme` attribute on `<html>`

### CSS Files

Complex components use dedicated `.css` files alongside their `.tsx`:
- `AuthenticatedLayout.css`
- `GameDetailsDialog.css`
- `CoopScoreboard.css`
- `FavoriteToggle.css`
- etc.

### Class Variance Authority (CVA)

Used for creating variant-driven component APIs:
```typescript
const buttonVariants = cva('base-classes', {
  variants: {
    variant: { default: '...', destructive: '...', outline: '...' },
    size: { default: '...', sm: '...', lg: '...' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
})
```

## Icon Systems

### HugeIcons (Primary)
- Package: `@hugeicons/react` + `@hugeicons/core-free-icons`
- Usage: Primary icon set for the application
- Style: Modern, consistent line icons

### Lucide React (Secondary)
- Package: `lucide-react`
- Usage: Supplementary icons where HugeIcons lacks coverage
- Style: Simple, clean line icons

### SVG Sprites
- `public/icons.svg` — Custom SVG sprite sheet for specialized icons

## Animation System

### Framer Motion (`motion` package)

The primary animation library. Used for:
- Page transitions
- Score value animations (AnimatePresence)
- Card entrance effects
- Modal open/close animations
- List item stagger effects

### Pre-Built Animation Components (`src/components/ui/framer-motion-animations/`)

| Component | Description |
|-----------|-------------|
| `backToTopFab.tsx` | Floating action button that appears on scroll |
| `contextMenuMorph.tsx` | Context menu with morph animation |
| `etherealShadows.tsx` | Decorative shadow effects |
| `filteredMeltAway.tsx` | Items dissolve when filtered out |
| `frostedGlassModal.tsx` | Modal with frosted glass backdrop |
| `pagedTableTransition.tsx` | Table pagination transitions |
| `staggeredCardRise.tsx` | Cards rise in sequence on page load |
| `underlineGlide.tsx` | Nav link underline glide effect |

### Reduced Motion Support

All animations respect the `reduced-motion` class on `<html>` and the OS `prefers-reduced-motion` media query. When active:
- Scale/fade transitions are simplified or removed
- Confetti animations are suppressed
- Hover transforms are disabled

### canvas-confetti

Used for celebration moments:
- Game winner announcement
- Co-op team victory
- Achievement unlocks (future)

## Notification System

### react-toastify

- Toast notifications for success, error, info, and warning messages
- Auto-dismiss with configurable duration
- Positioned consistently (likely top-right or bottom-center)
- Used for: save confirmations, error alerts, copy-to-clipboard feedback

## Typography

- **Font**: Figtree (variable weight) via `@fontsource-variable/figtree`
- **Scaling**: Uses TailwindCSS text utilities
- **Responsive**: Text sizes adjust via Tailwind responsive prefixes

## Theming

### CSS Variables

The theme is driven by CSS custom properties that change based on `data-theme`:

```css
[data-theme="dark"] {
  --background: #0f172a;
  --foreground: #f8fafc;
  --accent: #6A1B9A;
  /* ... */
}

[data-theme="light"] {
  --background: #ffffff;
  --foreground: #1e293b;
  --accent: #7c3aed;
  /* ... */
}
```

### Color Palette (Dark Theme — Primary)
- Background: `slate-900` / `slate-950`
- Text: `slate-100` / `slate-300`
- Accent: Purple (`#6A1B9A`)
- Error: Rose/red shades
- Success: Green/emerald shades

## Dependencies

| Package | Usage |
|---------|-------|
| `radix-ui` | Headless accessible UI primitives |
| `shadcn` | Component CLI and configuration |
| `tailwindcss` | Utility-first CSS framework |
| `@tailwindcss/vite` | Vite integration for Tailwind v4 |
| `class-variance-authority` | Component variant definitions |
| `clsx` | Conditional class joining |
| `tailwind-merge` | Tailwind class conflict resolution |
| `tw-animate-css` | Animation utility classes |
| `motion` (framer-motion) | Declarative animations |
| `@hugeicons/react` + `@hugeicons/core-free-icons` | Primary icon set |
| `lucide-react` | Secondary icon set |
| `react-toastify` | Toast notification system |
| `canvas-confetti` | Confetti celebration effects |
| `@fontsource-variable/figtree` | Variable font |
| `react-player` | YouTube/video embed component |
| `recharts` | Data visualization charts |

## Related UI Components (Reusable)

- `src/components/ToggleSwitch.tsx` — Boolean toggle with label
- `src/components/RoundsSelector.tsx` — 1-5 round picker
- `src/components/BackButton.tsx` — Navigation back button
- `src/components/MenuCard.tsx` — Navigation card (icon + text + link)
- `src/components/SettingsIcon.tsx` — Animated gear icon
- `src/components/DeleteButton.tsx` — Destructive action button with styling
- `src/components/StarRating.tsx` — Interactive star rating
- `src/components/FavoriteToggle.tsx` — Heart bookmark toggle
- `src/components/AverageRatingBadge.tsx` — Read-only rating display
- `src/components/ui/` — All shadcn/Radix-based primitives

## UX Patterns

- **Loading states**: `CloudSpinner` or `LazyFallback` ("Loading…" text)
- **Error states**: Inline error messages with rose coloring
- **Empty states**: Descriptive messages with suggested actions
- **Confirmation dialogs**: Radix Dialog for destructive actions
- **Toast feedback**: Success/error toasts for async operations
- **Responsive layout**: Mobile-first with breakpoint-based adaptations
- **Keyboard navigation**: Tab-based focus flow, Escape to close modals
- **Staggered animations**: Cards and list items animate in sequence on page load
