const stage = document.querySelector('#stage');
const bloomSprite = document.querySelector('#bloomSprite');
const naturalLoop = document.querySelector('#naturalLoop');
const statusText = document.querySelector('#statusText');
const nowPlaying = document.querySelector('#nowPlaying');
const durationText = document.querySelector('#durationText');
const queueCount = document.querySelector('#queueCount');
const queueList = document.querySelector('#queueList');

const labels = {
  idle: ['Idle', 'Idle breathing', 'Ambient'],
  blink: ['Blinking', 'Soft blink', '0.45 sec'],
  wave: ['Waving', 'Friendly wave', '2.4 sec'],
  eat: ['Eating', 'Berry snack', '3.2 sec'],
  sleep: ['Sleeping', 'Cozy nap', '5 sec'],
  celebrate: ['Celebrating', 'Happy celebration', '3 sec'],
};

const durations = { blink: 450, wave: 2400, eat: 3200, sleep: 5000, celebrate: 3000 };
const framePositions = [
  ['0%', '0%'], ['50%', '0%'], ['100%', '0%'],
  ['0%', '100%'], ['50%', '100%'], ['100%', '100%'],
];
const waveFrames = [0, 1, 2, 1, 2, 1, 0, 3, 4, 5, 4, 3, 0];
const ambientActions = ['blink', 'wave', 'eat', 'celebrate', 'sleep'];

let current = 'idle';
let queue = [];
let frameTimer;
let actionTimer;
let ambientTimer;
let ambientBag = [];

function setFrame(index) {
  const [x, y] = framePositions[index];
  bloomSprite.style.backgroundPosition = `${x} ${y}`;
}

function updateDisplay() {
  const [status, playing, duration] = labels[current];
  statusText.textContent = status;
  nowPlaying.textContent = playing;
  durationText.textContent = duration;
  queueCount.textContent = String(queue.length);
  queueList.textContent = queue.length ? queue.map((item) => labels[item][0]).join(' → ') : 'Nothing queued';
}

function clearStateClasses() {
  stage.classList.remove('is-blinking', 'is-eating', 'is-sleeping', 'is-celebrating');
}

function shuffle(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function scheduleAmbient() {
  clearTimeout(ambientTimer);
  if (!naturalLoop.checked || current !== 'idle' || queue.length) return;
  const delay = 8000 + Math.floor(Math.random() * 6001);
  ambientTimer = setTimeout(() => {
    if (!ambientBag.length) ambientBag = shuffle(ambientActions);
    requestAction(ambientBag.shift());
  }, delay);
}

function finishAction() {
  clearInterval(frameTimer);
  clearTimeout(actionTimer);
  clearStateClasses();
  setFrame(0);
  current = 'idle';
  updateDisplay();
  if (queue.length) play(queue.shift());
  else scheduleAmbient();
}

function play(action) {
  clearTimeout(ambientTimer);
  current = action;
  clearStateClasses();
  setFrame(action === 'celebrate' ? 3 : 0);
  updateDisplay();

  if (action === 'idle') {
    finishAction();
    return;
  }

  if (action === 'blink') stage.classList.add('is-blinking');
  if (action === 'eat') stage.classList.add('is-eating');
  if (action === 'sleep') stage.classList.add('is-sleeping');
  if (action === 'celebrate') stage.classList.add('is-celebrating');
  if (action === 'wave') {
    let step = 0;
    setFrame(waveFrames[step]);
    frameTimer = setInterval(() => {
      step += 1;
      if (step < waveFrames.length) setFrame(waveFrames[step]);
    }, 180);
  }

  actionTimer = setTimeout(finishAction, durations[action]);
}

function requestAction(action) {
  if (action === 'idle') {
    queue = [];
    if (current === 'idle') scheduleAmbient();
    else queue.push('idle');
    updateDisplay();
    return;
  }
  if (current === 'idle' && queue.length === 0) play(action);
  else {
    queue.push(action);
    updateDisplay();
  }
}

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => requestAction(button.dataset.action));
});

document.querySelector('#clearQueue').addEventListener('click', () => {
  queue = [];
  updateDisplay();
  scheduleAmbient();
});

naturalLoop.addEventListener('change', scheduleAmbient);
setFrame(0);
updateDisplay();
scheduleAmbient();
