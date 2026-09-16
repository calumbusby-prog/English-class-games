import crypto from 'crypto';

const PHASES = {
  LOBBY: 'LOBBY',
  ROLE_REVEAL: 'ROLE_REVEAL',
  CHALLENGE_ASK: 'CHALLENGE_ASK',
  CHALLENGE_REVEAL: 'CHALLENGE_REVEAL',
  ROUND_TABLE: 'ROUND_TABLE',
  VOTING: 'VOTING',
  BANISH_REVEAL: 'BANISH_REVEAL',
  MURDER_CHOICE: 'MURDER_CHOICE',
  MURDER_REVEAL: 'MURDER_REVEAL',
  GAME_OVER: 'GAME_OVER',
};

const DEFAULT_SETTINGS = {
  traitorCount: null, // null = auto (~1 per 5 players)
  pointsPerCorrect: 100,
  questionSeconds: 20,
  discussionSeconds: 90,
  votingSeconds: 30,
  questionsPerRound: 3,
};

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Room {
  constructor(code) {
    this.code = code;
    this.hostSecret = crypto.randomUUID();
    this.hostSocketId = null;
    this.phase = PHASES.LOBBY;
    this.players = new Map(); // id -> player
    this.questions = []; // {text, correct, wrong: []}
    this.settings = { ...DEFAULT_SETTINGS };
    this.round = 0;
    this.pot = 0;
    this.questionQueue = [];
    this.currentQuestion = null; // {text, choices, correctIndex, revealed}
    this.answers = new Map(); // playerId -> choiceIndex
    this.votes = new Map(); // playerId -> targetId
    this.murderChoices = new Map(); // traitorId -> targetId
    this.log = [];
    this.deadline = null; // ms epoch, for timed phases
    this._timer = null;
    this.lastBanished = null;
    this.lastMurdered = null;
    this.winner = null;
    this.createdAt = Date.now();
  }

  addLog(text) {
    this.log.push({ text, at: Date.now() });
    if (this.log.length > 200) this.log.shift();
  }

  alivePlayers() {
    return [...this.players.values()].filter((p) => p.alive);
  }

  addPlayer(name) {
    const id = crypto.randomUUID();
    const token = crypto.randomUUID();
    const player = {
      id,
      token,
      name,
      socketId: null,
      connected: false,
      alive: true,
      role: null,
      score: 0,
      eliminatedBy: null, // 'banished' | 'murdered'
    };
    this.players.set(id, player);
    this.addLog(`${name} joined the game.`);
    return player;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (p) this.players.delete(id);
  }

  setQuestions(questions) {
    this.questions = questions;
  }

  setSettings(settings) {
    this.settings = { ...this.settings, ...settings };
  }

  clearTimer() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  scheduleTimer(seconds, fn) {
    this.clearTimer();
    this.deadline = Date.now() + seconds * 1000;
    this._timer = setTimeout(() => {
      this.deadline = null;
      fn();
    }, seconds * 1000);
  }

  startGame() {
    if (this.phase !== PHASES.LOBBY) return { error: 'Game already started.' };
    const players = [...this.players.values()];
    if (players.length < 4) return { error: 'Need at least 4 players to start.' };
    if (this.questions.length < 1) return { error: 'Add at least one question first.' };

    const traitorCount = Math.max(
      1,
      Math.min(
        players.length - 2,
        this.settings.traitorCount || Math.round(players.length / 5) || 1
      )
    );
    const shuffled = shuffle(players);
    shuffled.forEach((p, i) => {
      p.role = i < traitorCount ? 'traitor' : 'faithful';
      p.alive = true;
      p.score = 0;
      p.eliminatedBy = null;
    });
    this.round = 0;
    this.pot = 0;
    this.lastBanished = null;
    this.lastMurdered = null;
    this.winner = null;
    this.log = [];
    this.addLog(`The game begins. ${traitorCount} traitor(s) walk among ${players.length} players.`);
    this.phase = PHASES.ROLE_REVEAL;
    return {};
  }

  checkWin() {
    const alive = this.alivePlayers();
    const traitors = alive.filter((p) => p.role === 'traitor');
    const faithful = alive.filter((p) => p.role === 'faithful');
    if (traitors.length === 0) return 'faithful';
    if (traitors.length >= faithful.length) return 'traitors';
    return null;
  }

  buildQuestionQueue() {
    this.questionQueue = shuffle(this.questions.map((_, i) => i));
  }

  startNextQuestion() {
    if (this.questionQueue.length === 0) this.buildQuestionQueue();
    const idx = this.questionQueue.shift();
    const q = this.questions[idx];
    const options = shuffle([q.correct, ...q.wrong]);
    const correctIndex = options.indexOf(q.correct);
    this.currentQuestion = {
      text: q.text,
      choices: options,
      correctIndex,
      revealed: false,
    };
    this.answers = new Map();
    this.phase = PHASES.CHALLENGE_ASK;
    this.scheduleTimer(this.settings.questionSeconds, () => this.revealQuestion());
  }

  beginNewRound() {
    this.round += 1;
    this.questionsAskedThisRound = 0;
    this.startNextQuestion();
  }

  submitAnswer(playerId, choiceIndex) {
    const p = this.players.get(playerId);
    if (!p || !p.alive || this.phase !== PHASES.CHALLENGE_ASK) return;
    if (this.answers.has(playerId)) return;
    this.answers.set(playerId, choiceIndex);
    const alive = this.alivePlayers();
    if (this.answers.size >= alive.length) this.revealQuestion();
  }

  revealQuestion() {
    if (this.phase !== PHASES.CHALLENGE_ASK) return;
    this.clearTimer();
    const cq = this.currentQuestion;
    cq.revealed = true;
    let correctCount = 0;
    for (const [playerId, choiceIndex] of this.answers.entries()) {
      if (choiceIndex === cq.correctIndex) {
        const p = this.players.get(playerId);
        if (p) {
          p.score += this.settings.pointsPerCorrect;
          this.pot += this.settings.pointsPerCorrect;
          correctCount++;
        }
      }
    }
    this.addLog(`${correctCount} player(s) answered correctly. Pot is now ${this.pot}.`);
    this.phase = PHASES.CHALLENGE_REVEAL;
    this.questionsAskedThisRound = (this.questionsAskedThisRound || 0) + 1;
  }

  afterChallengeReveal() {
    const askedThisRound = this.questionsAskedThisRound || 0;
    const target = Math.min(this.settings.questionsPerRound, this.questions.length);
    if (askedThisRound >= target) {
      this.questionsAskedThisRound = 0;
      this.startRoundTable();
    } else {
      this.startNextQuestion();
    }
  }

  startRoundTable() {
    this.phase = PHASES.ROUND_TABLE;
    this.addLog('The Round Table begins. Discuss who you suspect.');
    this.scheduleTimer(this.settings.discussionSeconds, () => this.startVoting());
  }

  startVoting() {
    this.clearTimer();
    this.votes = new Map();
    this.phase = PHASES.VOTING;
    this.addLog('Voting is open.');
    this.scheduleTimer(this.settings.votingSeconds, () => this.revealBanishment());
  }

  submitVote(playerId, targetId) {
    const p = this.players.get(playerId);
    if (!p || !p.alive || this.phase !== PHASES.VOTING) return;
    if (!this.players.get(targetId)?.alive) return;
    this.votes.set(playerId, targetId);
    const alive = this.alivePlayers();
    if (this.votes.size >= alive.length) this.revealBanishment();
  }

  revealBanishment() {
    if (this.phase !== PHASES.VOTING) return;
    this.clearTimer();
    const tally = new Map();
    for (const targetId of this.votes.values()) {
      tally.set(targetId, (tally.get(targetId) || 0) + 1);
    }
    let banishedId = null;
    let max = -1;
    let tied = [];
    for (const [id, count] of tally.entries()) {
      if (count > max) {
        max = count;
        tied = [id];
      } else if (count === max) {
        tied.push(id);
      }
    }
    if (tied.length > 0) banishedId = tied[Math.floor(Math.random() * tied.length)];

    this.voteTally = [...tally.entries()].map(([id, count]) => ({
      id,
      name: this.players.get(id)?.name,
      count,
    }));

    if (banishedId) {
      const p = this.players.get(banishedId);
      p.alive = false;
      p.eliminatedBy = 'banished';
      this.lastBanished = { id: p.id, name: p.name, role: p.role };
      this.addLog(`${p.name} has been banished. They were a ${p.role === 'traitor' ? 'Traitor' : 'Faithful'}.`);
    } else {
      this.lastBanished = null;
      this.addLog('No one received any votes. No one is banished.');
    }
    this.phase = PHASES.BANISH_REVEAL;

    const result = this.checkWin();
    if (result) {
      this.winner = result;
    }
  }

  afterBanishReveal() {
    if (this.winner) {
      this.phase = PHASES.GAME_OVER;
      this.addLog(this.winner === 'faithful' ? 'All traitors banished. Faithful win!' : 'Traitors equal or outnumber the Faithful. Traitors win!');
      this.clearTimer();
      return;
    }
    const traitorsAlive = this.alivePlayers().filter((p) => p.role === 'traitor');
    if (traitorsAlive.length === 0) {
      // shouldn't happen due to checkWin, but safety net
      this.beginNewRound();
      return;
    }
    this.murderChoices = new Map();
    this.phase = PHASES.MURDER_CHOICE;
    this.addLog('The traitors are choosing their next victim...');
    this.scheduleTimer(this.settings.votingSeconds, () => this.revealMurder());
  }

  submitMurderChoice(playerId, targetId) {
    const p = this.players.get(playerId);
    if (!p || !p.alive || p.role !== 'traitor' || this.phase !== PHASES.MURDER_CHOICE) return;
    if (!this.players.get(targetId)?.alive || this.players.get(targetId)?.role !== 'faithful') return;
    this.murderChoices.set(playerId, targetId);
    const traitorsAlive = this.alivePlayers().filter((x) => x.role === 'traitor');
    if (this.murderChoices.size >= traitorsAlive.length) this.revealMurder();
  }

  revealMurder() {
    if (this.phase !== PHASES.MURDER_CHOICE) return;
    this.clearTimer();
    const tally = new Map();
    for (const targetId of this.murderChoices.values()) {
      tally.set(targetId, (tally.get(targetId) || 0) + 1);
    }
    let victimId = null;
    let max = -1;
    let tied = [];
    for (const [id, count] of tally.entries()) {
      if (count > max) {
        max = count;
        tied = [id];
      } else if (count === max) {
        tied.push(id);
      }
    }
    if (tied.length > 0) victimId = tied[Math.floor(Math.random() * tied.length)];
    else {
      const faithfulAlive = this.alivePlayers().filter((p) => p.role === 'faithful');
      if (faithfulAlive.length > 0) victimId = faithfulAlive[Math.floor(Math.random() * faithfulAlive.length)].id;
    }

    if (victimId) {
      const p = this.players.get(victimId);
      p.alive = false;
      p.eliminatedBy = 'murdered';
      this.lastMurdered = { id: p.id, name: p.name, role: p.role };
      this.addLog(`${p.name} was murdered in the night.`);
    } else {
      this.lastMurdered = null;
    }
    this.phase = PHASES.MURDER_REVEAL;

    const result = this.checkWin();
    if (result) this.winner = result;
  }

  afterMurderReveal() {
    if (this.winner) {
      this.phase = PHASES.GAME_OVER;
      this.addLog(this.winner === 'faithful' ? 'All traitors banished. Faithful win!' : 'Traitors equal or outnumber the Faithful. Traitors win!');
      this.clearTimer();
      return;
    }
    this.beginNewRound();
  }

  // Advance the state machine one step (used by the host's "Next" button,
  // and also called automatically when timers/answers complete a phase).
  hostAdvance() {
    switch (this.phase) {
      case PHASES.ROLE_REVEAL:
        this.beginNewRound();
        return {};
      case PHASES.CHALLENGE_ASK:
        this.revealQuestion();
        return {};
      case PHASES.CHALLENGE_REVEAL:
        this.afterChallengeReveal();
        return {};
      case PHASES.ROUND_TABLE:
        this.startVoting();
        return {};
      case PHASES.VOTING:
        this.revealBanishment();
        return {};
      case PHASES.BANISH_REVEAL:
        this.afterBanishReveal();
        return {};
      case PHASES.MURDER_CHOICE:
        this.revealMurder();
        return {};
      case PHASES.MURDER_REVEAL:
        this.afterMurderReveal();
        return {};
      case PHASES.GAME_OVER:
        return { error: 'Game is over.' };
      default:
        return { error: 'Cannot advance from lobby; start the game instead.' };
    }
  }

  resetToLobby() {
    this.clearTimer();
    this.phase = PHASES.LOBBY;
    this.round = 0;
    this.pot = 0;
    this.currentQuestion = null;
    this.answers = new Map();
    this.votes = new Map();
    this.murderChoices = new Map();
    this.log = [];
    this.lastBanished = null;
    this.lastMurdered = null;
    this.winner = null;
    for (const p of this.players.values()) {
      p.role = null;
      p.alive = true;
      p.score = 0;
      p.eliminatedBy = null;
    }
  }

  nextActionLabel() {
    switch (this.phase) {
      case PHASES.LOBBY:
        return 'Start Game';
      case PHASES.ROLE_REVEAL:
        return 'Begin Challenges';
      case PHASES.CHALLENGE_ASK:
        return 'Reveal Answer Now';
      case PHASES.CHALLENGE_REVEAL:
        return 'Continue';
      case PHASES.ROUND_TABLE:
        return 'Start Voting';
      case PHASES.VOTING:
        return 'Reveal Votes';
      case PHASES.BANISH_REVEAL:
        return 'Continue';
      case PHASES.MURDER_CHOICE:
        return 'Reveal Now';
      case PHASES.MURDER_REVEAL:
        return 'Continue';
      case PHASES.GAME_OVER:
        return null;
      default:
        return null;
    }
  }

  // Full state for the host screen (includes secret info).
  toHostState() {
    return {
      code: this.code,
      phase: this.phase,
      round: this.round,
      pot: this.pot,
      settings: this.settings,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        alive: p.alive,
        // Never reveal a living player's role on the shared host/projector screen.
        role: !p.alive || this.phase === PHASES.GAME_OVER ? p.role : null,
        score: p.score,
        eliminatedBy: p.eliminatedBy,
        answered: this.answers.has(p.id),
        voted: this.votes.has(p.id),
      })),
      questionCount: this.questions.length,
      currentQuestion: this.currentQuestion,
      answeredCount: this.answers.size,
      voteTally: this.phase === PHASES.BANISH_REVEAL ? this.voteTally : undefined,
      votedCount: this.votes.size,
      murderVotedCount: this.murderChoices.size,
      lastBanished: this.lastBanished,
      lastMurdered: this.lastMurdered,
      winner: this.winner,
      log: this.log.slice(-30),
      deadline: this.deadline,
      nextActionLabel: this.nextActionLabel(),
    };
  }

  // Per-player state (hides secret info except for a traitor's fellow traitors).
  toPlayerState(playerId) {
    const me = this.players.get(playerId);
    if (!me) return null;
    const alive = this.alivePlayers();
    const fellowTraitors =
      me.role === 'traitor'
        ? [...this.players.values()]
            .filter((p) => p.role === 'traitor' && p.id !== me.id)
            .map((p) => ({ id: p.id, name: p.name, alive: p.alive }))
        : [];

    let question = null;
    if (this.currentQuestion) {
      question = {
        text: this.currentQuestion.text,
        choices: this.currentQuestion.choices,
        revealed: this.currentQuestion.revealed,
        correctIndex: this.currentQuestion.revealed ? this.currentQuestion.correctIndex : undefined,
        myAnswer: this.answers.has(playerId) ? this.answers.get(playerId) : null,
      };
    }

    return {
      code: this.code,
      phase: this.phase,
      round: this.round,
      pot: this.pot,
      me: {
        id: me.id,
        name: me.name,
        alive: me.alive,
        role: me.role,
        score: me.score,
        eliminatedBy: me.eliminatedBy,
      },
      fellowTraitors,
      question,
      votableAlive: alive.map((p) => ({ id: p.id, name: p.name })),
      faithfulAlive:
        me.role === 'traitor'
          ? alive.filter((p) => p.role === 'faithful').map((p) => ({ id: p.id, name: p.name }))
          : [],
      myVote: this.votes.get(playerId) || null,
      myMurderChoice: this.murderChoices.get(playerId) || null,
      lastBanished: this.lastBanished,
      lastMurdered: this.lastMurdered,
      winner: this.winner,
      deadline: this.deadline,
      leaderboard: [...this.players.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map((p) => ({ name: p.name, score: p.score, alive: p.alive })),
    };
  }
}

export { PHASES };
