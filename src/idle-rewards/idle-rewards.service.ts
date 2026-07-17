import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IDLE_REWARDS, META_LEVEL_CAP, META_XP_BASE, META_XP_POW } from '../config/game-balance';
const xpFor = (level: number) => Math.floor(META_XP_BASE*Math.pow(level,META_XP_POW));
@Injectable()
export class IdleRewardsService {
  constructor(private readonly prisma: PrismaService) {}
  async claim(userId: string) {
    const now=new Date();
    return this.prisma.$transaction(async tx=>{
      const row=await tx.gameSave.findUnique({where:{userId}}); if(!row) throw new NotFoundException('save not found');
      const elapsedSec=Math.min(IDLE_REWARDS.maxOfflineSeconds,Math.max(0,Math.floor((now.getTime()-row.lastActiveAt.getTime())/1000)));
      const hours=elapsedSec/3600;
      const goldGained=Math.floor(hours*(IDLE_REWARDS.goldBase+IDLE_REWARDS.goldPerLevel*row.metaLevel));
      const xpGained=Math.floor(hours*(IDLE_REWARDS.xpBase+IDLE_REWARDS.xpPerLevel*row.metaLevel));
      let metaLevel=row.metaLevel,metaXp=row.metaXp+xpGained,levelsGained=0;
      while(metaLevel<META_LEVEL_CAP&&metaXp>=xpFor(metaLevel)){metaXp-=xpFor(metaLevel);metaLevel++;levelsGained++;}
      if(metaLevel>=META_LEVEL_CAP){metaLevel=META_LEVEL_CAP;metaXp=0;}
      const updated=await tx.gameSave.update({where:{userId},data:{gold:{increment:goldGained},metaLevel,metaXp,lastActiveAt:now,version:{increment:1}}});
      for(let level=row.metaLevel+1;level<=metaLevel;level++) await tx.metaLevelReached.upsert({where:{userId_level:{userId,level}},create:{userId,level,reachedAt:now},update:{}});
      return {elapsedSec,goldGained,xpGained,levelsGained,version:updated.version,save:{...(updated.data as object),metaLevel:updated.metaLevel,metaXp:updated.metaXp,gold:updated.gold}};
    });
  }
}
