export interface FAQItem {
  question: string
  answer: string
}

export const createGameFAQ: FAQItem[] = [
  {
    question: 'How do I create a custom game using the manual game builder?',
    answer:
      'Download the sample JSON template from this page and edit it with your own categories and clues. The file follows a specific structure with rounds, categories, and clue objects. Once ready, upload it via the Upload a Game page.',
  },
  {
    question: 'Can I save a draft of my game and finish it later?',
    answer:
      'Currently, games are saved to your library only after a successful upload. To save your progress, keep your JSON file locally and upload it when you are done editing. A full in-app draft system is coming in a future update.',
  },
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
]

export const generateGameFAQ: FAQItem[] = [
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
      'You can choose from multiple difficulty levels when using AI generation. The difficulty affects how challenging the clues will be, ranging from casual trivia to expert-level questions.',
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
  {
    question: 'What is the Cheat Sheet?',
    answer:
      'The Cheat Sheet is a feature that allows the host to view all correct answers during gameplay without affecting the game state. It opens as a modal overlay within the game page displaying all answers organized by round and grouped by category. The host can access it by clicking the "Cheat Sheet" button visible during gameplay. This button is only available for generated games (games created via J! Archive, JeopardyLabs, or AI Generation).',
  },
]

export const uploadGameFAQ: FAQItem[] = [
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
]

export const gameLibraryFAQ: FAQItem[] = [
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
  {
    question: 'What is the Cheat Sheet and what does it do?',
    answer:
      'The Cheat Sheet opens as a modal overlay within the game window displaying all answers organized by round and category. The host can open it by clicking the "Cheat Sheet" button visible during active gameplay phases after player entry.',
  },
]
