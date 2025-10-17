-- Belote Contrée Database Schema

CREATE TABLE IF NOT EXISTS games (
    id SERIAL PRIMARY KEY,
    room_code VARCHAR(6) NOT NULL,
    creator_ip VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    winning_team VARCHAR(10), -- 'NS' or 'EW'
    final_score_ns INTEGER,
    final_score_ew INTEGER,
    total_hands INTEGER DEFAULT 0,

    -- Player names (can be bot or human)
    player_north VARCHAR(50),
    player_east VARCHAR(50),
    player_south VARCHAR(50),
    player_west VARCHAR(50),

    -- Bot flags
    is_bot_north BOOLEAN DEFAULT FALSE,
    is_bot_east BOOLEAN DEFAULT FALSE,
    is_bot_south BOOLEAN DEFAULT FALSE,
    is_bot_west BOOLEAN DEFAULT FALSE
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_room_code ON games(room_code);
CREATE INDEX IF NOT EXISTS idx_created_at ON games(created_at);
CREATE INDEX IF NOT EXISTS idx_creator_ip ON games(creator_ip);

-- Optional: hand history table for detailed analytics
CREATE TABLE IF NOT EXISTS hands (
    id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
    hand_number INTEGER NOT NULL,
    contract_team VARCHAR(10), -- 'NS' or 'EW'
    contract_amount INTEGER, -- 80-160
    contract_suit VARCHAR(10), -- 'hearts', 'diamonds', etc.
    declarer VARCHAR(10), -- 'N', 'E', 'S', 'W'
    team_ns_score INTEGER,
    team_ew_score INTEGER,
    contract_made BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_game_id ON hands(game_id);
