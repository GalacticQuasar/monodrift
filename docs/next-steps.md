# Next steps

Notes left at the end of the multiplayer session (2026-11-21), so a later session can
pick up without the conversation. `todo.md` is the user's own list; this file is
background for it.

## Ghost races (planned, not started)

Race a recorded run on the same road: your best Daily run, a friend's, or a top
leaderboard run. Most of the pieces exist already:

- **Recording:** every run is recorded as pose samples by `src/lib/run-recorder.ts`
  (15 Hz, `NET.sampleEvery`), packed small by `packPoses` in `src/lib/poses.ts`
  (delta-coded whole numbers, JSON-friendly).
- **Drawing:** a ghost is a `Rival` (`src/net/rivals.ts`): the renderer already draws
  rivals, their name labels and off-screen arrows. A ghost differs from a live rival only
  in its clock: play it back by the player's own sim step (`samplePose(log, steps)`),
  not by arrival time, so it lines up exactly with the run.
- **Server (to build):** `POST /api/ghosts` with the packed run, the run ticket and the
  score. Check it like a score (the ticket's timing caps the score, see
  `maxScoreAfter`), plus a plausibility check on the samples: no jump between samples
  faster than `CAR.maxSpeed` allows. Store one per player per daily board in a new
  `ghosts` table (new `migrations/NNNN_ghosts.sql`, applied to production before the
  code that uses it). `GET /api/ghosts?board=today&player=…` to fetch one.
- **UI (to build):** a "Race a ghost" choice (e.g. on the leaderboard rows, or a
  start-screen option on the Daily road), and the ghost drawn faded.
- **Only Normal speed, Daily road** at first: other speeds aren't ranked, and the
  Uncapped road differs from the normal one after ~score 180.

The todo item "Sharing run result / people who click on a shared run can race that
run's ghost" builds on this.

## Not yet checked on the live site

- **Invite on a phone:** the room card's Invite button should open the phone's share
  sheet (`navigator.share`); test browsers fall back to Copy link, so it's never been seen.
- **An idle room keeps its state:** a room in the lobby or results for a minute or more
  (the Durable Object hibernates) should keep its players, round number and rules.
- **Dead connections are dropped:** a player whose connection dies without closing
  (phone loses signal) should disappear after `ROOM.staleMs` (75 s) when someone joins
  or readies up. Covered by reasoning and the code path, not by a test.
- **"Tap to switch" hint:** while spectating, the hint should disappear once only one
  rival is still driving (`racingShown` in `main.ts`). Never caught in testing because
  the last two test cars crashed at the same moment.

## Known small bugs

- **Off-screen arrows behind the top buttons:** a rival far ahead gets its arrow at the
  top edge (`NET.arrowInset`, 22 px), where the Leaderboard and Settings buttons sit, so
  the arrow and its gap text can hide behind them. Fix: a larger top inset for arrows
  (clear of the buttons, ~70 px), or keep top-edge arrows between the buttons.
