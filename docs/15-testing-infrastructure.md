# Testing Infrastructure

## Purpose

The testing infrastructure provides comprehensive automated verification of the application's business logic, UI components, and API interactions through a layered approach: unit tests for isolated functions, property-based tests for invariant verification, integration tests for cross-system interactions, and accessibility tests for a11y compliance.

## Architecture Overview

```
Test Runner: Vitest 4
    │
    ├── Unit Tests (*.test.ts / *.test.tsx)
    │       └── Standard assertion-based tests
    │
    ├── Property Tests (*.property.test.ts)
    │       └── fast-check generated inputs, invariant assertions
    │
    ├── Integration Tests (*.integration.test.ts)
    │       └── Cross-system tests with mocked Supabase
    │
    └── Accessibility Tests (*.accessibility.test.tsx)
            └── Component rendering + a11y checks
```

### Test Runner Configuration

- **Runner**: Vitest 4
- **Environment**: jsdom (browser-like DOM for component tests)
- **React Testing**: `@testing-library/react` + `@testing-library/jest-dom`
- **Property Testing**: `fast-check` (randomized input generation)

## Key Files

| File | Responsibility |
|------|---------------|
| `vitest.config.ts` (or in `vite.config.ts`) | Vitest configuration |
| `src/**/*.test.ts` | Unit tests (logic) |
| `src/**/*.test.tsx` | Unit tests (components) |
| `src/**/*.property.test.ts` | Property-based tests |
| `src/**/*.integration.test.ts` | Integration tests |
| `src/**/*.accessibility.test.tsx` | Accessibility tests |

## Test Categories

### Unit Tests (`*.test.ts` / `*.test.tsx`)

Standard assertion-based tests that verify specific behavior:
- Function input/output contracts
- Edge cases and boundary conditions
- Component rendering and user interactions
- Error handling paths

**Coverage areas:**
- `gameValidator.test.ts` — File validation rules
- `gameNormalizer.test.ts` — Normalization correctness
- `playerNameValidation.test.ts` — Name validation rules
- `preferencesStore.test.ts` — localStorage read/write
- `analyticsUtils.test.ts` — Analytics computations
- `finalJeopardyValidation.test.ts` — FJ wager rules
- `finalJeopardyScoring.test.ts` — FJ score calculations
- `gameNameUtils.test.ts` — Name utilities
- `leaderboardUtils.test.ts` — Sort/compute utilities
- `cheatSheetVisibility.test.ts` — Visibility logic
- `retry.test.ts` — Retry utility
- `sessionIdGenerator.test.ts` — ID generation
- `draftValidation.test.ts` — Draft data validation
- `settingsApi.test.ts` — Settings operations
- `useGameSession.test.ts` — Session hook behavior
- `useBuzzer.test.ts` — Buzzer hook behavior
- `useFinalJeopardyEntry.test.ts` — FJ entry hook
- `useSessionQR.test.ts` — QR generation hook
- `useRandomGamePicker.test.ts` — Random picker hook
- `ProfileGuard.test.tsx` — Auth guard component
- `RoundsSelector.test.tsx` — Selector component
- `ToggleSwitch.test.tsx` — Toggle component

### Property-Based Tests (`*.property.test.ts`)

Use `fast-check` to generate random inputs and verify invariants hold for all possible inputs. More thorough than example-based testing — catches edge cases humans wouldn't think to write.

**Coverage areas and their properties:**

| File | Key Properties Verified |
|------|------------------------|
| `buzzerLogic.property.test.ts` | Buzz eligibility rules hold for all state combinations |
| `gameApi.property.test.ts` | Save/update operations maintain data integrity |
| `analyticsUtils.property.test.ts` | Timeline ordinals are monotonic, accuracy never exceeds 100% |
| `builderConversion.property.test.ts` | Conversion preserves all clue data |
| `builderFormStructure.property.test.ts` | Form structure invariants |
| `builderValidation.property.test.ts` | Validation rejects all invalid states |
| `clueValues.property.test.ts` | Values scale correctly per round |
| `coopScoring.property.test.ts` | Pool deltas are reversible, target computation correct |
| `draftApi.property.test.ts` | Draft operations maintain consistency |
| `favoritesApi.property.test.ts` | Add/remove are idempotent as expected |
| `finalJeopardyScoring.property.test.ts` | FJ scoring is symmetric |
| `finalJeopardyValidation.property.test.ts` | Wager ranges are correct for all scores |
| `gameApi.property.test.ts` | Game save/update contracts |
| `gameSorting.property.test.ts` | Sort output is always ordered correctly |
| `mediaApi.property.test.ts` | Validation accepts/rejects correct file types |
| `playerNameValidation.property.test.ts` | All invalid names rejected, valid names accepted |
| `playerProfile.property.test.ts` | Profile operations |
| `preferencesStore.property.test.ts` | Read always returns valid preferences for any localStorage content |
| `ratingsApi.property.test.ts` | Rating values validated correctly |
| `sessionIdGenerator.property.test.ts` | IDs are always correct length, unique |
| `sessionRegistration.property.test.ts` | Registration contracts |
| `storageMigration.property.test.ts` | Migration preserves data |
| `StarRating.property.test.tsx` | Renders correctly for all valid rating values |

### Integration Tests (`*.integration.test.ts`)

Tests that verify behavior across multiple system boundaries (with mocked external services):

- `draftApi.integration.test.ts` — Full draft lifecycle (create → save → resume → delete)
- `settingsApi.test.ts` (partial integration) — Settings operations with mocked Supabase

### Accessibility Tests (`*.accessibility.test.tsx`)

- `Builder.accessibility.test.tsx` — Verifies the builder UI meets accessibility requirements

## Property Testing Patterns

### Arbitrary Generation

`fast-check` generates random test inputs. Common patterns in this codebase:

```typescript
// Generate valid player names
const playerNameArb = fc.string({ minLength: 1, maxLength: 50 })
  .filter(name => /^[\w\s-]+$/.test(name))

// Generate valid ratings
const ratingArb = fc.integer({ min: 1, max: 5 })

// Generate game state combinations
const buzzStateArb = fc.record({
  clueActive: fc.boolean(),
  queue: fc.array(buzzEventArb),
  lockedOut: fc.array(fc.string()),
  systemLocked: fc.boolean(),
})
```

### Invariant Assertions

Property tests assert that invariants hold regardless of input:
- "Sorted output is always in the correct order"
- "Reversal of a marking is the exact inverse of the original"
- "Score timeline ordinals are monotonically increasing"
- "Board total equals sum of all clue values"

## Running Tests

| Command | Purpose |
|---------|---------|
| `npm run test` | Lint + run all tests once (CI mode) |
| `npm run test:watch` | Watch mode for development |
| `vitest run src/` | Run tests without linting |
| `vitest run src/utils/coopScoring` | Run tests for a specific file/pattern |

### Pre-test Linting

The `test` script runs ESLint before Vitest (`eslint . && vitest run src/`), ensuring code quality gates are enforced before tests execute.

## Mocking Patterns

### Supabase Client Mocking

Tests mock the Supabase client to avoid real API calls:
```typescript
vi.mock('../utils/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    // ... chain mocking
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: mockSession } }),
    },
  },
}))
```

### Channel Mocking

For realtime tests, channels are mocked:
```typescript
const mockChannel = {
  send: vi.fn(),
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn(),
  track: vi.fn(),
  presenceState: vi.fn().mockReturnValue({}),
}
```

## Dependencies

| Package | Usage |
|---------|-------|
| `vitest` | Test runner and assertion library |
| `jsdom` | Browser-like DOM environment for component tests |
| `@testing-library/react` | Component rendering and interaction utilities |
| `@testing-library/jest-dom` | Extended DOM assertions (toBeInTheDocument, etc.) |
| `fast-check` | Property-based testing framework |

## Test Coverage Areas vs. Gaps

### Well-Covered
- Scoring logic (all toggles, reversals, co-op)
- Validation (game files, player names, wagers, ratings)
- Buzzer eligibility logic
- Analytics computations
- Builder conversion/validation
- Preferences store
- Session ID generation
- Sorting/filtering utilities

### Areas That Could Use More Coverage
- GamePage integration (complex component with many state interactions)
- End-to-end multiplayer flows (host + player together)
- Display mode (shelved, tests exist but may be stale)
- Full accessibility audit across all pages
- Visual regression testing

## Best Practices Observed

1. **Co-location**: Test files live next to the code they test
2. **Naming convention**: `.test.ts` for units, `.property.test.ts` for properties, `.integration.test.ts` for integration
3. **Pure function preference**: Scoring and validation logic extracted into pure functions for easy testing
4. **Deterministic tests**: Property tests use seeded generators for reproducibility
5. **No network calls**: All external services mocked in tests
