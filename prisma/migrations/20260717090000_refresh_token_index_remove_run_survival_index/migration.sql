-- Refresh-token lookup is on every refresh/logout request.
CREATE INDEX "RefreshToken_tokenHash_idx" ON "RefreshToken"("tokenHash");

-- The leaderboard now aggregates all eligible runs per user, so this ordering
-- index no longer serves its query shape.
DROP INDEX "Run_survivalTime_idx";
