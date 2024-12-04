import { MongoClient } from 'mongodb';
import debug from 'debug';
import dotenv from 'dotenv';
import { getApplicationNumbers, getNumberInfo } from './vonage.js';

dotenv.config();

const log = debug('@vonage.game.mongo');

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
      const playerCollection = database.collection('players');

      cache = {
        database: database,
        collection: collection,
        userCollection: playerCollection,
        triviaCollection: collection,
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
  log(`Question: ${questionId}, Letter: ${choiceLetter}`);
  const { collection } = await mongoClient();
  try {
    const results = await collection.updateOne(
      { '_id': gameId },
      {
        '$inc': {
          [`questions.${questionId}.choices.${choiceLetter}.audience_choice`]: 1,
        },
      },
    );
    log('Audience choice updated', results);
  } catch (e) {
    log(`Failed to update choice for game: ${gameId}`);
    log(e);
  }
};

export const fetchGame = async (gameId) => {
  log(`Fetching game: ${gameId}`);
  const { collection } = await mongoClient();
  try {
    const games = await collection.find({ _id: gameId }).toArray();
    const game = games[0];
    const numbers = await getApplicationNumbers();

    if (Object.keys(numbers).length > 0) {
      game.numbers = await Promise.all(
        (numbers?.numbers || []).map(
          async ({ country, msisdn }) => {
            return await getNumberInfo(country, msisdn);
          }
        ),
      );
    }
    log('Game loaded');
    return game;
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
  log(`Saving game: ${game.id}`, game);
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

export const insertPlayer = async (data) => {
  const { userCollection } = await mongoClient();
  const result = await userCollection.insertOne(data);

  return result.insertedId;
}

/**
 * @deprecated Use `getSignups` instead
 * @param {*} game 
 * @returns 
 */
export const getAirtableSignups = async (game) => {
  return await getSignups(game);
};

export const getSignups = async (game) => {
  log('Finding particapants');
  const { userCollection } = await mongoClient();
  const records = await userCollection.find({ game: game.id }).toArray();

  log('Records fetched');
  game.particapants = [];
  for (const row of records) {
    game.particapants.push({
      name: row.name,
      phone: row.phone,
      last_status: 'unknown',
    });
  }

  // remove the player
  game.particapants = game.particapants.filter(
    ({ phone }) => phone !== game?.player?.phone,
  );

  log('Particapants', game.particapants);
  log(`Player`, game.player);

  return game;
}