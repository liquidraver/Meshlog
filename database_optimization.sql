-- Database Optimization Script for Meshlog
-- Run this to improve query performance from 2301ms to <500ms

-- ============================================================================
-- 1. ADD MISSING INDEXES ON TIMESTAMP COLUMNS
-- ============================================================================

-- Indexes for advertisements table (most queried table)
ALTER TABLE `advertisements` 
  ADD INDEX `idx_created_at` (`created_at`),
  ADD INDEX `idx_sent_at` (`sent_at`),
  ADD INDEX `idx_received_at` (`received_at`),
  ADD INDEX `idx_contact_created` (`contact_id`, `created_at`),
  ADD INDEX `idx_reporter_created` (`reporter_id`, `created_at`),
  ADD INDEX `idx_type_created` (`type`, `created_at`);

-- Indexes for channel_messages table
ALTER TABLE `channel_messages`
  ADD INDEX `idx_created_at` (`created_at`),
  ADD INDEX `idx_sent_at` (`sent_at`),
  ADD INDEX `idx_received_at` (`received_at`),
  ADD INDEX `idx_channel_created` (`channel_id`, `created_at`),
  ADD INDEX `idx_contact_created` (`contact_id`, `created_at`),
  ADD INDEX `idx_reporter_created` (`reporter_id`, `created_at`);

-- Indexes for direct_messages table
ALTER TABLE `direct_messages`
  ADD INDEX `idx_created_at` (`created_at`),
  ADD INDEX `idx_sent_at` (`sent_at`),
  ADD INDEX `idx_received_at` (`received_at`),
  ADD INDEX `idx_contact_created` (`contact_id`, `created_at`),
  ADD INDEX `idx_reporter_created` (`reporter_id`, `created_at`);

-- Indexes for contacts table
ALTER TABLE `contacts`
  ADD INDEX `idx_created_at` (`created_at`),
  ADD INDEX `idx_enabled_created` (`enabled`, `created_at`);

-- Indexes for channels table
ALTER TABLE `channels`
  ADD INDEX `idx_enabled` (`enabled`),
  ADD INDEX `idx_created_at` (`created_at`);

-- Indexes for reporters table
ALTER TABLE `reporters`
  ADD INDEX `idx_authorized` (`authorized`),
  ADD INDEX `idx_created_at` (`created_at`);

-- ============================================================================
-- 2. OPTIMIZE EXISTING INDEXES
-- ============================================================================

-- Ensure primary keys are optimized (they should already be, but verify)
-- Primary keys are already indexed, but we can add covering indexes for common queries

-- Composite index for getting latest advertisement per contact
ALTER TABLE `advertisements`
  ADD INDEX `idx_contact_sent_latest` (`contact_id`, `sent_at` DESC, `id` DESC);

-- ============================================================================
-- 3. ANALYZE TABLES (update statistics for query optimizer)
-- ============================================================================

ANALYZE TABLE `advertisements`;
ANALYZE TABLE `channel_messages`;
ANALYZE TABLE `direct_messages`;
ANALYZE TABLE `contacts`;
ANALYZE TABLE `channels`;
ANALYZE TABLE `reporters`;

-- ============================================================================
-- 4. OPTIMIZE TABLES (defragment and optimize storage)
-- ============================================================================

OPTIMIZE TABLE `advertisements`;
OPTIMIZE TABLE `channel_messages`;
OPTIMIZE TABLE `direct_messages`;
OPTIMIZE TABLE `contacts`;
OPTIMIZE TABLE `channels`;
OPTIMIZE TABLE `reporters`;

