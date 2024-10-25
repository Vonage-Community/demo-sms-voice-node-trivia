import debug from 'debug';
import { Vonage } from '@vonage/server-sdk';
import { SMS } from '@vonage/messages';
import { tokenGenerate } from '@vonage/jwt';
import { getVCRAuth, getVCRAppliationId, getPrivateKey } from './vcr.js';
import { saveGame } from './mongo.js';
import dotenv from 'dotenv';

dotenv.config();
const log = debug('@vonage.game.vonage');

const FROM_NUMBER = process.env.FROM_NUMBER;

export const vonage = new Vonage(getVCRAuth());

export const getApplicationNumbers = async () => {
  const numbers = await vonage.numbers.getOwnedNumbers({
    applicationId: getVCRAppliationId(),
  });

  
  if (Object.keys(numbers).length > 0) {
    return numbers;
  }

  return [];
}

const numberInfoCache = {};
export const getNumberInfo = async (country, msisdn) => {
  const key = `${country}-${msisdn}`;

  if (!numberInfoCache[key]) {
    log(`Number ${msisdn} not found in cache, looking up`);
    const resp = await vonage.numberInsights.basicLookup(msisdn, { country })
    numberInfoCache[key] = {
      country: resp.country,
      countryName: resp.country_name,
      msisdn: resp.msisdn,
      number: `+${resp.country_prefix} ${resp.national_format_number}`,
    }
  }


  log(`Number ${msisdn} is in ${numberInfoCache[key].countryName}`);
  return numberInfoCache[key];
}

/**
 * Get the phone numbers linked to the vonage application
 *
 * @param {Object} game The gam
 * @return {Object} The numbers
 */
export const getGameNumbers = async (game) => {
  log(`Getting numbers for game: ${game.id} application: ${getVCRAppliationId()}`);
  const numbers = getApplicationNumbers();  

  log('Numbers fetched from API', numbers);
  game.numbers = [];
  if (Object.keys(numbers).length > 0) {
    game.numbers = await Promise.all(
      numbers?.numbers?.map(
        async ({ country, msisdn }) => {
          return await getNumberInfo(country, msisdn);
        }
      ),
    );
  }

  log('Numbers fetched after filtering', game.numbers);
  await saveGame(game);
  return game.numbers;
};

export const createGameVoiceUser = async () => {
  log('Creating user for voice calls');
  try {
    for await (const user of vonage.users.listAllUsers({ name: 'game_user' })) {
      log('User exists', user);
      return;
    }
  } catch (error) {
    if (error.response?.status !== 404) {
      log('Failed to list users', error);
      throw error;
    }

    log('User does not exist');
  }

  try {
    log('Creating user');

    await vonage.users.createUser({
      name: 'game_user',
    });
    log('User created');
  } catch (error) {
    log('Failed to create user', error);
  }
};

/**
 * Generate a JWT token for the game
 *
 * @param {Object} game The game
 * @return {String} The token
 */
export const getJwt = async (game) => {
  log('Generating JWT');
  await createGameVoiceUser();

  game.jwt = tokenGenerate(
    getVCRAppliationId(),
    getPrivateKey(),
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
  return game;
};

export const sendMessage = async (from, to, message) => {
  const params = {
    from: to || FROM_NUMBER,
    to: from,
    text: message,
  };

  log('Sending message', params);

  return vonage.messages.send(new SMS(params))
    .catch((err) => {
      log(`Error when sending message`, err.response?.data);
    });
};
