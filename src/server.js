import Express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { createGame, getGame, getAllGames } from './game.js';
import debug from 'debug';

const log = debug('@vonage.game.server');

dotenv.config();

const rootDir = path.dirname(path.dirname(import.meta.url)).replace(
  'file://',
  '',
);

const app = new Express();
const port = process.env.PORT || process.env.VCR_PORT || 3000;

const catchAsync = (fn) => (req, res, next) => {
  fn(req, res, next).catch(next);
};

app.use(Express.static(rootDir + '/public'));
app.use(Express.json());

app.get('/_/health', (req, res) => {
  res.status(200);
});

/**
 * Return the home page
 */
app.get('/', catchAsync(async (req, res) => {
  log('Home Page');
  res.sendFile(`${rootDir}/public/index.html`);
}));

/**
 * List all games
 */
app.get('/games', catchAsync(async (req, res) => {
  const games = getAllGames();
  log('Games', games);

  res.send(games);
}));

/**
 * Create a game
 */
app.post('/games', catchAsync(async (req, res) => {
  const { title, url, categories } = req.body;
  log(`Create game`);

  const game = await createGame(title, url, categories);
  log('Created game', game);

  res.send(game);
}));

/**
 * Fetch a Game
 */
app.get('/games/:gameId', catchAsync(async (req, res) => {
  const { gameId } = req.params;
  log(`Getting game: ${gameId}`);

  const game = getGame(gameId);
  log(`Game`, game);

  res.send(game);
}));

/**
 * Make an RPC call
 */
app.put('/games/:gameId', catchAsync(async (req, res) => {
  const { gameId } = req.params;
  const { method, parameters, id } = req.body;
  log(`RPC call for game: ${gameId}`, req.body);

  const game = getGame(gameId);
  log(`RPC Method: ${method}`);

  switch (method) {
  case 'call_player':
    await game.getJwt();
    break;

  case 'find_player':
    await game.findPlayer();
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

  case 'count_answers':
    await game.countAudienceAnswers(parameters);
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
app.all('/inbound/:gameId?', catchAsync(async (req, res) => {
  const body = req.body;
  const { gameId } = req.params;
  log(`Inbound SMS ${gameId}`, body);
  if (gameId) {
    const game = getGame(gameId);
    game.processAudienceResponse(body);
  }

  res.status(200).json({ status: 'accepted' });
}));

/**
 * Status Listener
 */
app.all('/status/:gameId?', catchAsync(async (req, res) => {
  const body = req.body;
  const { gameId } = req.params;
  log(`Status ${gameId}`, body);

  res.status(200).json({ status: 'accepted' });
}));

/**
 * Handle voice answer
 */
app.all('/voice/answer', (req, res) => {
  log('Answer: ', req.body);
  let ncco = [
    {
      'action': 'talk',
      'text': 'No destination user - hanging up',
    },
  ];

  const username = req.body.to;
  if (username) {
    ncco = [
      {
        'action': 'connect',
        'from': process.env.FROM_NUMBER,
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
});

/**
 * Handle voice events
 */
app.all('/voice/event', (req, res) => {
  log('Event:', req.body);
  res.sendStatus(200);
});

/**
 * Handle voice fallback
 */
app.all('/voice/fallback', (req, res) => {
  log('Fallback:', req.body);
  res.sendStatus(200);
});

/**
 * Setup 404
 */
app.all('*', (req, res) => {
  res.status(404).json({
    status: 404,
    title: 'Not Found',
  });
});

/**
 * Handel errors
 */
app.use((err, req, res, next) => {
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

