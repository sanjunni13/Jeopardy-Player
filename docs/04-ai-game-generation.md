# AI Game Generation System

## Purpose

The AI Game Generation system allows users to create complete Jeopardy games without manual content entry. It provides three distinct generation modes — pulling from a historical Jeopardy archive, keyword-driven generation, and fully AI-powered custom generation — each backed by a Supabase Edge Function that handles the server-side logic.

## Architecture Overview

```
Client (GenerateGamePage.tsx)
    │
    ├── generateArchiveGame()  ──→  Supabase Edge Function: generate-archive-game
    ├── generateLabsGame()     ──→  Supabase Edge Function: generate-labs-game
    └── generateAiGame()       ──→  Supabase Edge Function: generate-ai-game
                                              │
                                              ├── Reads from J-Archive database (archive mode)
                                              ├── Uses keyword matching (labs mode)
                                              └── Calls Google GenAI API (AI mode)
                                              │
                                              └── Returns { success: true, id: string }
                                                   or { error: string }
```

All endpoints follow the same pattern:
1. Client authenticates via Supabase Auth session
2. Sends POST request with JWT in Authorization header
3. Edge function processes the request, generates game data, saves to storage + DB
4. Returns the new game's ID for client-side redirect

## Key Files

| File | Responsibility |
|------|---------------|
| `src/utils/generateApi.ts` | Client-side API wrapper for all three generation modes |
| `src/routes/pages/GenerateGamePage.tsx` | UI for selecting mode and configuring parameters |

## Generation Modes

### 1. Archive Mode (In-Depth)

**Function**: `generateArchiveGame(rounds, categoriesPerRound, gameName)`

**Purpose**: Pulls real historical Jeopardy categories and clues from a pre-processed J-Archive database stored in Supabase Storage. Produces authentic-feeling games with actual trivia from the TV show.

**Parameters**:
- `rounds` (number, 1-6) — How many rounds to include
- `categoriesPerRound` (number, 1-6) — Categories per round
- `gameName` (string) — Display name for the game

**Edge Function**: `generate-archive-game`

#### How Archive Mode Works (Server-Side)

1. **Data Source**: Pre-processed category data stored in Supabase Storage (`data` bucket) as chunked JSON files:
   - `category_analysis/single_chunks_manifest.json` — lists how many chunks exist for single-round categories
   - `category_analysis/single_chunk_000.json`, `..._001.json`, etc. — actual category data
   - `category_analysis/double_chunks_manifest.json` + chunks — double-round categories
   - `category_analysis/final_chunks_manifest.json` + chunks — Final Jeopardy categories

2. **Random Chunk Selection**: For each round type, a random chunk file is selected:
   - Reads the manifest to learn how many chunks exist
   - Picks a random chunk index → downloads that chunk
   - Each chunk contains a dictionary of categories with their clues

3. **Category Assignment**:
   - Round 1 draws from `single_categories` data source
   - Rounds 2+ draw from `double_categories` data source
   - Categories are selected randomly from available keys (no duplicates via `usedCategoryNames` set)
   - If not enough unique categories exist, returns an error

4. **Clue Value Assignment**: Point values are calculated as `roundNumber × (clueIndex + 1) × 200`:
   - Round 1: 200, 400, 600, 800, 1000
   - Round 2: 400, 800, 1200, 1600, 2000
   - Round 3: 600, 1200, 1800, 2400, 3000
   - etc.

5. **Daily Double Placement** (per round):
   - Eligible positions: clues with `value >= roundNumber × 600` (3rd tier or higher)
   - Uses **weighted random selection** favoring higher-value clues
   - Places 2 DDs per round in different categories
   - Fallback: if only one category has eligible positions, places just 1 DD

6. **Final Jeopardy**: Random selection from the `final_categories` chunk — picks one random category and uses its first clue.

7. **Persistence**: Uploads game JSON to storage at `{authUuid}/{gameName}.json`, inserts DB row with `source: 'archive'`.

---

### 2. Labs Mode (In-Depth)

**Function**: `generateLabsGame(keywords, gameName)`

**Purpose**: Scrapes [JeopardyLabs.com](https://jeopardylabs.com) for user-created games matching the provided keywords, then assembles a complete game from the scraped categories. Produces keyword-themed games with community-sourced content.

**Parameters**:
- `keywords` (string[]) — Topic keywords to search for
- `gameName` (string) — Display name for the game

**Edge Function**: `generate-labs-game`

#### How Labs Mode Works (Server-Side)

1. **Game Slug Discovery** (`fetchGameSlugs`):
   - For each keyword, fetches `https://jeopardylabs.com/browse/?q={keyword}`
   - Parses the HTML response to extract game slugs from `/play/{slug}` links
   - Collects up to 10-20 unique slugs per keyword (fewer keywords = more slugs per keyword)
   - Uses random User-Agent rotation and 500-1500ms delays between requests

2. **Game Scraping** (`scrapeGame`):
   - For each discovered slug, fetches `https://jeopardylabs.com/play/{slug}`
   - Parses HTML DOM using `deno_dom` (Deno-compatible DOM parser)
   - Extracts categories from `.cell-group` elements with `data-category` attributes
   - Clues come from `.front.answer` elements, solutions from `.back.question` elements
   - Random delays between scrape requests (500-1500ms)

3. **Category Validation** (`buildValidCategories`):
   - Only keeps categories with exactly 5 valid clues
   - If fewer than 12 valid categories found, relaxes requirement to 3+ clues (pads to 5)
   - Detects HTML content in clues and sets `html: true` flag appropriately

4. **Game Assembly**:
   - **Ideal path** (12+ valid categories): Builds 2 rounds (single + double) with 6 categories each
   - **Relaxed path** (6-11 categories): Builds a single-round game with available categories
   - **Failure** (<6 categories): Returns error with count of what was found vs. needed
   - Final Jeopardy sourced from unused categories (fallback: last clue from last category)

5. **Point Value Assignment**:
   - Single round: 200, 400, 600, 800, 1000
   - Double round: 400, 800, 1200, 1600, 2000

6. **Daily Double Placement**:
   - 2 DDs per round from different categories
   - Single round eligible: `value >= 600`
   - Double round eligible: `value >= 1200`
   - Uses Fisher-Yates shuffle for random placement

7. **Persistence**: Uploads with `source: 'labs'`, game name defaults to `labs_{keywords-slug}_{timestamp}` if not provided.

#### Labs Mode Limitations
- Depends on JeopardyLabs.com being available
- Scraping can fail if the site changes its HTML structure
- Some scraped clues may be low quality (user-generated content)
- Always produces exactly 2 rounds (or 1 if insufficient data)

---

### 3. AI Mode — Full Custom (In-Depth)

**Function**: `generateAiGame(params)`

**Purpose**: Full AI-powered generation using Google's Gemini API. Produces entirely original, high-quality clues tailored to the user's specifications with configurable difficulty.

**Parameters** (`GenerateAiGameParams`):
- `rounds` (number, 1-6) — Number of rounds
- `categoriesPerRound` (number, 1-6) — Categories per round
- `difficulty` (number, 1-10) — Difficulty level with descriptive mapping
- `dailyDoublesPerRound` (number, 0 to categoriesPerRound) — DDs per round
- `specialRequests` (string, max 500 chars) — Free-text instructions for the AI
- `gameName` (string) — Display name for the game

**Edge Function**: `generate-ai-game`

#### How AI Mode Works (Server-Side)

1. **Rate Limiting**:
   - 10 requests per 60-minute sliding window per user
   - Tracked in a `rate_limits` table: `{ user_id, function_name, requested_at }`
   - On limit exceeded: returns `{ error, retryAfterSeconds }` (HTTP 429)
   - Each successful request inserts a rate limit record

2. **Difficulty Scale** (mapped to descriptive prompts):

   | Level | Description |
   |-------|-------------|
   | 1 | Very easy — elementary-level trivia |
   | 2 | Easy — simple facts most people learn by middle school |
   | 3 | Casual — straightforward general knowledge, like an easy pub quiz |
   | 4 | Average — standard trivia night level |
   | 5 | Standard Jeopardy — typical TV show difficulty |
   | 6 | Above average — competitive trivia league level |
   | 7 | Challenging — specific knowledge or clever wordplay |
   | 8 | Difficult — Tournament of Champions level |
   | 9 | Very challenging — obscure-but-guessable, quiz bowl final rounds |
   | 10 | Expert trivia — hardest fun trivia, would stump most casual players |

3. **Prompt Construction**: A detailed system prompt instructs the model to:
   - Generate exactly `rounds × categoriesPerRound` categories + 1 Final Jeopardy
   - Each category must have exactly 5 clues in classic Jeopardy style
   - All category names must be unique
   - Clues scaled to the specified difficulty level
   - Special requests incorporated when provided
   - Output as structured JSON with `categories[]` and `final` fields

4. **Model Fallback Chain**: Tries multiple Gemini models in order until one succeeds:
   ```
   gemini-2.5-flash-lite → gemini-2.5-flash → gemini-2.5-pro →
   gemini-3.5-flash → gemini-3.1-pro-preview → gemini-3.1-flash-lite →
   gemini-3-flash-preview → gemini-2.0-flash → gemini-2.0-flash-lite →
   gemini-1.5-flash → gemini-1.5-flash-8b → gemini-1.5-pro
   ```
   - Each model gets a 60-second timeout (AbortController)
   - Skips to next model on: 503 (overloaded), 429 (rate limited), timeout, or unparseable response
   - Uses `responseMimeType: 'application/json'` for structured output

5. **Response Validation** (`validateGeminiResponse`):
   - Verifies the correct number of categories
   - Ensures each category has exactly 5 clues
   - Validates all required fields are present and non-empty

6. **Game Building** (`buildGame`):
   - Assigns point values per round (same scaling as Archive mode)
   - Places Daily Doubles at configured count per round
   - Produces a complete `NormalizedGame` object

7. **Persistence**: Uploads with `source: 'ai'`, game name defaults to `ai_{timestamp}` if not provided.

## Response Types

### Success
```typescript
interface GenerateResponse {
  success: true
  id: string  // The saved game's database ID
}
```

### Error
```typescript
interface GenerateErrorResponse {
  error: string
}
```

### Rate Limit (AI mode only)
```typescript
interface RateLimitErrorResponse {
  error: string
  retryAfterSeconds: number  // How long to wait before retrying
}
```

## Authentication Flow

Every generation request requires an active Supabase Auth session:

```typescript
const { data: { session } } = await supabase.auth.getSession()
const token = session?.access_token
// If no token → return { error: 'Not authenticated' }

// Otherwise, include in request:
headers: {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
}
```

The edge function validates the token server-side and uses the authenticated user's ID for file storage paths.

## Error Handling

- **No auth session**: Returns `{ error: 'Not authenticated' }` immediately (no network call)
- **Network failure**: Caught by try/catch in the edge function; returns error response
- **Rate limiting** (AI mode): Returns `retryAfterSeconds` so the UI can display a countdown
- **Generation failure**: Edge function returns descriptive error message

## Dependencies

| Package | Usage |
|---------|-------|
| `@supabase/supabase-js` | Auth session retrieval, fetch to edge functions |
| `@google/genai` | Google Generative AI (used server-side in AI mode edge function) |

### Edge Function Dependencies (Deno Runtime)

| Import | Usage |
|--------|-------|
| `deno_dom` (DOMParser) | HTML parsing for Labs mode web scraping |
| `@supabase/supabase-js` (ESM) | Service-role Supabase client in edge functions |
| Deno `std/http/server` | HTTP server framework for edge functions |
| Gemini REST API | Direct HTTP calls to `generativelanguage.googleapis.com` |

### Environment Variables (Edge Functions)

| Variable | Used By | Purpose |
|----------|---------|---------|
| `SUPABASE_URL` | All | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | All | Server-side admin access |
| `GEMINI_API_KEY` | AI mode only | Google Gemini API authentication |

## Related UI Components

- `src/routes/pages/GenerateGamePage.tsx` — Mode selection, parameter forms, generation progress
- Generation success redirects to the Game Library where the new game appears

## UX Interactions

- **Mode selection**: User chooses between Archive, Labs, or AI tabs/cards on the GenerateGamePage
- **Archive mode**: Simple form with round count and categories-per-round dropdowns + game name input. Fast generation (no AI latency).
- **Labs mode**: Keyword tag input (multi-value) + game name. Moderate wait time (web scraping). May fail if keywords yield insufficient results.
- **AI mode**: Rich form with sliders/dropdowns for rounds, categories, difficulty (1-10 scale with descriptions), DD count, and a textarea for special requests + game name.
- **Loading state**: Progress indicator while edge function processes. AI mode takes 10-30+ seconds depending on model availability.
- **Rate limit (AI mode)**: Shows countdown timer with exact seconds until retry is allowed. Prevents button click until expired.
- **Error handling**: Inline error messages for each failure mode:
  - "No games found for the provided keywords" (Labs)
  - "Not enough unique categories available" (Archive)
  - "AI generation failed after trying all models" (AI)
  - "Rate limit exceeded. Try again later." (AI)
- **Success**: Redirects to the new game in the library immediately after generation completes
