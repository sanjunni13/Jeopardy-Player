# Jeopardy Player — System Documentation

This directory contains detailed documentation for every major system within the Jeopardy Player application.

## Systems Index

| # | System | Description |
|---|--------|-------------|
| 01 | [Real-Time Multiplayer Session](./01-realtime-multiplayer-session.md) | Supabase Realtime channels, buzzer protocol, presence, reconnection |
| 02 | [Game Scoring & Special Toggles](./02-game-scoring-and-toggles.md) | `applyModifiers()`, wagering, streaks, steal bonus, penalty doubler, co-op, timed clues |
| 03 | [Game Creation & Builder](./03-game-creation-and-builder.md) | JSON upload, board-style editor, draft persistence, media attachments |
| 04 | [AI Game Generation](./04-ai-game-generation.md) | Archive, Labs, and AI generation modes via Edge Functions |
| 05 | [Game Library](./05-game-library.md) | Browse, search, sort, filter, game details, random picker |
| 06 | [Final Jeopardy](./06-final-jeopardy.md) | Wager/answer flow, host reveal, competitive + co-op variants |
| 07 | [Leaderboard & Statistics](./07-leaderboard-and-statistics.md) | Cumulative player stats, post-game updates, rankings |
| 08 | [Post-Game Analytics](./08-post-game-analytics.md) | Score timelines, category accuracy, comebacks, head-to-head, exports |
| 09 | [Authentication & Profiles](./09-authentication-and-profiles.md) | Supabase Auth, player profiles, route protection, account management |
| 10 | [Preferences & Settings](./10-preferences-and-settings.md) | Theme, reduced motion, defaults, localStorage persistence |
| 11 | [Ratings & Favorites](./11-ratings-and-favorites.md) | 1-5 star ratings, favorites, aggregation for library display |
| 12 | [UI Component Architecture](./12-ui-component-architecture.md) | Design system, Radix/shadcn, TailwindCSS, animations, icons |
| 13 | [Multi-Display Mode (Shelved)](./13-multi-display-mode.md) | TV display page, display protocol, un-shelving guide |
| 14 | [Database & Backend](./14-database-and-backend.md) | Supabase tables, storage, edge functions, environment config |
| 15 | [Testing Infrastructure](./15-testing-infrastructure.md) | Vitest, property tests, integration tests, mocking patterns |
| 16 | [Routing & Code-Splitting](./16-routing-and-code-splitting.md) | TanStack Router, lazy loading, auth guards, route hierarchy |

## Quick Reference

**Tech Stack**: React 19 · TypeScript 6 · Vite 8 · TailwindCSS 4 · Supabase · TanStack Router · Framer Motion · Recharts

**Test Command**: `npm run test` (lint + vitest)

**Dev Command**: `npm run dev` (lint + vite dev server)

**Build Command**: `npm run build` (tsc + vite build)
