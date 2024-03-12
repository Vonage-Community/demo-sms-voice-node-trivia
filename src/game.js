import { callGPT } from './openai.js';

import _ from 'lodash';
import debug from 'debug';
import parseJson from 'json-parse-better-errors';
import {
  getJwt,
  createGameVoiceUser,
  sendMessage,
  getGameNumbers,
} from './vonage.js';
import { getAirtableSignups } from './airtable.js';

import {
  saveGame,
  fetchGame,
  updateAudienceChoice,
} from './mongo.js';
import dotenv from 'dotenv';

dotenv.config();

const log = debug('@vonage.game.engine');

/**
 * Create an ID
 *
 * @param {Number} length The length of the ID
 * @return {String} The ID
 */
const makeId = (length) => {
  let result = '';
  const characters = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789`;
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};

/**
 * Returns the current question for the game
 *
 * @param {Array} questions The questions
 * @return {Object} The current question
 */
const getCurrentQuestion = (questions) => questions
  && Object.values(questions).slice(-1)[0];

/**
 * (Try to) parse the response from GPT
 *
 * @param {Array} messages The messages
 * @param {String} content The content
 * @return {Object} The parsed question
 */
const parseQuestion = (messages, content) => {
  messages.push({
    role: 'assistant',
    content: content,
  });

  try {
    const parsed = parseJson(content);
    log(parsed);

    parsed.correct = parsed.correct.substring(0, 1).toUpperCase();
    return parsed;
  } catch (error) {
    log('JSON parse Error', error);
    throw new Error('GPT did not listen and return proper JSON');
  }
};

/**
 * Ask a question for the game
 *
 * @param {Object} game The game
 * @return {Object} The question
 */
const ask = async (game) => {
  log('Asking question');

  const { questions, messages } = game;
  const currentPoint = pointScale[getPointIndex(game) + 1] || pointScale[0];
  messages.push({
    role: 'user',
    content: `Generate a question worth $${currentPoint} for me please.`,
  });
  log('Messages:', messages);

  const questionCount = (Object.entries(questions).length || 0) + 1;

  const gptResponse = await callGPT(messages);
  const question = {
    ...parseQuestion(messages, gptResponse),
    id: `${questionCount}_${makeId(8)}`,
    answered: false,
    answered_correctly: false,
    passed: false,
    audience_choice: 0,
  };

  log('Question:', question);

  question.choices = Object.fromEntries(
    question.choices.map((choice) => [
      choice.letter?.toUpperCase().substring(0, 1),
      {
        ...choice,
        letter: choice.letter?.toUpperCase().substring(0, 1),
        removed: false,
        audience_choice: 0,
      },
    ]));

  questions[question.id] = question;
  saveGame(game);
  return getCurrentQuestion(questions);
};

/**
 * Pass the last question answered
 *
 * @param {Object} game The game
 * @return {Object} The next question
 */
const pass = async (game) => {
  log('Passing question');
  getCurrentQuestion(game.questions).passed = true;
  const nextQuestion = await ask(game);
  calculateScore(game);
  await saveGame(game);
  return nextQuestion;
};

/**
 * Calculate the score
 *
 * @param {Object} game The game
 */
const calculateScore = (game) => {
  log('Calculating score');
  const pointIndex = getPointIndex(game);
  log(`Point index ${pointIndex}`);
  game.score = pointIndex >= 0 ? pointScale[pointIndex] : 0;
  log(`New Score ${game.score}`);
};

/**
 * Get the point index
 * @param {Object} game The game
 * @return {Number} The point index
 **/
const getPointIndex = (game) => Object.values(game.questions || {}).reduce(
  (acc, { answered_correctly: answeredCorrectly, passed }) => {
    if (passed) {
      log('Question passed');
      return acc;
    }

    if (!answeredCorrectly) {
      log('Question not answered correctly');
      return acc;
    }

    log('Question answered correctly');
    acc++;
    return acc;
  },
  -1,
);

/**
 * Answer the question
 *
 * @param {Object} game The game
 * @param {Object} letterChoice The letter choice
 */
const answer = async (game, { letterChoice }) => {
  log(`Answering question: ${letterChoice}`);
  const latestQuestion = getLatestQuestion(game.questions);
  log(latestQuestion);

  latestQuestion.answered = true;
  latestQuestion.answered_correctly = false;

  if (letterChoice === latestQuestion.correct) {
    log('Correct answer');
    latestQuestion.answered_correctly = true;
    calculateScore(game);
  }

  await saveGame(game);
};

/**
 * Choose a dev to phone
 *
 * @param {Object} game The game
 */
const phoneADev = async (game) => {
  log('Phone a friend');
  game.life_lines.phone_a_dev = true;
  game.jwt = getJwt();
  await getAirtableSignups(game);

  game.dad = game.particapants.sort(() => 0.5 - Math.random())[0];
  await saveGame(game);
};

/**
 * Reduce choices down
 *
 * @param {Object} game The game
 */
const narrowItDown = async (game) => {
  log('Fifity Fifity');
  const latestQuestion = getLatestQuestion(game.questions);
  if (latestQuestion.answered) {
    throw new Error('Question has been answered ask a new one first');
  }

  const { correct } = latestQuestion;

  const shuffle = _.compact(
    Object.values(latestQuestion.choices).map(({ letter }) =>
      correct !== letter ? letter : null,
    ),
  ).sort(() => 0.5 - Math.random());

  shuffle.pop();
  log('Shuffle', shuffle);

  Object.values(latestQuestion.choices).forEach(
    (choice) => (choice.removed = shuffle.includes(choice.letter)),
  );

  log(latestQuestion);

  game.life_lines.narrow_it_down = true;
  await saveGame(game);
};

/**
 * Setup application to receive texts
 * @param {Object} game The game
 * @return {Object} The game
 */
const textTheAudience = async (game) => {
  log('Text The Audience');
  game.life_lines.text_the_audience = true;

  saveGame(game);
  return game;
};

/**
 * Write sms messages to a file
 *
 * @param {Object} game The game
 * @param {Object} inboundStatus The inbound status
 * @return {Promise} The promise
 */
const processAudienceResponse = async (game, inboundStatus) => {
  const { text, from } = inboundStatus;

  let response = `Thanks for helping ${game?.player?.name || ''}`;
  const question = getLatestQuestion(game.questions);
  const choices = Object.values(question.choices);

  const allowedLetters = choices.map(
    ({ letter, removed }) => !removed ? letter : null).filter(
    (letter) => letter,
  );

  let letter = `${text}`.trim().substring(0, 1).toUpperCase();

  if (text.trim().length !== 1) {
    response = 'I\'m sorry, I didn\'t understand your message. '
    + `Please respond with only ${allowedLetters.join(', ')}.`;
    letter = null;
  }

  if (letter && allowedLetters.includes(letter)) {
    updateAudienceChoice(
      game.id,
      question.id,
      letter,
    );
  }

  if (letter && !allowedLetters.includes(letter)) {
    response = `I'm sorry but '${letter}' is not a valid choice. `
    + `Please respond with only ${allowedLetters.join(', ')}.`;
  }

  const removedLetters = choices.map(
    ({ letter, removed }) => removed ? letter : null).filter(
    (letter) => letter,
  );

  if (removedLetters.includes(letter)) {
    response = `I'm sorry but Choice '${letter}' has been eliminated. `
    + `Please respond with only ${allowedLetters.join(', ')}.`;
  }

  await sendMessage(from, response);
};

/**
 * Get the latest question
 * @param {Array} questions The questions
 * @return {Object} The latest question
 */
const getLatestQuestion = (questions) => Object.values(questions || {})
  .slice(-1)[0];

/**
 * Get the correct choice for the question
 * @param {Array} questions The questions
 * @return {Object} The correct choice
 */
const getCorrectChoice = (questions) => {
  const latestQuestion = getLatestQuestion(questions);

  return Object.values(latestQuestion.choices).find(
    (choice) => choice.letter === latestQuestion.correct,
  );
};

/**
 * Easily Choose the helpline
 *
 * @param {Object} game The game
 * @param {Object} which The helpline
 * @return {Object} The game
 */
const lifeLine = (game, { which }) => {
  switch (which) {
  case 'narrow_it_down':
    return narrowItDown(game);
  case 'phone_a_dev':
    return phoneADev(game);
  case 'text_the_audience':
    return textTheAudience(game);
  default:
    throw new Error('Invalid lifeline');
  }
};

/**
 * Point scale
 */
export const pointScale = [
  500, 1000, 2000, 5000, 10000, 50000, 100000, 250000, 500000, 1000000,
];

/**
 * Setup a game
 *
 * @param {String} title The title of the game
 * @param {String} url The URL for the game
 * @param {Array} categories The categories for the game
 * @param {String} airtable The airtable table id
 *
 * @return {Object} The game
 */
export const createGame = async (
  title,
  url,
  categories,
  airtable,
) => {
  log(`Creating new game ${title}`, categories);

  const questionSchema = {
    question: 'The text for the string',
    choices: [
      {
        letter: 'The letter choice',
        text: 'The choice',
      },
    ],
    correct: 'The correct choice',
  };

  const game = fillGame({
    id: makeId(8),
    title: title,
    url: url,
    airtable: airtable,
    categories: categories,
    questions: {},
    messages: [],
    point_scale: pointScale,
    score: 0,
    over: false,
    player: null,
    particapants: [],
    life_lines: {
      narrow_it_down: false,
      text_the_audience: false,
      phone_a_dev: false,
    },
  });

  game.messages.push({
    role: 'system',
    content:
      `You are a helpful AI assistant. `
      + `You answer the user's queries. `
      + `You NEVER return anything but a JSON string. `
      + `Let's play "Who wants to be a millionaire". `
      + `The questions should be themed on `
      + categories.join(', ')
      + `. Return the questions as a JSON array following this schema: `
      + JSON.stringify(questionSchema)
      + `. When you want to use a blank in a question, use <blank>.`
      + `There should always be 4 choices and 1 correct answer.`,
  });

  await getGameNumbers(game);
  await createGameVoiceUser(game);
  await saveGame(game);
  return game;
};

const findPlayer = async (game) => {
  await getAirtableSignups(game);

  log('setting player');
  game.player = game.particapants.sort(() => 0.5 - Math.random())[0];
  saveGame(game);
  return game;
};

/**
 * Attach functions to the loaded game
 *
 * @param {Object} game The game
 *
 * @return {Object} The game with functions attached
 */
const fillGame = (game) =>
  Object.assign(game, {
    ask: _.partial(ask, game, game.messages, game.questions),
    findPlayer: _.partial(findPlayer, game),
    answer: _.partial(answer, game),
    pass: _.partial(pass, game),
    latestQuestion: _.partial(getLatestQuestion, game.questions),
    getCorrectChoice: _.partial(getCorrectChoice, game.questions),
    getJwt: _.partial(getJwt, game),
    lifeLine: _.partial(lifeLine, game),
    processAudienceResponse: _.partial(processAudienceResponse, game),
  });

/**
 * Fetch a game
 *
 * @param {String} gameId The game ID
 * @return {Object} The game
 */
export const getGame = async (gameId) => {
  const game = await fetchGame(gameId);
  log('Filling game');
  return fillGame(game);
};

