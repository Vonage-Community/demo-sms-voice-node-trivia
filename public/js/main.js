// const apiHost = `${location.protocol}//${location.host || 'localhost'}`;
const apiHost = window.location.origin;

const CONFETTI_ARGS = [
  {},
  { confettiRadius: 12, confettiNumber: 100 },
  { emojis: ['🌈', '⚡️', '💥', '✨', '💫', '🌸'] },
  { emojis: ['⚡️', '💥', '✨', '💫'] },
  { emojis: ['🦄'], confettiRadius: 100, confettiNumber: 30 },
  {
    confettiColors: ['#ffbe0L', '#fb5607', '#ff006e', '#8338ec', '#3a86ff'],
    confettiRadius: 10,
    confettiNumber: 150,
  },
  {
    confettiColors: ['#9b5de5', '#f15bb5', '#fee440', '#00bbf9', '#00f5d4'],
    confettiRadius: 6,
    confettiNumber: 300,
  },
];

const loadGames = async () => {
  console.log('Load Games');
  return fetch(
    `${apiHost}/games`,
    {
      method: 'GET',
    },
  )
    .then((res) => res.json())
    .then((games) => Promise.resolve((() => {
      console.log(`Games loaded`, games);
      hideSpinner();
      clearGame();
      displayGames(games);
      return games;
    })()));
};

const clearGameList = () => {
  getGameListSection().classList.add('d-none');
};

const displayGames = (games) => {
  console.log('Display Games');
  getGameListSection().classList.remove('d-none');

  const listBody = getGameListTableBody();
  listBody.innerHTML = '';
  clearGame();
  clearGameForm();

  for (const [id, game] of Object.entries(games)) {
    const row = getGameRow().content.cloneNode(true);
    const url = new URL(window.location.href);
    console.log(`Showing game ${id}`, game);
    url.searchParams.append('playGame', id);

    row.querySelector('td.game-id').innerHTML = id;
    row.querySelector('td.game-title').innerHTML = game.title;
    row.querySelector('td.game-links > a').href = url.href;
    listBody.appendChild(row);
  }
};

const removeCategory = (event) => {
  event.target.parentElement.remove();
};

const addCategory = (event) => {
  const parent = event.target.parentElement;
  const categoryInput = parent.querySelector('input');

  const clone = parent.cloneNode(true);

  const cloneButton = clone.querySelector('button');
  clone.querySelector('input').readOnly = true;

  cloneButton.classList.remove('btn-success', 'add-category');
  cloneButton.classList.add('btn-danger', 'remove-category');
  cloneButton.innerText = '-';

  parent.parentElement.insertBefore(clone, parent.nextSibling);
  categoryInput.value = null;
  categoryInput.attributes;
};

const clearGameForm = () => {
  getGameForm().reset();
  getGameFormSection().classList.add('d-none');
};

const clearRegistrationForm = () => {
  getRegistrationFormSection().innerHTML = '';
}

const submitForm = async () => {
  console.log('Submit Form');
  const gameForm = getGameForm();
  const data = new FormData(gameForm);
  const newGame = {
    title: null,
    url: null,
    airtable: null,
    categories: [],
    game_tcs: null,
  };

  for (const [name, value] of data.entries()) {
    console.log(name, value);
    if (!value) {
      continue;
    }

    if (_.isArray(newGame[name])) {
      newGame[name].push(value);
      continue;
    }

    newGame[name] = value;
  }

  newGame.url = window.location.origin;
  console.log('New Game', newGame);

  const headers = new Headers();
  headers.append('Content-Type', 'application/json');
  return fetch(
    `${apiHost}/games`,
    {
      method: 'POST',
      body: JSON.stringify(newGame),
      headers: headers,
    },
  )
    .then((res) => res.json())
    .then((game) => Promise.resolve((() => {
      clearGameForm();
      loadGames();
      // eslint-disable-next-line
      Toastify({
        text: 'Game created',
        className: 'info',
      }).showToast();
      return game;
    })()));
};

const createGame = () => {
  console.log('Create Game');
  clearGame();
  clearGameList();
  const gameFormSection = getGameFormSection();
  gameFormSection.classList.remove('d-none');
};

const fetchGame = async (gameId) => {
  console.log(`Fetching game ${gameId}`);
  window.currentGame = null;
  showSpinner('Loading game');
  return fetch(
    `${apiHost}/games/${gameId}`,
    {
      method: 'GET',
    },
  )
    .then(async (res) => {
      const game = await res.json();
      console.log('Game fetched', game);
      window.currentGame = game;
      return game;
    })
    .catch((error) => {
      console.error('Failed to complete fetch game', error);
      // eslint-disable-next-line
      Toastify({
        text: 'Failed to find game',
        className: 'error',
      }).showToast();
    });
};

const passQuestion = async () => {
  console.log('Passing question');
  showSpinner('Passing question');
  getChoicesSection()?.classList.add('d-none');
  return makeRPCCall('pass').then(displayQuestion);
};

const askQuestion = async () => {
  console.log('Asking question');
  showSpinner('Asking question');
  return makeRPCCall('ask').then(displayQuestion);
};

const makeRPCCall = async (action, parameters = null, id = null) => {
  const headers = new Headers();
  headers.append('Content-Type', 'application/json');

  const postData = {
    jsonrpc: '2.0',
    method: action,
    ...(parameters ? { parameters: parameters } : {}),
    ...(id ? { id: id } : {}),
  };

  console.log(`Making RPC Call ${getCurrentGameId()}`, postData);

  return fetch(
    `${apiHost}/games/${getCurrentGameId()}`,
    {
      method: 'PUT',
      body: JSON.stringify(postData),
      headers: headers,
    },
  )
    .then(async (res) => {
      const rpcResult = await res.json();
      console.log('RPC Result', rpcResult);
      if (rpcResult.status > 399) {
        console.log('Error');
        throw new Error(rpcResult.detail || rpcResult.title);
      }

      window.currentGame = rpcResult.result;
      return rpcResult;
    })
    .catch((error) => {
      console.error(error);
      Toastify({
        text: `Failed JSON RPC call: ${error.message}`,
        className: 'error',
        position: 'center',
        duration: 8000,
      }).showToast();
    })
    .finally(() => {
      hideSpinner();
      displayScore();
      displayQuestion();
    });
};

const buildChoiceText = (
  {
    letter,
    text,
    audience_choice: audienceChoice,
  },
  total,
) => {
  const percent = total > 0
    ? `${((audienceChoice / total) * 100).toFixed(1)}%`
    : '';

  return `${letter}: ${text} ${percent}`;
};

const answerQuestion = async (selectedChoice) => {
  console.log('Answering question', selectedChoice);
  const headers = new Headers();
  headers.append('Content-Type', 'application/json');

  const choice = selectedChoice.dataset.choice;
  console.log(`Choice ${choice}`, selectedChoice.dataset);

  showSpinner('Answering question');
  return makeRPCCall(
    'answer',
    {
      letterChoice: choice,
    },
  );
};

const confirmChoice = () => {
  getAnswerButton().disabled = true;
  const selectedChoice = getSelectedChoice();
  answerQuestion(selectedChoice)
    .then((res) => {
      console.log('Answer result', res);
      const latestQuestion = getLatestQuestion();

      getAnswerButton().classList.add('d-none');
      const correctChoice = getChoicesSection()
        .querySelector('button.correct');

      correctChoice.classList.remove('btn-info');
      correctChoice.classList.add('btn-success');

      if (!latestQuestion.answered_correctly) {
        console.log('Wrong answer');
        selectedChoice?.classList.remove('btn-info');
        selectedChoice?.classList.add('btn-danger');
        getAskButton().classList.add('d-none');
        return;
      }

      console.log('Correct Answer');

      window.jsConfetti.addConfetti(
        CONFETTI_ARGS.sort(() => 0.5 - Math.random())[0],
      );

      getAskButton().classList.remove('d-none');
    });
};

const selectChoice = (event) => {
  if (getLatestQuestion().answered) {
    console.log('Question already answered');
    return;
  }

  getChoiceButtons().forEach((button) => {
    button.classList.remove('btn-info', 'selected-choice');
  });

  event.target.classList.add('btn-info', 'selected-choice');
  getAnswerButton().disabled = false;
};

const displayQuestion = () => {
  const question = getLatestQuestion();
  console.log('Display question', question);
  hideSpinner();
  clearQuestion();


  if (!question) {
    console.log('No question to display');
    return;
  }

  document.querySelector('.question-section')
    .appendChild(buildQuestionElement());

  if (!question.answered) {
    console.log('Question answered');
    getAskButton().classList.add('d-none');
    return;
  }

  getAnswerButton().classList.add('d-none');

  if (!question.answered_correctly) {
    console.log('Question answered correctly');
    getAskButton().classList.add('d-none');
    return;
  }
  getAskButton().classList.remove('d-none');
};

const buildQuestionElement = () => {
  const question = getLatestQuestion();

  console.log('Displaying question', question);
  if (!question) {
    console.log('No question to display');
    clearQuestion();
    return;
  }

  const questionTemplate = document.getElementById('question_template');
  const questionElement = questionTemplate.content.cloneNode(true);

  const questionParts = [question.question];

  if (question.answered) {
    questionParts.push(question.answered_correctly ? '✅' : '❌');
  }

  questionElement
    .querySelector('* .question-text')
    .innerText = questionParts.join(' ');

  const choices = questionElement.querySelectorAll('button.choice');

  const totalRespondants = Object.values(question.choices).reduce(
    (acc, { audience_choice: audienceChoice }) => acc + audienceChoice,
    0,
  );

  console.log(`Total respondants ${totalRespondants}`);
  for (const [index, element] of choices.entries()) {
    const choice = Object.values(getLatestQuestion()?.choices || {})[index];
    element.innerHTML = buildChoiceText(choice, totalRespondants);
    element.dataset.choice = choice.letter;
    element.classList.remove(
      'selected-choice',
      'btn-info',
      'btn-danger',
      'btn-success',
    );

    element.classList.add('fw-bolder');
    if (choice.removed) {
      element.disabled = true;
      element.classList.remove('fw-bolder');
    }

    if (question.answered) {
      element.disabled = true;
    }

    if (question.answered && choice.letter === question.correct) {
      element.classList.add('btn-success');
      element.disabled = false;
    }

    if (choice.letter === question.correct) {
      element.classList.add('correct');
    }
  }
  return questionElement;
};

const clearQuestion = () => {
  console.log('Clear Question');
  const questionSection = document.querySelector('.question-section');
  questionSection.innerText = '';
};

const showSpinner = (text) => {
  console.log('Show spinner');
  getSpinnerMessage().innerHTML = text || 'Loading ...';
  getSpinnerSection().classList.remove('d-none');
};

const hideSpinner = () => {
  console.log('Hide spinner');
  getSpinnerSection().classList.add('d-none');
};

const enableStartCallButton = () => {
  for (const [, element] of getStartCallButton().entries()) {
    element.disabled = false;
  }
};

const enableEndCallButton = () => {
  for (const [, element] of getEndCallButton().entries()) {
    element.disabled = false;
  }
};

const disableStartCallButton = () => {
  for (const [, element] of getStartCallButton().entries()) {
    element.disabled = true;
  }
};

const disableEndCallButton = () => {
  for (const [, element] of getEndCallButton().entries()) {
    element.disabled = true;
  }
};

const getStartCallButton = () => document.querySelectorAll('.start-call');

const getEndCallButton = () => document.querySelectorAll('.end-call');

const getSpinnerSection = () => document.getElementById('spinner_section');

const getSpinnerMessage = () =>
  getSpinnerSection().querySelector('.spinner-message');

const getSignupSection = () => document.getElementById('signup_section');

const getGameListSection = () => document.getElementById('game_list_section');

const getGameRow = () => document.getElementById('game_row');

const getGameListTableBody = () => getGameListSection()
  .querySelector('tbody');

const getGameFormSection = () => document.getElementById('game_form_section');

const getGameForm = () => getGameFormSection().querySelector('form');

const getGamePlayer = () => getGameSection().querySelector('h2');

const needGameElements = () => document.querySelectorAll('.need-game');

const getAskButton = () => getChoicesSection()
  .querySelector('button.ask');

const getAnswerButton = () => getChoicesSection()
  .querySelector('button.answer');

const getGameSection = () => document.getElementById('game');

const getRegistrationFormSection = () => document.getElementById('registration-form');

const getChoiceButtons = () => getChoicesSection()
  .querySelectorAll('button.choice');

const getSelectedChoice = () => getChoicesSection()
  .querySelectorAll('button.selected-choice')[0];

const getFooterText = () => document.querySelectorAll('.footer-text');

const getScoreSection = () => getGameSection()
  .querySelector('#score_list');

const getChoicesSection = () => getGameSection()
  .querySelector('#choices_section');

const getCurrentGame = () => window.currentGame || {};

const getCurrentGameId = () => getCurrentGame()?.id;

const getGameQuestions = () => Object.values(getCurrentGame().questions || {})
  || [];

const getLatestQuestion = () => getGameQuestions().slice(-1)[0];

const getChoice = (which) => Object.values(getLatestQuestion()?.choices || {})
  .find(({ letter }) => letter === which);

const getPointScale = () => getCurrentGame()?.point_scale || [];

const getCallModal = () => document.getElementById('call');

const getCallerElement = () => getCallModal().querySelector('#caller_name');

const setModalText = (text) => {
  for (const [, element] of getFooterText().entries()) {
    element.innerHTML = text;
  }
};

const clearModalText = () => {
  setModalText('');
};

const displayScore = () => {
  console.log('Displaying score');
  const scaleList = getScoreSection();
  scaleList.innerText = '';
  const { score } = getCurrentGame();
  const scoreIndex = getPointScale().indexOf(score);
  const nextScore = getPointScale()[scoreIndex + 1];
  getPointScale().forEach((point) => {
    const pointElement = document.createElement('li');
    pointElement.innerText = new Intl.NumberFormat('en-US').format(point);
    pointElement.classList.add(
      'list-group-item',
    );

    if (point <= score) {
      pointElement.classList.add(
        'fw-bolder',
      );
    }

    if (point === nextScore) {
      pointElement.classList.add(
        'border',
        'border-4',
        'border-success',
      );
    }

    if (point > nextScore) {
      pointElement.classList.add(
        'fw-lighter',
        'bg-dark-subtle',
      );
    }

    scaleList.appendChild(pointElement);
  });
};

const disableGameOptions = () => {
  needGameElements().forEach((element) => {
    element.disabled = true;
    element.classList.add('disabled');
  });
};

const enableGameOptions = () => {
  needGameElements().forEach((element) => {
    element.disabled = false;
    element.classList.remove('disabled');
  });
};

const clearGame = () => {
  getGameSection().innerHTML = '';
  const url = new URL(apiHost);
  window.history.pushState({ path: url.href }, document.title, url.href);
  disableGameOptions();
};

const playGame = async (gameId) => {
  console.log(`Playing game: ${gameId}`);
  const gameTemplate = document.getElementById('game_template');
  const gameClone = gameTemplate.content.cloneNode(true);

  const game = await fetchGame(gameId);

  enableGameOptions();
  getGameSection().appendChild(gameClone);
  getGamePlayer().innerText = `Player: ${game?.player?.name || ''}`;
  displayScore();
  displayQuestion();

  const { numbers } = getCurrentGame();
  const numbersElement = document
    .getElementById('numbers_table');

  const numberCell = document.getElementById('join_here');
  getSignupSection().classList.add('d-none');
  if (game.url) {
    const qrcode = new QRCode(
      numberCell,
    );
    const qrCodeAddress = `${game.url}/?register=${game.id}`
    console.log('Creating QR code', qrCodeAddress);
    game.url && qrcode.makeCode(qrCodeAddress);
    getSignupSection().classList.remove('d-none');
  }

  numbersElement.innerHTML = '';

  numbers?.forEach(({ countryName, country, number }) => {
    const row = document.createElement('div');
    const countryCell = document.createElement('div');

    countryCell.innerText = countryName || country || '';
    row.appendChild(countryCell);

    const flag = new CountryFlag(countryCell);
    flag.selectByAlpha2(`${country}`.toLowerCase());

    const numberCell = document.createElement('div');
    const qrcode = new QRCode(
      numberCell,
      {
        height: 100,
        width: 100,
      },
    );
    qrcode.makeCode(`sms:${number}`);
    numberCell.append(number);

    row.appendChild(numberCell);
    numbersElement.appendChild(row);
  });

  if (!game.player) {
    showNoPlayer();
    return;
  }
};

const resetNoPlayer = () => {
  document.getElementById('score_section').classList.remove('d-none');
  document.getElementById('helpline_section').classList.remove('d-none');
  document.querySelector('.question-section').classList.remove('d-none');
  const gameRows = document
    .getElementById('game')
    .querySelectorAll('.row');

  for (const [, element] of gameRows.entries()) {
    element.classList.remove('justify-content-center');
  }
};

const showNoPlayer = () => {
  console.log('No player');
  document.querySelector('.player-name').innerText = `Please select "Find player" from the menu`;
  const gameRows = document
    .getElementById('game')
    .querySelectorAll('.row');

  for (const [, element] of gameRows.entries()) {
    element.classList.add('justify-content-center');
  }

  document.getElementById('score_section').classList.add('d-none');
  document.getElementById('helpline_section').classList.add('d-none');
  document.querySelector('.question-section').classList.add('d-none');
};

const narrowItDown = () => {
  console.log('Narrow it Down');
  showSpinner('Narrowing it down');
  makeRPCCall('life_line', { which: 'narrow_it_down',
  }).then(displayQuestion);
};


const dialADev = async () => {
  console.log('Dial a Dev');
  showSpinner('Setting up Dial a dev');
  await makeRPCCall('life_line', { which: 'phone_a_dev' });
  document.getElementById('open_dial_a_dev').click();

  const dialADevElement = document.getElementById('dial_a_dev');
  dialADevElement.querySelector('#dial_a_dev_body').innerHTML ='';
  const { jwt, dad } = getCurrentGame();

  console.log(`JWT token ${jwt}`);
  console.log('Dad: ', dad);

  const questionElement = buildQuestionElement();

  questionElement.querySelector('button.ask').classList.add('d-none');
  questionElement.querySelector('button.answer').classList.add('d-none');

  const choices = questionElement.querySelectorAll('button.choice');

  for (const [, element] of choices.entries()) {
    const { choice } = element.dataset;
    const choiceData = getChoice(choice);

    if (choiceData.removed) {
      element.classList.add('d-none');
      continue;
    }

    element.classList.remove(
      'selected-choice',
      'btn-info',
      'btn-danger',
      'btn-success',
      'choice',
    );
    element.disabled = true;
  }

  dialADevElement
    .querySelector('.dad-title').innerText = `Dial A Dev: ${dad?.name}`;

  dialADevElement.querySelector('#dial_a_dev_body')
    .appendChild(questionElement);

  setupPhoneCall(dad);

  dialADevElement
    .addEventListener('hide.bs.modal', () => {
      console.log('DAD Modal closing');
      endCall();
    });
};

const dialPlayer = async () => {
  console.log('dial player');
  showSpinner('Setting up Call player');
  await makeRPCCall('call_player');

  const { jwt } = getCurrentGame();
  console.log(`JWT token ${jwt}`);

  const { player } = getCurrentGame();
  document.getElementById('open_call').click();

  console.log(getCallerElement());
  getCallerElement().innerText = player.name;
  setupPhoneCall(player);
};

const setupPhoneCall = async (calling) => {
  console.log('Setting up phone call');

  disableStartCallButton();
  disableEndCallButton();

  try {
    const { jwt } = getCurrentGame();
    getCallerElement().innerText = calling.name;
    // eslint-disable-next-line
    const client = new vonageClientSDK.VonageClient({ debug: true });
    setModalText('Starting Call session. Please wait ...');
    await client.createSession(jwt);

    setModalText('Ready to call');

    enableStartCallButton();

    client.on('legStatusUpdate', (callId, legId, status) => {
      console.log('Leg status update', status);
      if (status.name === 'ANSWERED') {
        setModalText('Call has been answered');
      }

      if (status.name === 'RINGING') {
        setModalText('Ringing ...');
      }
    });

    client.on('callInvite', () => {
      setModalText('Calling ...');
    });

    client.on('callHangup', () => {
      setModalText(`Call has ended`);
      disableEndCallButton();
      enableStartCallButton();
    });

    client.on('sessionError', (error) => {
      setModalText(`Error when making call: ${error}`);
      enableStartCallButton();
      disableEndCallButton();
    });

    window.app = client;
    window.calling = calling;
  } catch (error) {
    // eslint-disable-next-line
    Toastify({
      text: `Could not start phone call: ${error.message}`,
      className: 'error',
      position: 'center',
      duration: 8000,
    }).showToast();
    clearModalText();
  }
};

const endCall = async () => {
  if (!window.app) {
    console.log('No App set');
    return;
  }

  if (!window.callId) {
    console.log('No Call ID set');
    return;
  }

  enableStartCallButton();
  disableEndCallButton();

  setModalText('Ending Call');

  window.app.hangup(window.callId);
  window.callId = null;
};

const startCall = async () => {
  if (!window.app) {
    console.log('No App set');
    return;
  }

  if (!window.calling) {
    console.log('No Calling set');
    return;
  }

  enableEndCallButton();
  disableStartCallButton();

  const calling = window.calling;
  console.log(`Calling ${calling.name}: ${calling.phone}`);
  setModalText(`Calling ${calling.name}`);

  window.app.serverCall({ to: calling.phone }).then((callId) => {
    console.log('Settion started');

    disableStartCallButton();
    window.callId = callId;
  });
};


const findPlayer = async () => {
  console.log('Find Player');
  showSpinner('Finding player');
  resetNoPlayer();
  getGameSection().classList.add('d-none');
  await makeRPCCall('find_player');
  getGameSection().classList.remove('d-none');
  getGamePlayer().innerText = `Player: ${window.currentGame?.player?.name || ''}`;
};

const handelButtonClickEvent = (event) => {
  const { target } = event;
  console.log(target);

  // Handle web components
  if (target.tagName.includes('-')) {
    return;
  }

  if (target.tagName === 'A' || target.tagName === 'INPUT') {
    console.log('Link clicked');
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (target.classList.contains('find-player')) {
    console.log('Find player clicked');
    findPlayer();
    return;
  }

  if (target.classList.contains('submit-new-game')) {
    console.log('Submit form clicked');
    submitForm(event);
    return;
  }

  if (target.classList.contains('remove-category')) {
    console.log('Remove category clicked');
    removeCategory(event);
    return;
  }

  if (target.classList.contains('add-category')) {
    console.log('Add category clicked');
    addCategory(event);
    return;
  }

  if (target.classList.contains('list-games')) {
    console.log('List clicked');
    loadGames();
    return;
  }

  if (target.classList.contains('create-game')) {
    console.log('Create clicked');
    createGame(event);
    return;
  }

  if (target.classList.contains('answer')) {
    console.log('Confirm clicked');
    confirmChoice(event);
    return;
  }

  if (target.classList.contains('choice')) {
    console.log('Choice clicked');
    selectChoice(event);
    return;
  }

  if (target.classList.contains('ask')) {
    console.log('Ask Clicked');
    askQuestion();
    return;
  }

  if (target.classList.contains('pass')) {
    console.log('Pass Clicked');
    passQuestion();
    return;
  }

  if (target.classList.contains('dad')) {
    console.log('Dial a Dev Clicked');
    dialADev();
    return;
  }

  if (target.classList.contains('nid')) {
    console.log('Narrow it downs Clicked');
    narrowItDown();
    return;
  }

  if (target.classList.contains('start-call')) {
    console.log('Start Call Clicked');
    startCall();
    return;
  }

  if (target.classList.contains('end-call')) {
    console.log('End Call Clicked');
    endCall();
    return;
  }

  if (target.classList.contains('call-player')) {
    console.log('Call player Clicked');
    dialPlayer();
    return;
  }

  if (target.classList.contains('tta')) {
    console.log('Text the audience Clicked');
    textTheAudience();
    return;
  }

  if (target.classList.contains('submit-registration')) {
    console.log('Submitting registration');
    submitRegistration();
    return;
  }
};

const textTheAudience = () => {
  console.log('Text the audience');
  showAudienceResponses();
  document.getElementById('open_tta').click();
  showSpinner('Setting up Text the audience');
  makeRPCCall(
    'life_line',
    { which: 'text_the_audience' },
  ).then(pollAudienceStatus);
};

const stopPolling = () => {
  clearInterval(window.audiencePollId);
};

const pollAudienceStatus = () => {
  console.log('Polling audience status');
  window.audiencePollId = setInterval(
    () => {
      console.log('Counting status');
      makeRPCCall('load_game').then(showAudienceResponses);
    },
    1000,
  );

  document.getElementById('tta')
    .addEventListener('hide.bs.modal', () => {
      console.log('TTA Modal closing');
      stopPolling();
      makeRPCCall('load_game').then(displayQuestion);
    });
};

const showAudienceResponses = () => {
  console.log('Showing responses');

  const profileElement = document.getElementById('audience_profiles');
  const questionElement = buildQuestionElement();

  questionElement.querySelector('button.ask').classList.add('d-none');
  questionElement.querySelector('button.answer').classList.add('d-none');

  const choices = questionElement.querySelectorAll('button.choice');

  for (const [, element] of choices.entries()) {
    const { choice } = element.dataset;
    const choiceData = getChoice(choice);

    if (choiceData.removed) {
      element.classList.add('d-none');
      continue;
    }

    element.classList.remove(
      'selected-choice',
      'btn-info',
      'btn-danger',
      'btn-success',
      'choice',
    );
    element.disabled = true;
  }
  profileElement.innerHTML = '';
  profileElement.appendChild(questionElement);
};

const registerForGame = async (gameId) => {
  const game = await fetchGame(gameId);
  hideSpinner();

  const template = document.getElementById('registration_template');
  const templateClone = template.content.cloneNode(true);
  const registrationForm = templateClone.querySelector('registration-form');
  registrationForm.setAttribute('game_tcs', game.game_tcs);
  
  clearGameForm();
  getRegistrationFormSection().appendChild(templateClone);
}

const thanksForRegistering = async (gameId) => {
  const template = document.getElementById('registration_thanks_template');
  const templateClone = template.content.cloneNode(true);

  getRegistrationFormSection().appendChild(templateClone);
  return;
}

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  document.addEventListener('click', handelButtonClickEvent);

  if (urlParams.has('playGame')) {
    const gameId = urlParams.get('playGame');

    window.jsConfetti = new JSConfetti();
  
    disableGameOptions();
  
    if (gameId) {
      playGame(gameId);
      getGameListSection().classList.add('d-none');
      return;
    }
  }

  if (urlParams.has('register')) {
    const gameId = urlParams.get('register');
    disableGameOptions();
    if (gameId) {
      registerForGame(gameId);
      getGameListSection().classList.add('d-none');
    }
    return;
  };

  if (urlParams.has('register_thanks')) {
    disableGameOptions();
    const gameId = urlParams.get('register_thanks');
    if (gameId) {
      thanksForRegistering(gameId);
      getGameListSection().classList.add('d-none');
    }
    return;
  };

  loadGames();
});
