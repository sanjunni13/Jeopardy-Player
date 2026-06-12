import type { GameFile } from '../types/game';

/**
 * Sample game template conforming to the GameFile format.
 * Users can download this as a starting point to create their own Jeopardy games.
 * This file can be uploaded directly via the Upload page without modification.
 */
export const sampleGame: GameFile = {
  game: {
    single: [
      {
        category: 'Science',
        clues: [
          { value: 200, clue: 'This gas makes up about 78% of Earth\'s atmosphere.', solution: 'What is nitrogen?', dailyDouble: false, html: false },
          { value: 400, clue: 'This planet is known as the Red Planet.', solution: 'What is Mars?', dailyDouble: false, html: false },
          { value: 600, clue: 'This element has the atomic number 79 and is a precious metal.', solution: 'What is gold?', dailyDouble: false, html: false },
          { value: 800, clue: 'This force keeps planets in orbit around the Sun.', solution: 'What is gravity?', dailyDouble: true, html: false },
          { value: 1000, clue: 'This scientist developed the theory of general relativity.', solution: 'Who is Albert Einstein?', dailyDouble: false, html: false },
        ],
      },
      {
        category: 'History',
        clues: [
          { value: 200, clue: 'This ancient civilization built the Great Pyramids of Giza.', solution: 'What is ancient Egypt?', dailyDouble: false, html: false },
          { value: 400, clue: 'This document was signed in 1776 declaring independence from Britain.', solution: 'What is the Declaration of Independence?', dailyDouble: false, html: false },
          { value: 600, clue: 'This wall divided Berlin from 1961 to 1989.', solution: 'What is the Berlin Wall?', dailyDouble: false, html: false },
          { value: 800, clue: 'This empire was ruled by Julius Caesar before his assassination in 44 BC.', solution: 'What is the Roman Empire?', dailyDouble: false, html: false },
          { value: 1000, clue: 'This explorer is credited with the first circumnavigation of the globe.', solution: 'Who is Ferdinand Magellan?', dailyDouble: false, html: false },
        ],
      },
      {
        category: 'Pop Culture',
        clues: [
          { value: 200, clue: 'This streaming service released "Stranger Things" in 2016.', solution: 'What is Netflix?', dailyDouble: false, html: false },
          { value: 400, clue: 'This band performed "Bohemian Rhapsody."', solution: 'Who is Queen?', dailyDouble: false, html: false },
          { value: 600, clue: 'This director is known for films like "Inception" and "The Dark Knight."', solution: 'Who is Christopher Nolan?', dailyDouble: true, html: false },
          { value: 800, clue: 'This video game franchise features a plumber named Mario.', solution: 'What is Super Mario Bros.?', dailyDouble: false, html: false },
          { value: 1000, clue: 'This actress played Katniss Everdeen in "The Hunger Games."', solution: 'Who is Jennifer Lawrence?', dailyDouble: false, html: false },
        ],
      },
      {
        category: 'Geography',
        clues: [
          { value: 200, clue: 'This is the longest river in the world.', solution: 'What is the Nile River?', dailyDouble: false, html: false },
          { value: 400, clue: 'This country is both a continent and an island.', solution: 'What is Australia?', dailyDouble: false, html: false },
          { value: 600, clue: 'This mountain is the tallest in the world measured from sea level.', solution: 'What is Mount Everest?', dailyDouble: false, html: false },
          { value: 800, clue: 'This desert is the largest hot desert on Earth.', solution: 'What is the Sahara Desert?', dailyDouble: false, html: false },
          { value: 1000, clue: 'This European country is shaped like a boot.', solution: 'What is Italy?', dailyDouble: false, html: false },
        ],
      },
      {
        category: 'Literature',
        clues: [
          { value: 200, clue: 'This author wrote "Romeo and Juliet."', solution: 'Who is William Shakespeare?', dailyDouble: false, html: false },
          { value: 400, clue: 'This novel by Harper Lee features the character Atticus Finch.', solution: 'What is "To Kill a Mockingbird"?', dailyDouble: false, html: false },
          { value: 600, clue: 'This fantasy series features hobbits, elves, and a ring of power.', solution: 'What is "The Lord of the Rings"?', dailyDouble: false, html: false },
          { value: 800, clue: 'This dystopian novel by George Orwell is set in the year of its title.', solution: 'What is "1984"?', dailyDouble: false, html: false },
          { value: 1000, clue: 'This author created the detective Sherlock Holmes.', solution: 'Who is Arthur Conan Doyle?', dailyDouble: false, html: false },
        ],
      },
      {
        category: 'Sports',
        clues: [
          { value: 200, clue: 'This sport is played with a round ball and goals at each end of the field.', solution: 'What is soccer (football)?', dailyDouble: false, html: false },
          { value: 400, clue: 'This tennis Grand Slam is played on grass courts in London.', solution: 'What is Wimbledon?', dailyDouble: false, html: false },
          { value: 600, clue: 'This boxer was known as "The Greatest" and had the birth name Cassius Clay.', solution: 'Who is Muhammad Ali?', dailyDouble: false, html: false },
          { value: 800, clue: 'This country has won the most FIFA World Cup titles.', solution: 'What is Brazil?', dailyDouble: false, html: false },
          { value: 1000, clue: 'This Olympic event combines cross-country skiing and rifle shooting.', solution: 'What is biathlon?', dailyDouble: false, html: false },
        ],
      },
    ],
    double: [
      {
        category: 'Science',
        clues: [
          { value: 400, clue: 'This subatomic particle has a positive charge.', solution: 'What is a proton?', dailyDouble: false, html: false },
          { value: 800, clue: 'This process converts light energy into chemical energy in plants.', solution: 'What is photosynthesis?', dailyDouble: false, html: false },
          { value: 1200, clue: 'This law states that energy cannot be created or destroyed.', solution: 'What is the first law of thermodynamics?', dailyDouble: false, html: false },
          { value: 1600, clue: 'This organ in the human body produces insulin.', solution: 'What is the pancreas?', dailyDouble: true, html: false },
          { value: 2000, clue: 'This physicist is known for his uncertainty principle.', solution: 'Who is Werner Heisenberg?', dailyDouble: false, html: false },
        ],
      },
      {
        category: 'History',
        clues: [
          { value: 400, clue: 'This war lasted from 1939 to 1945.', solution: 'What is World War II?', dailyDouble: false, html: false },
          { value: 800, clue: 'This queen ruled England for over 63 years in the 19th century.', solution: 'Who is Queen Victoria?', dailyDouble: false, html: false },
          { value: 1200, clue: 'This ancient trade route connected China to the Mediterranean.', solution: 'What is the Silk Road?', dailyDouble: false, html: false },
          { value: 1600, clue: 'This revolution began in France in 1789.', solution: 'What is the French Revolution?', dailyDouble: false, html: false },
          { value: 2000, clue: 'This treaty ended World War I in 1919.', solution: 'What is the Treaty of Versailles?', dailyDouble: false, html: false },
        ],
      },
      {
        category: 'Pop Culture',
        clues: [
          { value: 400, clue: 'This superhero franchise includes Iron Man, Thor, and Captain America.', solution: 'What is the Marvel Cinematic Universe?', dailyDouble: false, html: false },
          { value: 800, clue: 'This artist painted the ceiling of the Sistine Chapel.', solution: 'Who is Michelangelo?', dailyDouble: false, html: false },
          { value: 1200, clue: 'This TV show features dragons and a fight for the Iron Throne.', solution: 'What is "Game of Thrones"?', dailyDouble: false, html: false },
          { value: 1600, clue: 'This musician is known as the "King of Pop."', solution: 'Who is Michael Jackson?', dailyDouble: false, html: false },
          { value: 2000, clue: 'This animated film studio created "Spirited Away" and "My Neighbor Totoro."', solution: 'What is Studio Ghibli?', dailyDouble: false, html: false },
        ],
      },
      {
        category: 'Geography',
        clues: [
          { value: 400, clue: 'This ocean is the largest on Earth.', solution: 'What is the Pacific Ocean?', dailyDouble: false, html: false },
          { value: 800, clue: 'This African country has the most people.', solution: 'What is Nigeria?', dailyDouble: false, html: false },
          { value: 1200, clue: 'This canal connects the Atlantic and Pacific oceans.', solution: 'What is the Panama Canal?', dailyDouble: true, html: false },
          { value: 1600, clue: 'This island nation lies southeast of India in the Indian Ocean.', solution: 'What is Sri Lanka?', dailyDouble: false, html: false },
          { value: 2000, clue: 'This Russian lake is the deepest freshwater lake in the world.', solution: 'What is Lake Baikal?', dailyDouble: false, html: false },
        ],
      },
      {
        category: 'Literature',
        clues: [
          { value: 400, clue: 'This author wrote "Pride and Prejudice."', solution: 'Who is Jane Austen?', dailyDouble: false, html: false },
          { value: 800, clue: 'This novel by F. Scott Fitzgerald features Jay Gatsby.', solution: 'What is "The Great Gatsby"?', dailyDouble: false, html: false },
          { value: 1200, clue: 'This Chilean poet won the Nobel Prize in Literature in 1971.', solution: 'Who is Pablo Neruda?', dailyDouble: false, html: false },
          { value: 1600, clue: 'This Russian author wrote "War and Peace."', solution: 'Who is Leo Tolstoy?', dailyDouble: false, html: false },
          { value: 2000, clue: 'This magical realism novel by Gabriel García Márquez spans seven generations.', solution: 'What is "One Hundred Years of Solitude"?', dailyDouble: false, html: false },
        ],
      },
      {
        category: 'Sports',
        clues: [
          { value: 400, clue: 'This basketball player is known for six NBA championships with the Chicago Bulls.', solution: 'Who is Michael Jordan?', dailyDouble: false, html: false },
          { value: 800, clue: 'This country hosted the first modern Olympic Games in 1896.', solution: 'What is Greece?', dailyDouble: false, html: false },
          { value: 1200, clue: 'This Formula 1 driver holds the record for most World Championship titles.', solution: 'Who is Lewis Hamilton?', dailyDouble: false, html: false },
          { value: 1600, clue: 'This sport uses terms like "love," "deuce," and "ace."', solution: 'What is tennis?', dailyDouble: false, html: false },
          { value: 2000, clue: 'This swimmer won 23 Olympic gold medals across four Olympic Games.', solution: 'Who is Michael Phelps?', dailyDouble: false, html: false },
        ],
      },
    ],
    final: {
      category: 'World Landmarks',
      clue: 'This structure, completed in 1889 for a World\'s Fair, was originally intended to be temporary but became one of the most recognizable landmarks in the world.',
      solution: 'What is the Eiffel Tower?',
    },
  },
};
