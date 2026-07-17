import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface LeaderboardEntry {
  userId: string;
  nickname: string;
  job: string;
  metaLevel: number;
  totalKills: number;
  totalSurvivalTime: number;
}

export const DEFAULT_LEADERBOARD_LIMIT = 10;
export const MAX_LEADERBOARD_LIMIT = 100;

const leaderboardEntriesCte = Prisma.sql`
  leaderboard_entries AS (
    SELECT agg."userId", u.nickname, latest.job,
           agg."metaLevel", agg."totalKills", agg."totalSurvivalTime"
    FROM (
      SELECT "userId",
             MAX(COALESCE("metaLevel", 0)) AS "metaLevel",
             SUM(kills)::int AS "totalKills",
             SUM("survivalTime")::int AS "totalSurvivalTime"
      FROM "Run"
      WHERE "leaderboardEligible" = true
      GROUP BY "userId"
    ) agg
    JOIN "User" u ON u.id = agg."userId"
    JOIN LATERAL (
      SELECT job FROM "Run" r
      WHERE r."userId" = agg."userId" AND r."leaderboardEligible" = true
      ORDER BY r."createdAt" DESC LIMIT 1
    ) latest ON true
  )
`;

// 유저당 1행, 전체 Run을 집계해 계산(사용자 결정, docs/leaderboard-sort/spec.md).
// 정렬: 메인 레벨(계정 메타 레벨 최댓값) DESC → 총 킬수(합계) DESC → 총 플레이타임(합계) DESC.
// 표시용 job은 그 유저의 가장 최근 판 기준(LATERAL JOIN). Prisma는 GROUP BY 후 그룹별
// 최신 행을 가져오는 조인을 표현하지 못해 DISTINCT ON과 마찬가지로 $queryRaw를 쓴다.
// SUM(kills)/SUM(survivalTime)은 PostgreSQL에서 bigint를 반환하므로 ::int로 캐스팅해
// NestJS의 BigInt 직렬화 오류(JSON.stringify가 BigInt를 지원하지 않음)를 피한다.
@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getTop(
    limit: number = DEFAULT_LEADERBOARD_LIMIT,
  ): Promise<LeaderboardEntry[]> {
    const safeLimit = Math.min(Math.max(1, limit), MAX_LEADERBOARD_LIMIT);
    return this.prisma.$queryRaw<LeaderboardEntry[]>(Prisma.sql`
      WITH ${leaderboardEntriesCte}
      SELECT * FROM leaderboard_entries
      ORDER BY "metaLevel" DESC, "totalKills" DESC, "totalSurvivalTime" DESC
      LIMIT ${safeLimit}
    `);
  }

  async getMyRank(
    userId: string,
  ): Promise<{ rank: number; entry: LeaderboardEntry } | null> {
    const rows = await this.prisma.$queryRaw<
      Array<LeaderboardEntry & { rank: bigint }>
    >(Prisma.sql`
      WITH ${leaderboardEntriesCte},
      ranked AS (
        SELECT *, RANK() OVER (
          ORDER BY "metaLevel" DESC, "totalKills" DESC, "totalSurvivalTime" DESC
        ) AS rank
        FROM leaderboard_entries
      )
      SELECT ranked."userId", ranked.nickname, ranked.job,
             ranked."metaLevel", ranked."totalKills", ranked."totalSurvivalTime", ranked.rank
      FROM ranked
      WHERE ranked."userId" = ${userId}
    `);
    if (rows.length === 0) return null;
    const { rank, ...entry } = rows[0];
    return { rank: Number(rank), entry };
  }
}
