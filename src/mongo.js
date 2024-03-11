import { MongoClient } from 'mongodb';
import debug from 'debug';
import dotenv from 'dotenv';

dotenv.config();

const log = debug('@vonage.mongo');

const uri = new URL(`mongodb://${process.env.DB_HOST}`);

uri.username = process.env.DB_USER;
uri.password = process.env.DB_PASSWORD;
uri.port = process.env.DB_PORT;

uri.searchParams.set('authSource', 'admin');
uri.searchParams.set('ssl', 'false');
uri.searchParams.set('directConnection', 'true');

const getClient = () => {
  let cache = null;

  return async () => {
    if (cache) {
      log('Already connected');
      return cache;
    }

    try {
      log(`Connecting to mongo`);
      const mongoClient = new MongoClient(uri.toString());
      await mongoClient.connect();

      log('Connected');
      const database = mongoClient.db(process.env.DB_NAME);
      log('Database selected');
      const collection = database.collection('trivia');
      log('Collection selected');

      cache = {
        database: database,
        collection: collection,
        client: mongoClient,
      };

      return cache;
    } catch (error) {
      log(`Failed to connect to mongo ${uri.toString()}`);
      log(error);
    }
  };
};

export const mongoClient = getClient();
/**
 * Load games from the file
 *
 * @return {Object} The games
 */
export const loadGames = async () => {
  log(`Loading games`);
  const { collection } = await mongoClient();
  try {
    const games = await collection.find().toArray();
    log('Loaded games');
    return games.reduce(
      (acc, game) => {
        acc[game.id] = game;
        return acc;
      },
      {},
    );
  } catch (e) {
    log('Failed to load games');
    log(e);
    return {};
  }
};

export const updateAudienceChoice = async (
  gameId,
  questionId,
  choiceLetter,
) => {
  log(`Updating audience choice for game: ${gameId}`);
  const { collection } = await mongoClient();
  try {
    await collection.updateOne(
      { '_id': 'p6M9zICD', 'questions.id': questionId },
      { $inc: { 'questions.$[q].choices.$[c].audience_choice': 1 } },
      {
        arrayFilters: [
          { 'q.id': 'gNNDka8b' }, // Identifies the correct question
          { 'c.letter': choiceLetter }, // Identifies the choice with letter B
        ],
      },
    );
    log('Audience choice updated');
  } catch (e) {
    log(`Failed to update choice for game: ${gameId}`);
    log(e);
  }
};

export const fetchGame = async (gameId) => {
  log(`Fetching game: ${gameId}`);
  const { collection } = await mongoClient();
  try {
    const game = await collection.find({ _id: gameId }).toArray();

    log('Game loaded');
    return game[0];
  } catch (e) {
    log(`Failed to load game: ${gameId}`);
    log(e);
    return {};
  }
};

/**
 * Save the game file
 *
 * @param {Object} game The game
 */
export const saveGame = async (game) => {
  log(`Saving game: ${game.id}`);
  const { collection } = await mongoClient();
  try {
    await collection.replaceOne(
      { _id: game.id },
      game,
      { upsert: true },
    );
    log('Game saved');
  } catch (e) {
    log('Failed to save game');
    log(e);
  }
};

