<?php
require_once "../../../lib/meshlog.class.php";
require_once "../../../config.php";
include "../utils.php";
include "../rate_limit.php";
include "../cache.php";

// Rate limiting: 10 requests per 60 seconds per IP
checkRateLimit(10, 60);

// Cache key based on current hour (cache for 5 minutes)
$cacheKey = 'weekly_stats_' . date('Y-m-d-H');
$cachedData = getCached($cacheKey, 300);

if ($cachedData !== false) {
    header('Content-Type: application/json; charset=utf-8');
    header('X-Cache: HIT');
    echo json_encode($cachedData['data'], JSON_PRETTY_PRINT);
    exit;
}

$pdo = openPdo();
// Set query timeout to 15 seconds for expensive queries
$pdo->setAttribute(PDO::ATTR_TIMEOUT, 15);
$meshlog = new MeshLog($pdo);

// Calculate date ranges for current week and previous week
$sevenDaysAgo = date('Y-m-d H:i:s', strtotime('-7 days'));
$fourteenDaysAgo = date('Y-m-d H:i:s', strtotime('-14 days'));
$now = date('Y-m-d H:i:s');

$stats = array();
$days = 7;

// Helper function to calculate stats for a date range
function getChannelMessagesStats($meshlog, $fromDate, $toDate) {
    $query = $meshlog->pdo->prepare("
        SELECT 
            c.id as channel_id,
            c.name as channel_name,
            COUNT(DISTINCT cm.hash) as message_count
        FROM channels c
        LEFT JOIN channel_messages cm ON c.id = cm.channel_id 
            AND cm.sent_at >= :from_date
            AND cm.sent_at < :to_date
        GROUP BY c.id, c.name
        ORDER BY message_count DESC, c.name ASC
    ");
    $query->bindParam(':from_date', $fromDate, PDO::PARAM_STR);
    $query->bindParam(':to_date', $toDate, PDO::PARAM_STR);
    $query->execute();
    return $query->fetchAll(PDO::FETCH_ASSOC);
}

function getAdvertisementsStats($meshlog, $fromDate, $toDate) {
    $query = $meshlog->pdo->prepare("
        SELECT 
            CASE 
                WHEN type = 1 THEN 'Client'
                WHEN type = 2 THEN 'Repeater'
                WHEN type = 3 THEN 'Room server'
                ELSE 'Other'
            END as type_name,
            type as type_id,
            COUNT(DISTINCT hash) as count
        FROM advertisements
        WHERE sent_at >= :from_date
            AND sent_at < :to_date
        GROUP BY type
        ORDER BY type
    ");
    $query->bindParam(':from_date', $fromDate, PDO::PARAM_STR);
    $query->bindParam(':to_date', $toDate, PDO::PARAM_STR);
    $query->execute();
    return $query->fetchAll(PDO::FETCH_ASSOC);
}

function getDirectMessagesTotal($meshlog, $fromDate, $toDate) {
    $query = $meshlog->pdo->prepare("
        SELECT COUNT(DISTINCT hash) as total
        FROM direct_messages
        WHERE sent_at >= :from_date
            AND sent_at < :to_date
    ");
    $query->bindParam(':from_date', $fromDate, PDO::PARAM_STR);
    $query->bindParam(':to_date', $toDate, PDO::PARAM_STR);
    $query->execute();
    $result = $query->fetch(PDO::FETCH_ASSOC);
    return intval($result['total']);
}

function getProcessedPacketsStats($meshlog, $fromDate, $toDate) {
    $query = $meshlog->pdo->prepare("
        SELECT 
            r.id as reporter_id,
            r.name as reporter_name,
            COALESCE(adv_count.count, 0) + 
            COALESCE(cm_count.count, 0) + 
            COALESCE(dm_count.count, 0) as packet_count
        FROM reporters r
        LEFT JOIN (
            SELECT reporter_id, COUNT(*) as count
            FROM advertisements
            WHERE sent_at >= :from_date_1
                AND sent_at < :to_date_1
            GROUP BY reporter_id
        ) adv_count ON r.id = adv_count.reporter_id
        LEFT JOIN (
            SELECT reporter_id, COUNT(*) as count
            FROM channel_messages
            WHERE sent_at >= :from_date_2
                AND sent_at < :to_date_2
            GROUP BY reporter_id
        ) cm_count ON r.id = cm_count.reporter_id
        LEFT JOIN (
            SELECT reporter_id, COUNT(*) as count
            FROM direct_messages
            WHERE sent_at >= :from_date_3
                AND sent_at < :to_date_3
            GROUP BY reporter_id
        ) dm_count ON r.id = dm_count.reporter_id
        WHERE r.authorized = 1
        GROUP BY r.id, r.name, adv_count.count, cm_count.count, dm_count.count
        HAVING packet_count > 0
        ORDER BY packet_count DESC, r.name ASC
    ");
    $query->bindParam(':from_date_1', $fromDate, PDO::PARAM_STR);
    $query->bindParam(':to_date_1', $toDate, PDO::PARAM_STR);
    $query->bindParam(':from_date_2', $fromDate, PDO::PARAM_STR);
    $query->bindParam(':to_date_2', $toDate, PDO::PARAM_STR);
    $query->bindParam(':from_date_3', $fromDate, PDO::PARAM_STR);
    $query->bindParam(':to_date_3', $toDate, PDO::PARAM_STR);
    $query->execute();
    return $query->fetchAll(PDO::FETCH_ASSOC);
}

// Get current week stats
$currentChannelStats = getChannelMessagesStats($meshlog, $sevenDaysAgo, $now);
$currentAdvStats = getAdvertisementsStats($meshlog, $sevenDaysAgo, $now);
$currentDmTotal = getDirectMessagesTotal($meshlog, $sevenDaysAgo, $now);
$currentReporterStats = getProcessedPacketsStats($meshlog, $sevenDaysAgo, $now);

// Get previous week stats
$previousChannelStats = getChannelMessagesStats($meshlog, $fourteenDaysAgo, $sevenDaysAgo);
$previousAdvStats = getAdvertisementsStats($meshlog, $fourteenDaysAgo, $sevenDaysAgo);
$previousDmTotal = getDirectMessagesTotal($meshlog, $fourteenDaysAgo, $sevenDaysAgo);
$previousReporterStats = getProcessedPacketsStats($meshlog, $fourteenDaysAgo, $sevenDaysAgo);

// Build channel messages stats with comparisons
$channelMap = array();
foreach ($currentChannelStats as $channel) {
    $channelMap[$channel['channel_id']] = array(
        'current' => intval($channel['message_count']),
        'previous' => 0
    );
}
foreach ($previousChannelStats as $channel) {
    if (!isset($channelMap[$channel['channel_id']])) {
        $channelMap[$channel['channel_id']] = array('current' => 0, 'previous' => 0);
    }
    $channelMap[$channel['channel_id']]['previous'] = intval($channel['message_count']);
}

$stats['channel_messages'] = array(
    'by_channel' => array(),
    'total' => 0,
    'total_previous' => 0
);

foreach ($currentChannelStats as $channel) {
    $current = intval($channel['message_count']);
    $previous = isset($channelMap[$channel['channel_id']]) ? $channelMap[$channel['channel_id']]['previous'] : 0;
    $avg = round($current / $days, 1);
    $diff = $current - $previous;
    $diffAvg = round($diff / $days, 1);
    
    $stats['channel_messages']['by_channel'][] = array(
        'channel_id' => intval($channel['channel_id']),
        'channel_name' => $channel['channel_name'],
        'message_count' => $current,
        'avg_per_day' => $avg,
        'previous_week' => $previous,
        'difference' => $diff,
        'diff_avg_per_day' => $diffAvg
    );
    $stats['channel_messages']['total'] += $current;
}

foreach ($previousChannelStats as $channel) {
    if (!isset($channelMap[$channel['channel_id']])) {
        $stats['channel_messages']['by_channel'][] = array(
            'channel_id' => intval($channel['channel_id']),
            'channel_name' => $channel['channel_name'],
            'message_count' => 0,
            'avg_per_day' => 0,
            'previous_week' => intval($channel['message_count']),
            'difference' => -intval($channel['message_count']),
            'diff_avg_per_day' => round(-intval($channel['message_count']) / $days, 1)
        );
    }
}

$stats['channel_messages']['total_previous'] = 0;
foreach ($previousChannelStats as $channel) {
    $stats['channel_messages']['total_previous'] += intval($channel['message_count']);
}

// Build advertisements stats with comparisons
$advTypeMap = array();
foreach ($currentAdvStats as $adv) {
    $advTypeMap[$adv['type_id']] = array(
        'current' => intval($adv['count']),
        'previous' => 0,
        'type_name' => $adv['type_name']
    );
}
foreach ($previousAdvStats as $adv) {
    if (!isset($advTypeMap[$adv['type_id']])) {
        $advTypeMap[$adv['type_id']] = array('current' => 0, 'previous' => 0, 'type_name' => $adv['type_name']);
    }
    $advTypeMap[$adv['type_id']]['previous'] = intval($adv['count']);
}

$stats['advertisements'] = array(
    'by_type' => array(),
    'total' => 0,
    'total_previous' => 0
);

foreach ($currentAdvStats as $adv) {
    $current = intval($adv['count']);
    $previous = isset($advTypeMap[$adv['type_id']]) ? $advTypeMap[$adv['type_id']]['previous'] : 0;
    $avg = round($current / $days, 1);
    $diff = $current - $previous;
    $diffAvg = round($diff / $days, 1);
    
    $stats['advertisements']['by_type'][] = array(
        'type' => $adv['type_name'],
        'count' => $current,
        'avg_per_day' => $avg,
        'previous_week' => $previous,
        'difference' => $diff,
        'diff_avg_per_day' => $diffAvg
    );
    $stats['advertisements']['total'] += $current;
}

foreach ($previousAdvStats as $adv) {
    if (!isset($advTypeMap[$adv['type_id']])) {
        $stats['advertisements']['by_type'][] = array(
            'type' => $adv['type_name'],
            'count' => 0,
            'avg_per_day' => 0,
            'previous_week' => intval($adv['count']),
            'difference' => -intval($adv['count']),
            'diff_avg_per_day' => round(-intval($adv['count']) / $days, 1)
        );
    }
}

$stats['advertisements']['total_previous'] = 0;
foreach ($previousAdvStats as $adv) {
    $stats['advertisements']['total_previous'] += intval($adv['count']);
}

// Build processed packets stats with comparisons
$reporterMap = array();
foreach ($currentReporterStats as $reporter) {
    $reporterMap[$reporter['reporter_id']] = array(
        'current' => intval($reporter['packet_count']),
        'previous' => 0,
        'name' => $reporter['reporter_name']
    );
}
foreach ($previousReporterStats as $reporter) {
    if (!isset($reporterMap[$reporter['reporter_id']])) {
        $reporterMap[$reporter['reporter_id']] = array('current' => 0, 'previous' => 0, 'name' => $reporter['reporter_name']);
    }
    $reporterMap[$reporter['reporter_id']]['previous'] = intval($reporter['packet_count']);
}

$stats['processed_packets'] = array(
    'by_reporter' => array(),
    'total' => 0,
    'total_previous' => 0
);

foreach ($currentReporterStats as $reporter) {
    $current = intval($reporter['packet_count']);
    $previous = isset($reporterMap[$reporter['reporter_id']]) ? $reporterMap[$reporter['reporter_id']]['previous'] : 0;
    $avg = round($current / $days, 1);
    $diff = $current - $previous;
    $diffAvg = round($diff / $days, 1);
    
    $stats['processed_packets']['by_reporter'][] = array(
        'reporter_id' => intval($reporter['reporter_id']),
        'reporter_name' => $reporter['reporter_name'],
        'packet_count' => $current,
        'avg_per_day' => $avg,
        'previous_week' => $previous,
        'difference' => $diff,
        'diff_avg_per_day' => $diffAvg
    );
    $stats['processed_packets']['total'] += $current;
}

foreach ($previousReporterStats as $reporter) {
    if (!isset($reporterMap[$reporter['reporter_id']])) {
        $stats['processed_packets']['by_reporter'][] = array(
            'reporter_id' => intval($reporter['reporter_id']),
            'reporter_name' => $reporter['reporter_name'],
            'packet_count' => 0,
            'avg_per_day' => 0,
            'previous_week' => intval($reporter['packet_count']),
            'difference' => -intval($reporter['packet_count']),
            'diff_avg_per_day' => round(-intval($reporter['packet_count']) / $days, 1)
        );
    }
}

$stats['processed_packets']['total_previous'] = 0;
foreach ($previousReporterStats as $reporter) {
    $stats['processed_packets']['total_previous'] += intval($reporter['packet_count']);
}

// Direct messages totals
$stats['direct_messages_total'] = $currentDmTotal;
$stats['direct_messages_total_previous'] = $previousDmTotal;
$stats['direct_messages_avg_per_day'] = round($currentDmTotal / $days, 1);
$stats['direct_messages_diff'] = $currentDmTotal - $previousDmTotal;
$stats['direct_messages_diff_avg_per_day'] = round($stats['direct_messages_diff'] / $days, 1);

// Add date range info
$stats['date_range'] = array(
    'from' => $sevenDaysAgo,
    'to' => $now,
    'previous_from' => $fourteenDaysAgo,
    'previous_to' => $sevenDaysAgo,
    'days' => $days
);

// Cache the result
setCache($cacheKey, $stats);

header('Content-Type: application/json; charset=utf-8');
header('X-Cache: MISS');
echo json_encode($stats, JSON_PRETTY_PRINT);

?>
