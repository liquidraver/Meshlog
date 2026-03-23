--
-- Table structure for table `advertisements`
--

CREATE TABLE `advertisements` (
  `id` int(11) NOT NULL,
  `contact_id` int(11) NOT NULL COMMENT 'who sent advertisement',
  `reporter_id` int(11) NOT NULL COMMENT 'who received and reported',
  `hash` varchar(16) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `lat` decimal(9,6) NOT NULL,
  `lon` decimal(9,6) NOT NULL,
  `country_code` varchar(2) DEFAULT NULL COMMENT 'ISO 3166-1 alpha-2 country code (HU, SK, PL, etc.)',
  `path` varchar(512) NOT NULL,
  `type` tinyint(4) NOT NULL,
  `flags` smallint(4) NOT NULL,
  `snr` smallint(6) NOT NULL COMMENT 'last hop snr',
  `sent_at` timestamp NOT NULL COMMENT 'sender timestamp',
  `received_at` timestamp NOT NULL COMMENT 'reporter timestamp',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `contacts`
--

CREATE TABLE `contacts` (
  `id` int(11) NOT NULL,
  `public_key` varchar(64) NOT NULL,
  `name` varchar(128) DEFAULT NULL,
  `enabled` tinyint(4) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `direct_messages`
--

CREATE TABLE `direct_messages` (
  `id` int(11) NOT NULL,
  `contact_id` int(11) NOT NULL COMMENT 'who sent message',
  `reporter_id` int(11) NOT NULL COMMENT 'who received and reported',
  `hash` varchar(16) NOT NULL,
  `name` varchar(123) NOT NULL,
  `message` varchar(320) NOT NULL,
  `path` varchar(512) NOT NULL,
  `sent_at` timestamp NOT NULL COMMENT 'sender timestamp',
  `received_at` timestamp NOT NULL COMMENT 'reporter timestamp',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `channels`
--

CREATE TABLE `channels` (
  `id` int(11) NOT NULL,
  `hash` varchar(16) NOT NULL,
  `name` varchar(32) NOT NULL,
  `enabled` tinyint(4) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `channel_messages`
--

CREATE TABLE `channel_messages` (
  `id` int(11) NOT NULL,
  `contact_id` int(11) DEFAULT NULL COMMENT 'who sent message (presumed)',
  `reporter_id` int(11) NOT NULL COMMENT 'who received and reported',
  `hash` varchar(16) NOT NULL,
  `channel_id` int(11) NOT NULL COMMENT 'channel id',
  `name` varchar(128) NOT NULL,
  `message` varchar(320) NOT NULL,
  `path` varchar(512) NOT NULL,
  `sent_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `received_at` timestamp NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `logs`
--

CREATE TABLE `logs` (
  `id` int(11) NOT NULL,
  `type` varchar(3) NOT NULL,
  `reporter` varchar(200) NOT NULL,
  `data` mediumtext NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `raw`
--

CREATE TABLE `raw` (
  `id` int(11) NOT NULL,
  `reporter` varchar(200) NOT NULL,
  `version` smallint(6) NOT NULL,
  `recvtime` int(11) NOT NULL,
  `json` mediumtext NOT NULL,
  `hdr_raw` varchar(200) NOT NULL,
  `hdr_route_type` smallint(6) NOT NULL,
  `hdr_payload_type` smallint(6) NOT NULL,
  `hdr_payload_version` smallint(6) NOT NULL,
  `pkt_path` varchar(200) NOT NULL,
  `pkt_payload` varchar(300) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reporters`
--

CREATE TABLE `reporters` (
  `id` int(11) NOT NULL,
  `name` varchar(200) NOT NULL,
  `public_key` varchar(200) NOT NULL,
  `lat` decimal(9,6) NOT NULL,
  `lon` decimal(9,6) NOT NULL,
  `auth` varchar(200) NOT NULL,
  `authorized` tinyint(4) NOT NULL,
  `color` varchar(16) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `advertisements`
--
ALTER TABLE `advertisements`
  ADD PRIMARY KEY (`id`),
  ADD KEY `contact_id` (`contact_id`),
  ADD KEY `reporter_id` (`reporter_id`),
  ADD KEY `idx_country_code` (`country_code`),
  ADD INDEX `idx_created_at` (`created_at`),
  ADD INDEX `idx_sent_at` (`sent_at`),
  ADD INDEX `idx_received_at` (`received_at`),
  ADD INDEX `idx_contact_created` (`contact_id`, `created_at`),
  ADD INDEX `idx_reporter_created` (`reporter_id`, `created_at`),
  ADD INDEX `idx_type_created` (`type`, `created_at`),
  ADD INDEX `idx_contact_sent_latest` (`contact_id`, `sent_at`, `id`);

--
-- Indexes for table `contacts`
--
ALTER TABLE `contacts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `contact_pub_key` (`public_key`),
  ADD INDEX `idx_created_at` (`created_at`),
  ADD INDEX `idx_enabled_created` (`enabled`, `created_at`);

--
-- Indexes for table `direct_messages`
--
ALTER TABLE `direct_messages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `contact_id` (`contact_id`),
  ADD KEY `reporter_id` (`reporter_id`),
  ADD INDEX `idx_created_at` (`created_at`),
  ADD INDEX `idx_sent_at` (`sent_at`),
  ADD INDEX `idx_received_at` (`received_at`),
  ADD INDEX `idx_contact_created` (`contact_id`, `created_at`),
  ADD INDEX `idx_reporter_created` (`reporter_id`, `created_at`);

--
-- Indexes for table `channels`
--
ALTER TABLE `channels`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `channel_hash` (`hash`),
  ADD INDEX `idx_enabled` (`enabled`),
  ADD INDEX `idx_created_at` (`created_at`);

--
-- Indexes for table `channel_messages`
--
ALTER TABLE `channel_messages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `contact_id` (`contact_id`),
  ADD KEY `reporter_id` (`reporter_id`),
  ADD KEY `channel_id` (`channel_id`),
  ADD INDEX `idx_created_at` (`created_at`),
  ADD INDEX `idx_sent_at` (`sent_at`),
  ADD INDEX `idx_received_at` (`received_at`),
  ADD INDEX `idx_channel_created` (`channel_id`, `created_at`),
  ADD INDEX `idx_contact_created` (`contact_id`, `created_at`),
  ADD INDEX `idx_reporter_created` (`reporter_id`, `created_at`);

--
-- Indexes for table `logs`
--
ALTER TABLE `logs`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `raw`
--
ALTER TABLE `raw`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `reporters`
--
ALTER TABLE `reporters`
  ADD PRIMARY KEY (`id`),
  ADD INDEX `idx_authorized` (`authorized`),
  ADD INDEX `idx_created_at` (`created_at`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `advertisements`
--
ALTER TABLE `advertisements`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `contacts`
--
ALTER TABLE `contacts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `direct_messages`
--
ALTER TABLE `direct_messages`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `channels`
--
ALTER TABLE `channels`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `channel_messages`
--
ALTER TABLE `channel_messages`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `logs`
--
ALTER TABLE `logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `raw`
--
ALTER TABLE `raw`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reporters`
--
ALTER TABLE `reporters`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `advertisements`
--
ALTER TABLE `advertisements`
  ADD CONSTRAINT `advertisements_ibfk_1` FOREIGN KEY (`contact_id`) REFERENCES `contacts` (`id`),
  ADD CONSTRAINT `advertisements_ibfk_2` FOREIGN KEY (`reporter_id`) REFERENCES `reporters` (`id`);

--
-- Constraints for table `direct_messages`
--
ALTER TABLE `direct_messages`
  ADD CONSTRAINT `direct_messages_ibfk_1` FOREIGN KEY (`contact_id`) REFERENCES `contacts` (`id`),
  ADD CONSTRAINT `direct_messages_ibfk_2` FOREIGN KEY (`reporter_id`) REFERENCES `reporters` (`id`);

--
-- Constraints for table `channel_messages`
--
ALTER TABLE `channel_messages`
  ADD CONSTRAINT `channel_messages_ibfk_1` FOREIGN KEY (`contact_id`) REFERENCES `contacts` (`id`),
  ADD CONSTRAINT `channel_messages_ibfk_2` FOREIGN KEY (`reporter_id`) REFERENCES `reporters` (`id`),
  ADD CONSTRAINT `channel_messages_ibfk_3` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`);

--
-- Analyze tables to update statistics for query optimizer
--
ANALYZE TABLE `advertisements`;
ANALYZE TABLE `channel_messages`;
ANALYZE TABLE `direct_messages`;
ANALYZE TABLE `contacts`;
ANALYZE TABLE `channels`;
ANALYZE TABLE `reporters`;

COMMIT;
