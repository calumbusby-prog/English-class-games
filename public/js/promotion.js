// "Say What You Mean" — a solo, single-page workplace scenario game.
// No server needed: everything runs client-side in the browser.

const VOCAB = {
  direct: [
    ['Assertive', 'Confident, but not rude — you say clearly what you want.'],
    ['Blunt', "So honest it can sound rude."],
    ['Straightforward', 'Gets straight to the point, even about difficult things.'],
    ['Outspoken', "Happy to share your opinion, even if it's unpopular."],
  ],
  indirect: [
    ['Tactful', 'Careful and kind about difficult topics.'],
    ['Reserved', "Quiet, doesn't show feelings easily with new people."],
    ['Vague', "Not clear; hard to know what they really mean."],
    ['Passive-aggressive', 'Shows anger in an indirect way, not openly.'],
  ],
};

const START_SCORE = 50;
const MAX_SCORE = 100;
const MIN_SCORE = 0;

const SCENARIOS = [
  {
    setup: 'Week 1. A demanding new client hands you a brief that spells out every step — no room, it seems, for your own ideas.',
    prompt: 'The client says: "Just follow this exactly, please." How do you respond?',
    options: [
      {
        word: 'Assertive', style: 'direct', good: true, delta: 12,
        line: '"Happy to follow this — and I have a quick idea that could save us a few days, if you\'re open to it."',
        feedback: 'Good call. Assertive means clear and confident without being rude — you respected the client\'s plan and still made your idea heard.',
      },
      {
        word: 'Reserved', style: 'indirect', good: false, delta: -8,
        line: 'You nod, say nothing, and follow the instructions exactly — even though you can see a faster way.',
        feedback: 'Staying reserved felt safe, but the client never learns you had a better idea. A quiet, missed chance to add value.',
      },
    ],
  },
  {
    setup: 'Week 2. Minutes before your colleague walks into a big pitch, you notice a typo on the very first slide of their deck.',
    prompt: 'What do you do?',
    options: [
      {
        word: 'Tactful', style: 'indirect', good: true, delta: 13,
        line: 'You pull them aside quietly, out of earshot, and give them a quick, kind heads-up before they go in.',
        feedback: "Exactly right. Tactful doesn't mean silent — it means handling a difficult moment carefully so nobody gets embarrassed.",
      },
      {
        word: 'Blunt', style: 'direct', good: false, delta: -13,
        line: '"Heads up, there\'s a typo on slide one," you mention as the room is already filling up and settling in.',
        feedback: 'The information was correct, but blunt honesty delivered right there in the open embarrassed your colleague as people were watching.',
      },
    ],
  },
  {
    setup: 'Week 3. A new teammate keeps leaving sticky notes about your messy desk instead of ever mentioning it out loud.',
    prompt: 'You decide to finally deal with it. How?',
    options: [
      {
        word: 'Straightforward', style: 'direct', good: true, delta: 12,
        line: '"Hey — I noticed the notes. If something\'s bothering you, just tell me directly and I\'ll sort it out."',
        feedback: 'Well handled. Being straightforward cleared the air fast and set a healthier norm for how you two work together.',
      },
      {
        word: 'Passive-aggressive', style: 'indirect', good: false, delta: -13,
        line: 'You leave a sarcastic sticky note back on their desk instead of saying anything.',
        feedback: 'Passive-aggressive point-scoring might feel satisfying, but it escalates the tension instead of solving it.',
      },
    ],
  },
  {
    setup: "Week 4. In a planning meeting, your manager asks the room what they think of a risky new plan. You're the newest person there, and everyone else seems keen.",
    prompt: 'Do you speak up?',
    options: [
      {
        word: 'Outspoken', style: 'direct', good: true, delta: 12,
        line: '"I can see the upside — but I think there\'s a real risk with the timeline. Can we talk through it?"',
        feedback: 'Good instinct. Being outspoken here, even as the newest voice, is what good managers actually want to hear.',
      },
      {
        word: 'Vague', style: 'indirect', good: false, delta: -8,
        line: '"It could work, I guess — hard to say," you offer, giving away nothing.',
        feedback: 'A vague non-answer keeps you safe, but it also tells your manager you have nothing to contribute.',
      },
    ],
  },
  {
    setup: 'Week 5. At a team lunch, two colleagues start debating politics and turn to you, waiting for your opinion.',
    prompt: 'How do you respond?',
    options: [
      {
        word: 'Tactful', style: 'indirect', good: true, delta: 13,
        line: '"I try to keep work lunches neutral on this one — but tell me more about your trip instead!" you say, smiling.',
        feedback: "Smart move. Sometimes tactful, diplomatic vagueness is exactly right — not every moment calls for a strong opinion.",
      },
      {
        word: 'Outspoken', style: 'direct', good: false, delta: -13,
        line: '"Honestly? I think you\'re both wrong," you say, and lay out exactly where you stand.',
        feedback: "Being outspoken is usually an asset, but here it cost you — a work lunch isn't the moment for a strong, unfiltered opinion.",
      },
    ],
  },
  {
    setup: 'Week 6. A senior colleague near your desk keeps taking loud personal calls right through your focus time.',
    prompt: 'What do you say?',
    options: [
      {
        word: 'Tactful', style: 'indirect', good: true, delta: 12,
        line: '"Would you mind grabbing calls in the break room? I\'m trying to focus and I don\'t want to lose my train of thought!"',
        feedback: 'That landed well. A tactful, friendly ask solved the problem without making it a confrontation.',
      },
      {
        word: 'Blunt', style: 'direct', good: false, delta: -12,
        line: '"You\'re on the phone constantly and it\'s making it hard to focus," you say plainly, right at your desk, mid-call.',
        feedback: 'The point was fair, but blunt feedback delivered on the spot, in front of others, landed as public criticism of a senior colleague.',
      },
    ],
  },
  {
    setup: "Week 7. Deadline in two days — and the teammate sharing your project hasn't delivered their half.",
    prompt: 'How do you handle it?',
    options: [
      {
        word: 'Assertive', style: 'direct', good: true, delta: 13,
        line: '"We\'re close to the deadline and I need your part by tomorrow morning — can we make a plan together?"',
        feedback: 'Nicely done. Assertive, direct communication got the real problem on the table in time to fix it.',
      },
      {
        word: 'Passive-aggressive', style: 'indirect', good: false, delta: -12,
        line: 'You quietly redo their half yourself overnight, then mention to other teammates how "some people" don\'t pull their weight.',
        feedback: 'It got the work done, but passive-aggressive venting behind their back eroded trust on the team.',
      },
    ],
  },
  {
    setup: 'Week 8. Performance review time. Your manager gives feedback on a project you worked hard on — and it feels off-base to you.',
    prompt: 'How do you respond in the room?',
    options: [
      {
        word: 'Straightforward', style: 'direct', good: true, delta: 13,
        line: '"Thanks for the feedback — can I share my perspective on that part? I saw it a bit differently."',
        feedback: 'That took confidence. A calm, straightforward response showed maturity without being defensive.',
      },
      {
        word: 'Reserved', style: 'indirect', good: false, delta: -9,
        line: 'You nod and accept everything without a word, even though you disagree — and stew about it for days.',
        feedback: 'Staying reserved avoided an awkward moment, but your manager now believes you fully agreed — and the resentment lingers.',
      },
    ],
  },
];

let state = null;

function clampScore(n) {
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, n));
}

function shuffled(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function newGame() {
  state = {
    screen: 'intro',
    scenarioIndex: 0,
    score: START_SCORE,
    picked: null,
    currentOptions: shuffled(SCENARIOS[0].options),
    history: [], // { word, style, good }
  };
  render();
}

function pickOption(scenario, option) {
  if (state.picked) return;
  state.picked = option;
  state.score = clampScore(state.score + option.delta);
  state.history.push({ word: option.word, style: option.style, good: option.good });
  render();
}

function nextScenario() {
  state.scenarioIndex += 1;
  state.picked = null;
  if (state.scenarioIndex >= SCENARIOS.length) {
    state.screen = 'outcome';
  } else {
    state.currentOptions = shuffled(SCENARIOS[state.scenarioIndex].options);
  }
  render();
}

function outcomeFor(score) {
  if (score >= 85) {
    return {
      tier: 'best',
      title: 'You receive a promotion!',
      body: "Your manager pulls you aside: \"People trust what you tell them, and how you tell them. That's exactly the judgment we need at the next level.\" Congratulations.",
    };
  }
  if (score >= 60) {
    return {
      tier: 'good',
      title: 'Solid standing — but not this time.',
      body: 'You\'ve earned real respect this quarter, and people enjoy working with you. The promotion goes to a colleague this round, but you\'re clearly on the shortlist for next time.',
    };
  }
  if (score >= 35) {
    return {
      tier: 'mixed',
      title: 'People find you hard to read.',
      body: "You get the work done, but a few too many misjudged moments left colleagues unsure where they stand with you. You're not moving up any time soon.",
    };
  }
  return {
    tier: 'worst',
    title: 'Reassigned — to somewhere quieter.',
    body: 'After a string of difficult moments, your manager moves you to a smaller role with less visibility "while things settle down." A hard quarter.',
  };
}

function vocabPanelHTML() {
  const dl = (list) => list.map(([w, d]) => `<dt>${w}</dt><dd>${d}</dd>`).join('');
  return `
    <button class="vocab-toggle" id="vocabToggle" type="button">Need a hint? Show the word list</button>
    <div class="vocab-panel" id="vocabPanel">
      <dl class="vocab-grid">
        <h4>Direct</h4>
        ${dl(VOCAB.direct)}
        <h4>Indirect</h4>
        ${dl(VOCAB.indirect)}
      </dl>
    </div>
  `;
}

function renderIntro() {
  const allWords = [...VOCAB.direct, ...VOCAB.indirect].map(([w]) => w);
  return `
    <div class="card">
      <h2>Navigate the office. Choose your words.</h2>
      <p>Over 8 tricky moments at work, you'll choose how to respond — <strong>directly</strong> or
      <strong>indirectly</strong>. Sometimes bluntness backfires. Sometimes staying quiet costs you.
      There's no single "always right" style — read the moment and choose the word that fits it.</p>
      <p class="muted">Best outcome: <strong>you receive a promotion.</strong></p>
      <div>${allWords.map((w) => `<span class="intro-word-pill">${w}</span>`).join('')}</div>
      <button class="primary block" id="startBtn" style="margin-top:18px;">Start the quarter</button>
    </div>
  `;
}

function renderScenario() {
  const s = SCENARIOS[state.scenarioIndex];
  const picked = state.picked;

  const meter = `
    <div class="meter-row">
      <span class="meter-label">Reputation</span>
      <div class="meter"><div class="meter-fill" style="width:${state.score}%"></div></div>
    </div>
    <div class="progress-note">Week ${state.scenarioIndex + 1} of ${SCENARIOS.length}</div>
  `;

  const options = state.currentOptions
    .map((opt, i) => {
      const disabled = picked ? 'disabled' : '';
      let cls = 'option-btn';
      if (picked === opt) cls += ' selected';
      return `
        <button class="${cls}" data-idx="${i}" ${disabled}>
          <span class="option-word">${opt.word}<span class="style-tag">${opt.style}</span></span>
          <span class="option-line">${opt.line}</span>
        </button>
      `;
    })
    .join('');

  const feedback = picked
    ? `
      <div class="card feedback-card ${picked.good ? 'good' : 'bad'}">
        <div class="feedback-tag">${picked.good ? '✓ Sharp call' : '✗ That missed'}</div>
        <div class="feedback-text">${picked.feedback}</div>
      </div>
      <button class="primary block" id="nextBtn">
        ${state.scenarioIndex + 1 >= SCENARIOS.length ? 'See how the quarter went' : 'Next moment'}
      </button>
    `
    : '';

  return `
    ${meter}
    <div class="card">
      <p class="scenario-setup">${s.setup}</p>
      <p class="scenario-prompt">${s.prompt}</p>
      <div class="choices" style="grid-template-columns: 1fr;">${options}</div>
      ${vocabPanelHTML()}
    </div>
    ${feedback}
  `;
}

function renderOutcome() {
  const outcome = outcomeFor(state.score);
  const recap = state.history
    .map((h, i) => `<li><span>Week ${i + 1}</span><span class="recap-word ${h.good ? 'good' : 'bad'}">${h.word}</span></li>`)
    .join('');
  const directCount = state.history.filter((h) => h.style === 'direct').length;
  const indirectCount = state.history.length - directCount;

  return `
    <div class="card outcome-card ${outcome.tier}">
      <div class="outcome-score">Reputation: ${state.score} / 100</div>
      <h2 class="outcome-title">${outcome.title}</h2>
      <p>${outcome.body}</p>
      <p class="muted">You leaned direct ${directCount} times and indirect ${indirectCount} times this quarter.</p>
      <ul class="recap-list">${recap}</ul>
    </div>
    <button class="primary block" id="restartBtn">Play again</button>
  `;
}

function render() {
  const app = document.getElementById('app');
  if (state.screen === 'intro') {
    app.innerHTML = renderIntro();
    document.getElementById('startBtn').addEventListener('click', () => {
      state.screen = 'scenario';
      render();
    });
    return;
  }

  if (state.screen === 'scenario') {
    app.innerHTML = renderScenario();
    const s = SCENARIOS[state.scenarioIndex];
    app.querySelectorAll('.option-btn').forEach((btn) => {
      btn.addEventListener('click', () => pickOption(s, state.currentOptions[Number(btn.dataset.idx)]));
    });
    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn) nextBtn.addEventListener('click', nextScenario);
    const vocabToggle = document.getElementById('vocabToggle');
    if (vocabToggle) {
      vocabToggle.addEventListener('click', () => {
        document.getElementById('vocabPanel').classList.toggle('open');
      });
    }
    return;
  }

  if (state.screen === 'outcome') {
    app.innerHTML = renderOutcome();
    document.getElementById('restartBtn').addEventListener('click', newGame);
  }
}

newGame();
