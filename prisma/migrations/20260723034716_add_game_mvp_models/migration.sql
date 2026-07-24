-- CreateEnum
CREATE TYPE "CurrencyType" AS ENUM ('GOLD', 'MATERIAL');

-- CreateEnum
CREATE TYPE "StatType" AS ENUM ('ATK', 'MAX_HP', 'ATK_SPEED', 'REGEN');

-- CreateEnum
CREATE TYPE "JobLineage" AS ENUM ('WARRIOR', 'MAGE', 'ARCHER');

-- CreateEnum
CREATE TYPE "WeaponBranch" AS ENUM ('TWO_HANDED', 'SWORD_SHIELD', 'NONE');

-- CreateEnum
CREATE TYPE "StageType" AS ENUM ('NORMAL', 'BOSS');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('WEAPON', 'ARMOR', 'ACCESSORY', 'MATERIAL', 'CONSUMABLE');

-- CreateEnum
CREATE TYPE "ItemRarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC');

-- CreateEnum
CREATE TYPE "EquipmentSlot" AS ENUM ('WEAPON', 'HELMET', 'ARMOR', 'GLOVES', 'SHOES', 'NECKLACE', 'RING_LEFT', 'RING_RIGHT');

-- CreateTable
CREATE TABLE "characters" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "nickname" VARCHAR(30) NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "experience" BIGINT NOT NULL DEFAULT 0,
    "unspent_stat_points" INTEGER NOT NULL DEFAULT 0,
    "current_job_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_stats" (
    "character_id" TEXT NOT NULL,
    "stat_type" "StatType" NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_stats_pkey" PRIMARY KEY ("character_id","stat_type")
);

-- CreateTable
CREATE TABLE "character_currencies" (
    "character_id" TEXT NOT NULL,
    "currency_type" "CurrencyType" NOT NULL,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_currencies_pkey" PRIMARY KEY ("character_id","currency_type")
);

-- CreateTable
CREATE TABLE "job_definitions" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "lineage" "JobLineage" NOT NULL,
    "weapon_branch" "WeaponBranch" NOT NULL DEFAULT 'NONE',
    "tier" INTEGER NOT NULL,
    "required_level" INTEGER NOT NULL DEFAULT 1,
    "parent_job_id" TEXT,
    "basic_attack_skill_code" VARCHAR(50),
    "card_pool_key" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_definitions" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "chapter" INTEGER NOT NULL,
    "stage_number" INTEGER NOT NULL,
    "stage_type" "StageType" NOT NULL DEFAULT 'NORMAL',
    "recommended_power" BIGINT NOT NULL DEFAULT 0,
    "gold_per_second" BIGINT NOT NULL DEFAULT 0,
    "material_per_second" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stage_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_stage_progress" (
    "character_id" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "is_cleared" BOOLEAN NOT NULL DEFAULT false,
    "clear_count" INTEGER NOT NULL DEFAULT 0,
    "best_clear_time_ms" INTEGER,
    "first_cleared_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_stage_progress_pkey" PRIMARY KEY ("character_id","stage_id")
);

-- CreateTable
CREATE TABLE "character_idle_progress" (
    "character_id" TEXT NOT NULL,
    "farming_stage_id" TEXT NOT NULL,
    "farming_started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_idle_progress_pkey" PRIMARY KEY ("character_id")
);

-- CreateTable
CREATE TABLE "item_definitions" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "item_type" "ItemType" NOT NULL,
    "rarity" "ItemRarity" NOT NULL,
    "base_attack" INTEGER NOT NULL DEFAULT 0,
    "max_enhancement" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_items" (
    "id" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "item_definition_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "enhancement_level" INTEGER NOT NULL DEFAULT 0,
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_equipment" (
    "character_id" TEXT NOT NULL,
    "slot_type" "EquipmentSlot" NOT NULL,
    "character_item_id" TEXT NOT NULL,
    "equipped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "character_equipment_pkey" PRIMARY KEY ("character_id","slot_type")
);

-- CreateIndex
CREATE UNIQUE INDEX "characters_nickname_key" ON "characters"("nickname");

-- CreateIndex
CREATE INDEX "characters_user_id_idx" ON "characters"("user_id");

-- CreateIndex
CREATE INDEX "characters_current_job_id_idx" ON "characters"("current_job_id");

-- CreateIndex
CREATE INDEX "characters_level_experience_idx" ON "characters"("level", "experience");

-- CreateIndex
CREATE UNIQUE INDEX "job_definitions_code_key" ON "job_definitions"("code");

-- CreateIndex
CREATE INDEX "job_definitions_lineage_weapon_branch_tier_idx" ON "job_definitions"("lineage", "weapon_branch", "tier");

-- CreateIndex
CREATE INDEX "job_definitions_parent_job_id_idx" ON "job_definitions"("parent_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "stage_definitions_code_key" ON "stage_definitions"("code");

-- CreateIndex
CREATE INDEX "stage_definitions_chapter_idx" ON "stage_definitions"("chapter");

-- CreateIndex
CREATE UNIQUE INDEX "stage_definitions_chapter_stage_number_key" ON "stage_definitions"("chapter", "stage_number");

-- CreateIndex
CREATE INDEX "character_stage_progress_stage_id_idx" ON "character_stage_progress"("stage_id");

-- CreateIndex
CREATE INDEX "character_stage_progress_character_id_is_cleared_idx" ON "character_stage_progress"("character_id", "is_cleared");

-- CreateIndex
CREATE INDEX "character_idle_progress_farming_stage_id_idx" ON "character_idle_progress"("farming_stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_definitions_code_key" ON "item_definitions"("code");

-- CreateIndex
CREATE INDEX "item_definitions_item_type_idx" ON "item_definitions"("item_type");

-- CreateIndex
CREATE INDEX "item_definitions_rarity_idx" ON "item_definitions"("rarity");

-- CreateIndex
CREATE INDEX "character_items_character_id_idx" ON "character_items"("character_id");

-- CreateIndex
CREATE INDEX "character_items_item_definition_id_idx" ON "character_items"("item_definition_id");

-- CreateIndex
CREATE UNIQUE INDEX "character_equipment_character_item_id_key" ON "character_equipment"("character_item_id");

-- CreateIndex
CREATE INDEX "character_equipment_character_item_id_idx" ON "character_equipment"("character_item_id");

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_current_job_id_fkey" FOREIGN KEY ("current_job_id") REFERENCES "job_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_stats" ADD CONSTRAINT "character_stats_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_currencies" ADD CONSTRAINT "character_currencies_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_definitions" ADD CONSTRAINT "job_definitions_parent_job_id_fkey" FOREIGN KEY ("parent_job_id") REFERENCES "job_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_stage_progress" ADD CONSTRAINT "character_stage_progress_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_stage_progress" ADD CONSTRAINT "character_stage_progress_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stage_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_idle_progress" ADD CONSTRAINT "character_idle_progress_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_idle_progress" ADD CONSTRAINT "character_idle_progress_farming_stage_id_fkey" FOREIGN KEY ("farming_stage_id") REFERENCES "stage_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_items" ADD CONSTRAINT "character_items_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_items" ADD CONSTRAINT "character_items_item_definition_id_fkey" FOREIGN KEY ("item_definition_id") REFERENCES "item_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_equipment" ADD CONSTRAINT "character_equipment_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_equipment" ADD CONSTRAINT "character_equipment_character_item_id_fkey" FOREIGN KEY ("character_item_id") REFERENCES "character_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
