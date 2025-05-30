import Express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { createGame, getGame } from './game.js';
import { insertPlayer, loadGames, mongoClient } from './mongo.js';
import { Voice, Messages, vcr } from '@vonage/vcr-sdk';
import { getVCRPort, isVCR } from './vcr.js';
import debug from 'debug';
import { getApplicationNumbers, getGameNumbers } from './vonage.js';

process.env.VCR_PORT && debug.enable('*vonage.game*');

const log = debug('@vonage.game.server');

dotenv.config();

let activeGameId;

const onCallEvent = (req, res) => {
  log('Event:', req.body);
  res.sendStatus(200);
};

const onFallback = (req, res) => {
  log('Fallback:', req.body);
  res.sendStatus(200);
};

const answerCall = async (req, res) => {
  log('Answer: ', req.body);
  let ncco = [
    {
      'action': 'talk',
      'text': 'No destination user - hanging up',
    },
  ];

  const username = req.body.to;
  let from = process.env.FROM_NUMBER;
  if (!from) {
    const numbers = await getApplicationNumbers();
    from = numbers.numbers.shift().msisdn;
  }

  if (username) {
    ncco = [
      {
        'action': 'talk',
        'text': `Please wait while we connect you`,
      },
      {
        'action': 'connect',
        'from': from,
        'endpoint': [
          {
            'type': 'phone',
            'number': req.body.to,
          },
        ],
      },
    ];
  }
  log('NCCO', JSON.stringify(ncco, null, 2));
  res.json(ncco);
};

const processMessage = async (req, res) => {
  const body = req.body;
  log(`Inbound Message ${activeGameId}`, body);
  if (activeGameId) {
    const game = await getGame(activeGameId);
    game.processAudienceResponse(body);
  }

  res.status(200).json({ status: 'accepted' });
};

const processStatus = async (req, res) => {
  const body = req.body;
  log(`Status ${activeGameId}`, body);

  res.status(200).json({ status: 'accepted' });
};

const startVCR = async () => {
  if (!isVCR()) {
    log('Not running in VCR');
    return;
  }

  const vonageNumber = { type: null, number: null };
  const from = { type: null, number: null };

  try {
    log('Starting VCR');
    const session = vcr.createSession();
    const voice = new Voice(session);
    const messaging = new Messages(session);

    await voice.onCall('onCall');
    await voice.onCallEvent('onCallEvent');

    await messaging.onMessage('onMessage', from, vonageNumber);
    await messaging.onMessageEvent('onEvent', from, vonageNumber);
  } catch (error) {
    log('Error', error);
  }
};


const rootDir = path.dirname(path.dirname(import.meta.url)).replace(
  'file://',
  '',
);

const app = new Express();
const port = getVCRPort() || 3000;

const catchAsync = (fn) => (req, res, next) => {
  fn(req, res, next).catch(next);
};

app.use(Express.static(rootDir + '/public'));
app.use(Express.json());

app.get('/_/health', (_, res) => {
  res.status(200);
  res.send('OK');
});

/**
 * Return the home page
 */
app.get('/', catchAsync(async (_, res) => {
  log('Home Page');
  res.sendFile(`${rootDir}/public/index.html`);
}));

/**
 * List all games
 */
app.get('/games', catchAsync(async (_, res) => {
  log('List games');
  const games = await loadGames();

  res.send(games);
}));

/**
 * Create a game
 */
app.post('/games', catchAsync(async (req, res) => {
  const { title, url, categories, game_tcs } = req.body;
  log(`Create game`);

  const game = await createGame(title, url, categories, game_tcs);
  log('Game created');

  res.send(game);
}));

/**
 * Fetch a Game
 */
app.get('/games/:gameId', catchAsync(async (req, res) => {
  const { gameId } = req.params;
  log(`Getting game: ${gameId}`);

  const game = await getGame(gameId);
  log('Game loaded');

  res.send(game);
}));

app.post('/players', catchAsync(async (req, res) => {
  const { name, number, agreement, game } = req.body;

  const insertId = await insertPlayer({
    name,
    phone: number,
    agreement,
    game,
  })

  const gameInfo = await getGame(game);
  res.send(gameInfo);
}));

/**
 * Make an RPC call
 */
app.put('/games/:gameId', catchAsync(async (req, res) => {
  const { gameId } = req.params;
  activeGameId = gameId;
  const { method, parameters, id } = req.body;
  log(`RPC call for game: ${gameId}`, req.body);

  const game = await getGame(gameId);
  log(`RPC Method: ${method}`);

  switch (method) {
  case 'load_game':
    // Adding this method to allow loading of the game
    break;

  case 'call_player':
    await game.getJwt();
    break;

  case 'find_player':
    await game.findPlayer();
    await game.ask();
    break;

  case 'ask':
    await game.ask();
    break;

  case 'life_line':
    await game.lifeLine(parameters);
    break;

  case 'pass':
    await game.pass(parameters);
    break;

  case 'answer':
    await game.answer(parameters);
    break;
  }

  res.send({
    jsonrpc: '2.0',
    result: game,
    ...(id ? { id: id } : {}),
  });
}));


/**
 * Inbound listen for SMS messages
 */
app.all('/inbound', catchAsync(processMessage));
app.all('/onMessage', catchAsync(processMessage));

/**
 * Status Listener
 */
app.all('/status', catchAsync(processStatus));
app.all('/onStatus', catchAsync(processStatus));


/**
 * Handle voice answer
 */
app.all('/voice/answer', answerCall);
app.all('/onCall', answerCall);


/**
 * Handle voice events
 */
app.all('/voice/event', onCallEvent);
app.all('/onCallEvent', onCallEvent);

/**
 * Handle voice fallback
 */
app.all('/voice/fallback', onFallback);

/**
 * Setup 404
 */
app.all('*', (_, res) => {
  res.status(404).json({
    status: 404,
    title: 'Not Found',
  });
});

/**
 * Handle errors
 */
app.use((err, _, res, next) => {
  log(err.stack);
  res.status(500).json({
    status: 500,
    title: 'Internal Server Error',
    detail: err.message,
  });
});

app.listen(port, () => {
  console.log(`app listening on port ${port}`);
});

startVCR();

