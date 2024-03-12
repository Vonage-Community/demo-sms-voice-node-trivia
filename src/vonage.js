import debug from 'debug';
import { Vonage } from '@vonage/server-sdk';
import { SMS } from '@vonage/messages';
import { tokenGenerate } from '@vonage/jwt';
import { getVCRAuth, getVCRAppliationId, privateKey } from './vcr.js';
import { saveGame } from './mongo.js';
import dotenv from 'dotenv';

dotenv.config();
const log = debug('@vonage.game.vonage');

const FROM_NUMBER = process.env.FROM_NUMBER;

export const vonage = new Vonage(getVCRAuth());

/**
 * Get the phone numbers linked to the vonage application
 *
 * @param {Object} game The gam
 * @return {Object} The numbers
 */
export const getGameNumbers = async (game) => {
  log(`Getting numbers for game: ${game.id} application: ${getVCRAppliationId()}`);
  const numbers = await vonage.numbers.getOwnedNumbers({
    applicationId: getVCRAppliationId(),
  });

  log('Numbers fetched', numbers);
  game.numbers = [];
  game.numbers = await Promise.all(
    numbers?.numbers?.map(
      ({ country, msisdn }) => vonage.numberInsights.basicLookup(msisdn)
      // eslint-disable-next-line
        .then(({ country_name, country_prefix, national_format_number }) => {

          // eslint-disable-next-line
          log(`Number ${msisdn} is in ${country_name}`);
          return {
            country: country,
            // eslint-disable-next-line
            countryName: country_name,
            msisdn: msisdn,
            // eslint-disable-next-line
            number: `+${country_prefix} ${national_format_number}`,
          };
        }),
    ),
  );

  log('Numbers fetched', game.numbers);
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

  log('Creating user');
  await vonage.users.createUser({
    name: 'game_user',
  });
  log('User created');
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
  return game;
};

export const sendMessage = async (from, message) => {
  const params = {
    from: FROM_NUMBER,
    to: from,
    text: message,
  };

  log('Sending message', params);

  return vonage.messages.send(new SMS(params))
    .catch((err) => {
      log(`Error when sending message`, err.response?.data);
    });
};
