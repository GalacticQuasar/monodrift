-- Leaderboard: players (name + hashed device secret), each player's best per board,
-- and a log of submitted runs (one per run ticket, which also stops ticket reuse).

CREATE TABLE players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_submit_at INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX players_name ON players (name COLLATE NOCASE);

-- board: 'all', or a UTC day 'YYYY-MM-DD' for that day's road
CREATE TABLE scores (
  board TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players (id),
  score INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (board, player_id)
);
CREATE INDEX scores_rank ON scores (board, score DESC, at);

CREATE TABLE runs (
  ticket_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players (id),
  seed INTEGER NOT NULL,
  day TEXT,
  score INTEGER NOT NULL,
  seconds REAL NOT NULL,
  at INTEGER NOT NULL
);
