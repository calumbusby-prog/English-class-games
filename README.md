# Traitors: Vocab Edition

A live, in-person classroom game styled on *The Traitors*, built to drill
vocabulary or grammar. Students join with a room code on their own phones;
you (the teacher) drive the game from a "host screen" — a laptop or desktop
connected to a projector/TV.

Nothing to install for students. No accounts. No database — a session just
lives in memory while the server is running, and you type in fresh
questions each time you play.

## How it plays

1. **Lobby** — you open the host screen, get a 4-letter room code, and
   students join on their phones at the same site.
2. **Roles** — a few students are secretly made **Traitors**, everyone else
   is **Faithful**. Roles only ever appear on each student's own phone —
   never on the shared host screen.
3. **Challenges** — everyone answers your vocabulary/grammar questions
   (multiple choice) on their phones. Correct answers add to a shared prize
   **pot** and to each player's personal score. Traitors answer too, to
   blend in.
4. **Round Table** — a timed, in-person discussion (like the real show) —
   the class talks out loud about who they suspect.
5. **Voting** — everyone votes on their phone to banish a suspect. The
   banished player's role is revealed.
6. **Night phase** — if traitors remain, they privately choose a Faithful
   player to "murder" on their own phones.
7. Repeat from step 3 until either all Traitors are banished (**Faithful
   win**) or the Traitors equal/outnumber the remaining Faithful
   (**Traitors win**).

Eliminated players keep watching the host screen for the rest of the game.

## Running it

```bash
npm install
npm start
```

This starts a server on **http://localhost:3000**.

- On the host laptop/desktop, open `http://localhost:3000/host.html` and
  put that browser tab on the projector.
- Make sure student devices are on the **same Wi-Fi** as the host machine.
  Find the host machine's local IP address (e.g. `192.168.1.42`) and have
  students go to `http://192.168.1.42:3000/join.html` (or just
  `http://192.168.1.42:3000` and tap "Join a Game").
  - macOS: `ipconfig getifaddr en0`
  - Windows: `ipconfig` (look for "IPv4 Address")
  - Linux: `hostname -I`
- If you'd rather not depend on classroom Wi-Fi, deploy the app once to a
  free Node host (Render, Railway, Fly.io, etc.) and reuse that same URL
  every lesson — `npm start` is the only start command it needs.

## Adding your own questions each lesson

On the host screen's setup page, paste your questions into the text box,
one per line, in this format:

```
Question text | correct answer | wrong answer 1 | wrong answer 2 | wrong answer 3
```

You can have 2–5 answer options per question (1 correct + at least 1
wrong). Click **Save Questions**. Click **Load Sample Questions** for a
working example you can edit.

Other settings you can tune per session (also on the setup page):

- Number of traitors (defaults to roughly 1 per 5 players)
- Points awarded per correct answer
- Questions asked per round before the Round Table
- Timers for answering, discussion, and voting

## Notes for the classroom

- Need at least 4 players to start.
- If your browser tab reloads, the host screen automatically reconnects to
  the same game (it remembers the room via `localStorage`).
- A student's phone also reconnects automatically if it loses Wi-Fi
  briefly or the page refreshes.
- After a game ends, hit **Play Again** on the host screen to replay with
  the same group (new roles are dealt) without everyone re-joining.
