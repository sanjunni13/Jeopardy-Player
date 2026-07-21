# Game Creation & Builder System

## Purpose

The Game Creation system provides three distinct paths for users to create Jeopardy games: uploading a pre-made JSON file, using an interactive board-style editor (the Builder), or generating games with AI. The Builder in particular offers a full-featured, auto-saving editor with draft persistence, media attachments, and comprehensive validation — lowering the barrier to creating custom games.

## Architecture Overview

### Three Creation Paths

```
CreateGamePage.tsx
    ├── Upload JSON ──────── UploadPage.tsx
    ├── Board Builder ────── BuilderPage.tsx (interactive editor)
    └── AI Generation ────── GenerateGamePage.tsx (3 generation modes)
```

### Data Pipeline

Regardless of creation method, all games ultimately go through:

```
Raw Input → Validation → Normalization → Storage Upload → Database Insert
```

- **Validation**: Ensures structural correctness (valid categories, clues, values)
- **Normalization**: Converts any key format (numeric or word) to consistent `NormalizedGame`
- **Storage**: Game JSON uploaded to Supabase Storage at `{authUuid}/{gameName}.json`
- **Database**: Metadata row inserted into `games` table

## Key Files

| File | Responsibility |
|------|---------------|
| `src/routes/pages/CreateGamePage.tsx` | Method selection page |
| `src/routes/pages/UploadPage.tsx` | JSON file upload flow |
| `src/routes/pages/BuilderPage.tsx` | Board-style editor page |
| `src/routes/pages/GenerateGamePage.tsx` | AI generation interface |
| `src/hooks/useBuilderState.ts` | Builder form state management |
| `src/hooks/useDraftPersistence.ts` | Auto-save draft to Supabase |
| `src/utils/gameValidator.ts` | JSON file validation (async, reads file) |
| `src/utils/gameNormalizer.ts` | Converts raw → NormalizedGame |
| `src/utils/builderValidation.ts` | Builder-specific form validation |
| `src/utils/builderConversion.ts` | Builder form → NormalizedGame conversion |
| `src/utils/builderFormStructure.ts` | Builder form shape utilities |
| `src/utils/draftApi.ts` | Draft CRUD (Supabase storage + drafts table) |
| `src/utils/draftValidation.ts` | Draft data validation |
| `src/utils/gameApi.ts` | `saveGame()` — final persist to games table + storage |
| `src/utils/mediaApi.ts` | Clue media upload/delete/refresh |
| `src/utils/generateApi.ts` | AI generation API calls |
| `src/utils/gameNameUtils.ts` | Game name formatting/validation utilities |

## Upload System

### Flow
1. User selects a `.json` file (max 5 MB)
2. `validateGameFile(file)` parses and validates structure:
   - Checks for top-level `game` key
   - Validates round keys (numeric `1,2,3...` or word `single,double,triple...`)
   - Ensures contiguous sequence (no gaps)
   - Validates `final` round (category, clue, solution all non-empty)
   - Validates each clue: numeric value ≥ 1, non-empty clue text, non-empty solution
3. `normalizeGame(raw)` converts to `NormalizedGame`
4. User names the game → `saveGame()` persists to storage + DB

### Supported Game File Formats

Two key formats are accepted:
- **Numeric keys**: `{ "game": { "1": [...], "2": [...], "final": {...} } }`
- **Word keys**: `{ "game": { "single": [...], "double": [...], "final": {...} } }`

Both are normalized to word-descriptor keys internally.

## Board-Style Builder

### State Management (`useBuilderState`)

The builder maintains a complex form state representing:
- Multiple rounds (1-6)
- Multiple categories per round
- Multiple clues per category (with value, clue text, solution, dailyDouble flag, media)
- Final Jeopardy section (category, clue, solution)

### Draft Persistence (`useDraftPersistence`)

- **Auto-save**: Drafts are automatically saved to Supabase Storage as the user edits
- **Storage path**: `{authUuid}/drafts/{draftId}.json`
- **Metadata**: A row in the `drafts` table tracks draft name, creation date, last modified
- **Resume**: Users can resume editing from `UnfinishedGamesLibrary` or via URL (`/create/builder/$draftId`)

### Builder Validation (`builderValidation.ts`)

Validates the form before allowing save:
- All categories have non-empty names
- All clues have value ≥ 1, non-empty text, non-empty solution
- Final Jeopardy has all required fields
- At least one round with at least one category

### Builder Conversion (`builderConversion.ts`)

Transforms the builder's form state into a `NormalizedGame` compatible with the rest of the system.

### Media Attachments

The builder supports attaching media to individual clues:

| Media Type | Max Size | Extensions |
|-----------|----------|------------|
| Images | 5 MB | .jpg, .jpeg, .png, .gif, .webp |
| Audio | 10 MB | .mp3 |
| YouTube | — | URL validation via regex |

**Storage path**: `{authUuid}/clue-media/{draftId}/{roundIndex}-{categoryIndex}-{clueIndex}/{sanitizedFileName}`

**URL handling**: Media uses signed URLs (7-day expiry) that are refreshed on access via `refreshMediaUrl()`.

## AI Game Generation

### Three Generation Modes

#### 1. Archive Mode (`generateArchiveGame`)
- Pulls random games from the Jeopardy Archive database
- Parameters: `rounds`, `categoriesPerRound`, `gameName`
- Edge Function: `generate-archive-game`

#### 2. Labs Mode (`generateLabsGame`)
- Generates games based on user-provided keywords
- Parameters: `keywords[]`, `gameName`
- Edge Function: `generate-labs-game`

#### 3. AI Mode (`generateAiGame`)
- Full AI-powered generation using Google GenAI
- Parameters: `rounds`, `categoriesPerRound`, `difficulty`, `dailyDoublesPerRound`, `specialRequests`, `gameName`
- Edge Function: `generate-ai-game`
- Includes rate limiting with `retryAfterSeconds` response

### Authentication Flow

All generation endpoints require an active auth session. The JWT access token is extracted and passed as a `Bearer` token in the `Authorization` header.

## Game Data Model

### Raw → Normalized Pipeline

```typescript
// Raw file shape (as uploaded)
interface GameFile {
  game: Record<string, RawCategory[] | RawFinalRound>
}

// After normalization
interface NormalizedGame {
  rounds: Record<RoundName, Category[]>  // 'single' | 'double' | ... | 'sextuple'
  final: FinalRound
  totalRounds: number
}
```

### Supported Round Names

Games support 1-6 rounds: `single`, `double`, `triple`, `quadruple`, `quintuple`, `sextuple`.

### Clue Structure

```typescript
interface Clue {
  value: number        // Point value (always ≥ 1)
  clue: string         // The question/prompt text
  solution: string     // The correct answer
  dailyDouble: boolean // Whether this is a Daily Double
  html: boolean        // Whether clue text contains HTML
}
```

## Game Name Validation

- Pattern: `/^[\w\s\\-]{1,100}$/` — letters, numbers, spaces, hyphens, underscores
- Length: 1-100 characters
- Uniqueness: Case-insensitive, scoped to the creating user (by Player ID)

## Dependencies

| Package | Usage |
|---------|-------|
| `@supabase/supabase-js` | Storage upload, database operations |
| `@google/genai` | AI game generation (used by edge functions) |
| `react-player` | YouTube embed preview in builder |
| `qrcode` | (indirect, used post-creation for sessions) |

## Related UI Components

### Builder Components (`src/components/builder/`)
- `BuilderForm.tsx` — Main form container
- `RoundSection.tsx` — Individual round editor
- `CategorySection.tsx` — Category name + clue list editor
- `ClueRow.tsx` — Single clue input row (value, text, solution, DD toggle)
- `FinalJeopardySection.tsx` — FJ editor
- `RoundTabs.tsx` — Tab navigation between rounds
- `BuilderToolbar.tsx` — Save, validate, export actions
- `MediaAttachment.tsx` — File upload / YouTube URL input for clue media
- `ExitGuardDialog.tsx` — Unsaved changes warning
- `DeleteConfirmationDialog.tsx` — Draft deletion confirmation
- `UnfinishedGamesLibrary.tsx` — Resume or delete existing drafts

### Pages
- `CreateGamePage.tsx` — Choose creation method (upload, builder, AI)
- `BuilderPage.tsx` — Full builder interface (new or resume from draft)
- `UploadPage.tsx` — JSON file upload with validation feedback
- `GenerateGamePage.tsx` — AI generation form with mode selection

## UX Interactions

- **Upload**: Drag-and-drop or file picker → immediate validation feedback → name prompt → save
- **Builder**: Tabbed interface per round, inline editing, auto-save indicator, media attachments with preview
- **AI Generation**: Form with sliders/inputs → generation in progress state → success redirect to library
- **Draft Resume**: Game library shows "Unfinished Games" section with resume/delete options
- **Exit Guard**: Warns user about unsaved changes when navigating away from builder
