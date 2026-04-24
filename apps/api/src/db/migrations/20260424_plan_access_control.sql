ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS plan_selected BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS plans (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  billing_period TEXT NOT NULL,
  scan_limit INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO plans (code, name, kind, billing_period, scan_limit)
VALUES
  ('free', 'Free', 'free', 'none', 2),
  ('individual_monthly', 'Individual Monthly', 'individual', 'monthly', 50),
  ('individual_yearly', 'Individual Yearly', 'individual', 'yearly', 600),
  ('team', 'Team', 'team', 'monthly', NULL)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  kind = EXCLUDED.kind,
  billing_period = EXCLUDED.billing_period,
  scan_limit = EXCLUDED.scan_limit;

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'team_member',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL REFERENCES plans(code) ON DELETE RESTRICT,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscriptions_user_created_idx
  ON subscriptions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS subscriptions_team_created_idx
  ON subscriptions (team_id, created_at DESC);
