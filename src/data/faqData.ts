export interface FAQItem {
  question: string
  answer: string
}

export interface FAQCategory {
  category: string
  items: FAQItem[]
}

// ─── Shared question pools ────────────────────────────────────────────────────

const buzzerFAQ: FAQItem[] = [
  {
    question: 'How does the buzzer system work?',
    answer:
      'The buzzer system allows players to buzz in from their own phones during gameplay. When a clue is displayed, the host unlocks the buzzers, and players can tap the BUZZ button on their device. The host sees a Buzz Queue showing who buzzed in and in what order.',
  },
  {
    question: 'How do players connect to the buzzer?',
    answer:
      'A QR code is displayed on the player entry screen and is also accessible via the "Buzzer Code" button during the game. Players scan the QR code on their phone, enter their name, and they are connected to the session. Their phone will show the buzzer interface.',
  },
  {
    question: 'What do the buttons in the Buzz Queue do?',
    answer:
      'The Buzz Queue panel shows who buzzed in first. "Unlock Buzzers" enables players to buzz in. "Lock Buzzers" prevents buzzing. "Clear Queue" resets the queue for a fresh round of buzzing. The buzzers automatically lock when a new clue is selected and when the answer is revealed.',
  },
]

const finalJeopardyFAQ: FAQItem[] = [
  {
    question: 'How does Final Jeopardy answer submission work?',
    answer:
      'During Final Jeopardy, connected players can submit their answer from their phone. The submission form unlocks once the host reveals the Final Jeopardy clue. After submitting, players see a confirmation and cannot change their answer. The host sees all submissions on the answer reveal screen.',
  },
  {
    question: 'Do players need to reconnect for Final Jeopardy?',
    answer:
      'No. If a player is already connected via the buzzer, their phone will automatically transition to the Final Jeopardy answer submission page when the host enters the Final Jeopardy phase. Players do not need to scan the QR code again.',
  },
  {
    question: 'What if a player has not connected before Final Jeopardy?',
    answer:
      'A QR code is shown on the screen just before Final Jeopardy begins as a last chance to join. Players can scan it at that point and will land directly on the answer submission page.',
  },
]

const answerSheetFAQ: FAQItem[] = [
  {
    question: 'What is the Answer Sheet and what does it do?',
    answer:
      'The Answer Sheet opens as a modal overlay within the game window displaying all answers organized by round and category. The host can open it by clicking the "Answer Sheet" button visible during active gameplay phases after player entry.',
  },
]

// ─── Per-page categorized FAQs ────────────────────────────────────────────────

export const createGameFAQ: FAQCategory[] = [
  {
    category: 'Game Builder',
    items: [
      {
        question: 'How do I create a custom game using the manual game builder?',
        answer:
          'Download the sample JSON template from this page and edit it with your own categories and clues. The file follows a specific structure with rounds, categories, and clue objects. Once ready, upload it via the Upload a Game page.',
      },
      {
        question: 'Can I save a draft of my game and finish it later?',
        answer:
          'Yes! You can manually save your draft in the game builder (or it auto-saves every minute for you), and then come back to finish it at a later time.',
      },
      {
        question: 'What file formats does the game builder accept?',
        answer:
          'The game builder can take images (.jpeg or .png), audio files (.mp3), or YouTube links. When you upload those files, the builder shows you a preview of them to ensure they are correct.',
      },
    ],
  },
  {
    category: 'JSON Structure',
    items: [
      {
        question: 'What fields are required for each clue?',
        answer:
          'Each clue object must include: value (a number representing the point value), clue (the question text shown to players), solution (the correct answer), dailyDouble (boolean), and html (boolean indicating if the clue contains HTML).',
      },
      {
        question: 'Are there limits on the number of categories or clues per round?',
        answer:
          'Each round can contain up to 6 categories, and you can have between 1 and 6 rounds total. Each category should have 5 clues with ascending point values. A Final Jeopardy round with a single category, clue, and solution is also required.',
      },
      {
        question: 'What format should round keys use in the JSON file?',
        answer:
          'Round keys use word descriptors: "single" for Round 1, "double" for Round 2, "triple" for Round 3, and so on. The game also requires a "final" object at the top level for Final Jeopardy.',
      },
    ],
  },
]

export const generateGameFAQ: FAQCategory[] = [
  {
    category: 'Generation Methods',
    items: [
      {
        question: 'What generation options are available?',
        answer:
          'There are three generation methods: J! Archive (pulls real historical Jeopardy data), JeopardyLabs (scrapes community-created games by keyword), and AI Generation (uses AI to create original categories and clues based on your preferences).',
      },
      {
        question: 'How does AI generation work?',
        answer:
          'AI generation lets you specify the number of rounds, categories per round, difficulty level, daily doubles per round, and special requests. The AI then creates a complete game with original clues tailored to your settings.',
      },
      {
        question: 'What difficulty levels are available for AI-generated games?',
        answer:
          'AI generation uses a 1 to 10 difficulty slider:\n\n1 — Very easy: elementary-level trivia almost anyone would know\n2 — Easy: simple facts most people learn by middle school\n3 — Casual: straightforward general knowledge, like an easy pub quiz\n4 — Average: standard trivia night level\n5 — Standard Jeopardy: typical TV show difficulty\n6 — Above average: competitive trivia league level\n7 — Challenging: requires specific knowledge or clever wordplay\n8 — Difficult: deep but fun, Tournament of Champions level\n9 — Very challenging: obscure-but-guessable, rewards well-read players\n10 — Expert trivia: the hardest fun trivia that would stump most casual players',
      },
      {
        question: 'How many keywords can I use for JeopardyLabs generation?',
        answer:
          'You can provide up to 10 keywords separated by commas, spaces, or newlines. The generator searches for community-created games matching those keywords and assembles a game from the results.',
      },
      {
        question: 'How many rounds and categories can I configure for Archive generation?',
        answer:
          'For J! Archive generation, you can select the number of rounds and the number of categories per round. The generator pulls real historical clues from past Jeopardy episodes to fill your game.',
      },
    ],
  },
  {
    category: 'Answer Sheet',
    items: [
      {
        question: 'What is the Answer Sheet?',
        answer:
          'The Answer Sheet is a feature that allows the host to view all correct answers during gameplay without affecting the game state. It opens as a modal overlay within the game page displaying all answers organized by round and grouped by category. The host can access it by clicking the "Answer Sheet" button visible during gameplay. This button is only available for generated games (games created via J! Archive, JeopardyLabs, or AI Generation).',
      },
    ],
  },
  {
    category: 'Buzzers',
    items: buzzerFAQ,
  },
  {
    category: 'Final Jeopardy',
    items: finalJeopardyFAQ,
  },
]

export const uploadGameFAQ: FAQCategory[] = [
  {
    category: 'Uploading',
    items: [
      {
        question: 'What file formats are supported for upload?',
        answer:
          'Only JSON (.json) files are supported. The file must follow the required game structure with rounds, categories, clues, and a Final Jeopardy section.',
      },
      {
        question: 'What validation rules does the upload process check?',
        answer:
          'The validator checks that your JSON has the correct structure: a top-level "game" key, valid round keys, categories with names and clues arrays, and a "final" object. Each clue must have value, clue, solution, dailyDouble, and html fields.',
      },
      {
        question: 'How do I fix upload errors?',
        answer:
          'If you see a validation error, check your JSON file against the sample template. Common issues include missing required fields, incorrect round key names, or malformed JSON syntax. Fix the file locally and try uploading again.',
      },
      {
        question: 'What happens if I upload a game with a duplicate name?',
        answer:
          'If a game with the same name already exists in your library, the upload will be rejected with an error message. You can rename your JSON file and try again, or find the existing game in your library.',
      },
    ],
  },
  {
    category: 'Answer Sheet',
    items: answerSheetFAQ,
  },
  {
    category: 'Buzzers',
    items: buzzerFAQ,
  },
  {
    category: 'Final Jeopardy',
    items: finalJeopardyFAQ,
  },
]

export const gameLibraryFAQ: FAQCategory[] = [
  {
    category: 'Games',
    items: [
      {
        question: 'How do I set up a multiplayer game session?',
        answer:
          'After selecting a game from your library, you will enter the player entry phase where you can add player names. Once all players are registered, start the game and players can buzz in using the integrated buzzer system.',
      },
      {
        question: 'How does scoring work during a game?',
        answer:
          'Players earn points equal to the clue value for correct answers and lose the same amount for incorrect answers. The host controls scoring by marking responses as correct or incorrect. Scores accumulate across all rounds.',
      },
      {
        question: 'What are Daily Doubles and how do they work?',
        answer:
          'Daily Doubles are special clues where only the player who selected it can respond. Before seeing the clue, the player must wager an amount up to their current score (or a minimum wager if their score is low). The wager is added or subtracted based on their answer.',
      },
      {
        question: 'How do rounds work in a game?',
        answer:
          'Games progress through rounds sequentially: Single Jeopardy, Double Jeopardy, and so on. Point values typically increase each round. After all clues in a round are played, the game transitions to the next round. The final round is always Final Jeopardy.',
      },
      {
        question: 'Can I replay a game from my library?',
        answer:
          'Yes, you can play any game in your library as many times as you like. Each play session starts fresh with new players and scores. Your game data is never modified by playing it.',
      },
    ],
  },
  {
    category: 'Answer Sheet',
    items: answerSheetFAQ,
  },
  {
    category: 'Buzzers',
    items: buzzerFAQ,
  },
  {
    category: 'Final Jeopardy',
    items: finalJeopardyFAQ,
  },
]
