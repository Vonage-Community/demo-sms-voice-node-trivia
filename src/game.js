import { callGPT } from './openai.js';
import _ from 'lodash';
import path from 'path';
import { existsSync, createWriteStream, readFileSync, writeFileSync } from 'fs';
import debug from 'debug';
import parseJson from 'json-parse-better-errors';
import { Vonage } from '@vonage/server-sdk';
import { SMS } from '@vonage/messages';
import { Auth } from '@vonage/auth';
import { tokenGenerate } from '@vonage/jwt';
import { getAirtableSignups } from './airtable.js';
import dotenv from 'dotenv';

dotenv.config();

const log = debug('@vonage.game.engine');

const privateKey = existsSync(process.env.VONAGE_PRIVATE_KEY)
  ? readFileSync(process.env.VONAGE_PRIVATE_KEY)
  : process.env.VONAGE_PRIVATE_KEY;

const APIAuth = new Auth({
  apiKey: process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET,
  applicationId: process.env.VONAGE_APPLICATION_ID,
  privateKey: privateKey,
});

const FROM_NUMBER = process.env.FROM_NUMBER;

const vonage = new Vonage(APIAuth);

const rootDir = path
  .dirname(path.dirname(import.meta.url))
  .replace('file://', '');

const gameFileName = rootDir + '/games.json';
const particapantFileName = rootDir + '/particapants.txt';

const partStream = createWriteStream(particapantFileName, { flags: 'a' });

/**
 * Close all open file streams
 */
const closeFiles = () => {
  log('Closing files');
  partStream.end();
  log('Flies closed');
  process.exit(0);
};

process.on('SIGINT', closeFiles);
process.on('SIGTERM', closeFiles);

/**
 * Load games from the file
 */
const loadGame = () => {
  log(`Loading games file: ${gameFileName}`);
  try {
    return JSON.parse(readFileSync(gameFileName));
  } catch (e) {
    log('Failed to load games');
    log(e);
    return {};
  }
};

const games = loadGame();

/**
 * Save the game file
 */
const saveGame = () => {
  log(`Saving games file: ${gameFileName}`);
  writeFileSync(gameFileName, JSON.stringify(games, null, 2));
};

/**
 * Get the phone numbers linked to the vonage application
 */
const getGameNumbers = async (game) => {
  const numbers = await vonage.numbers.getOwnedNumbers({
    applicationId: process.env.VONAGE_APPLICATION_ID,
  });

  log(numbers);
  game.numbers = numbers?.numbers.map(
    ({ country, msisdn }) => ({
      country: country,
      number: msisdn,
    }),
  );

  return numbers;
};

/**
 * Update the Inbound and Status URL's for the application
 */
const updateGameUrls = async (gameId) => {
  log(`Updating app for game ${gameId}`);
  const currentAppSettings = await vonage.applications.getApplication(
    process.env.VONAGE_APPLICATION_ID,
  );

  log(`current settings`, currentAppSettings);
  const messagesUrl = new URL(
    currentAppSettings.capabilities.messages.webhooks.inboundUrl.address,
  );

  const statusUrl = new URL(
    currentAppSettings.capabilities.messages.webhooks.statusUrl.address,
  );

  messagesUrl.pathname = `/inbound/${gameId}`;
  statusUrl.pathname = `/status/${gameId}`;

  currentAppSettings.capabilities.messages.webhooks.inboundUrl.address
    = messagesUrl.href;

  currentAppSettings.capabilities.messages.webhooks.statusUrl.address
    = statusUrl.href;

  await vonage.applications.updateApplication(currentAppSettings);
};

/**
 * Create an ID
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
 */
const getCurrentQuestion = (questions) => questions.slice(-1)[0];

/**
 * (Try to) parse the response from GPT
 */
const parseQuestion = (messages, content) => {
  messages.push({
    role: 'assistant',
    content: content,
  });

  saveGame();

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
 */
const ask = async (game) => {
  log('Asking question');

  const { questions, messages } = game;
  messages.push({
    role: 'user',
    content: 'Generate a question',
  });
  log('Messages:', messages);

  const gptResponse = await callGPT(messages);
  const question = {
    ...parseQuestion(messages, gptResponse),
    id: makeId(8),
    answered: false,
    answered_correctly: false,
    passed: false,
  };
  log('Question:', question);

  question.choices = question.choices.map((choice) => ({
    ...choice,
    letter: choice.letter.toUpperCase().substring(0, 1),
    removed: false,
    audience_choice: 0,
  }));

  questions.push(question);
  return getCurrentQuestion(questions);
};

/**
 * Pass the last question answered
 */
const pass = async (game) => {
  log('Passing question');
  getCurrentQuestion(game.questions).passed = true;
  const nextQuestion = await ask(game);
  calculateScore(game);
  saveGame();
  return nextQuestion;
};

/**
 * Calculate the score
 */
const calculateScore = (game) => {
  log('Calculating score');
  const pointIndex = game.questions.reduce(
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
  log(`Point index ${pointIndex}`);
  game.score = pointIndex >= 0 ? pointScale[pointIndex] : 0;
  log(`New Score ${game.score}`);
};

/**
 * Answer the question
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

  saveGame();
};

/**
 * Generate a JWT token for the game
 */
const getJwt = (game) => {
  game.jwt = tokenGenerate(
    process.env.VONAGE_APPLICATION_ID,
    privateKey,
    {
      sub: 'game_user',
      acl: {
        'paths': {
          '/*/users/**': {},
          '/*/conversations/**': {},
          '/*/sessions/**': {},
          '/*/devices/**': {},
          '/*/image/**': {},
          '/*/media/**': {},
          '/*/applications/**': {},
          '/*/push/**': {},
          '/*/knocking/**': {},
          '/*/legs/**': {},
        },
      },
    },
  );
  saveGame();
};

/**
 * Choose a dev to phone
 */
const phoneADev = async (game) => {
  log('Phone a friend', game);
  game.life_lines.phone_a_dev = true;
  getJwt(game);
  await getAirtableSignups(game);

  game.dad = game.particapants.sort(() => 0.5 - Math.random())[0];
  saveGame();
};

/**
 * Reduce choices down
 */
const narrowItDown = async (game) => {
  log('Fifity Fifity');
  const latestQuestion = getLatestQuestion(game.questions);
  if (latestQuestion.answered) {
    throw new Error('Question has been answered ask a new one first');
  }

  const { correct } = latestQuestion;

  const shuffle = _.compact(
    latestQuestion.choices.map(({ letter }) =>
      correct !== letter ? letter : null,
    ),
  ).sort(() => 0.5 - Math.random());

  shuffle.pop();
  log('Shuffle', shuffle);

  latestQuestion.choices.forEach(
    (choice) => (choice.removed = shuffle.includes(choice.letter)),
  );

  log(latestQuestion);

  game.life_lines.narrow_it_down = true;
  saveGame();
};

/**
 * Setup application to receive texts
 */
const textTheAudience = async (game) => {
  log('Text The Audience', game);
  game.life_lines.text_the_audience = true;

  await updateGameUrls(game.id);
  await getGameNumbers(game);

  saveGame();
  return game;
};

/**
 * Write sms messages to a file
 */
const processAudienceResponse = async (game, inboundStatus) => {
  const { text, from } = inboundStatus;

  partStream.write(`${game.id},${from},${text}\n`);
  const params = {
    from: FROM_NUMBER,
    to: from,
    text: `Thanks for helping ${game?.player?.name || ''}`,
  };

  log('Sending message', params);

  return vonage.messages.send(new SMS(params))
    .catch((err) => {
      log(`Error when sending message`, err.response.data);
    });
};

/**
 * Parse the SMS file
 */
const countAudienceAnswers = (game) => {
  log(game);
  const answerLines = readFileSync(particapantFileName);
  const counted = answerLines
    .toString()
    .split('\n')
    .reduce((acc, line) => {
      log(`Line: ${line}`);
      const [gameId, fromNumber, answer] = line.split(',');
      if (!gameId) {
        return acc;
      }

      if (!acc[gameId]) {
        acc[gameId] = {};
      }

      if (answer && !acc[gameId][answer]) {
        acc[gameId][answer] = new Set();
      }

      if (answer) {
        acc[gameId][answer].add(fromNumber);
      }

      return acc;
    }, {});

  log(`Counted`, counted);

  const { choices } = getLatestQuestion(game.questions);

  choices.forEach((choice) => {
    const { letter } = choice;
    if (!counted[game.id]) {
      return;
    }

    if (counted[game.id][letter]) {
      choice.audience_choice = counted[game.id][letter].size;
    }
  });

  log(game);

  saveGame();
  return game;
};

/**
 * Get the latest question
 */
const getLatestQuestion = (questions) => questions.slice(-1)[0];

/**
 * Get the correct choice for the question
 */
const getCorrectChoice = (questions) => {
  const latestQuestion = getLatestQuestion(questions);

  return latestQuestion.choices.find(
    (choice) => choice.letter === latestQuestion.correct,
  );
};

/**
 * Easily Choose the helpline
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
 */
export const createGame = (
  title,
  categories,
  questions = [],
  messages = [],
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
    categories: categories,
    questions: questions,
    messages: messages,
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

  messages.push({
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
      + `. When you want to use a blank in a question, use <blank>`,
  });

  games[game.id] = game;
  saveGame();
  return game;
};

const findPlayer = async (game) => {
  await getAirtableSignups(game);

  log('setting player');
  game.player = game.particapants.sort(() => 0.5 - Math.random())[0];
  saveGame();
  return game;
};

/**
 * Attach functions to the loaded game
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
    countAudienceAnswers: _.partial(countAudienceAnswers, game),
  });

/**
 * Fetch a game
 */
export const getGame = (gameId) => {
  if (!games[gameId]) {
    throw new Error('Game not found');
  }

  return fillGame(games[gameId]);
};

/**
 * Return all the games
 */
export const getAllGames = () => games;
