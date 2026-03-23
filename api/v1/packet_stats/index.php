<?php
require_once "../../../lib/meshlog.class.php";
require_once "../../../config.php";
include "../utils.php";
include "../rate_limit.php";
include "../cache.php";

// Cache for 5 minutes (skip cache with ?fresh=1)
$skipCache = isset($_GET['fresh']) && $_GET['fresh'] == '1';
$cacheKey = 'packet_stats_' . floor(time() / 300);

if (!$skipCache) {
    $cachedData = @getCached($cacheKey, 300);
    if ($cachedData !== false && isset($cachedData['data'])) {
        header('Content-Type: application/json; charset=utf-8');
        header('X-Cache: HIT');
        echo json_encode($cachedData['data'], JSON_PRETTY_PRINT);
        exit;
    }
}

@checkRateLimit(30, 60);

$pdo = openPdo();
$pdo->setAttribute(PDO::ATTR_TIMEOUT, 15);

// Helper: classify path hash size from a path string
// 1-byte = 2 hex chars per element, 2-byte = 4, 3-byte = 6
function getPathHashSize($path) {
    if (!$path || trim($path) === '') return 0; // no path (direct/zero-hop)
    $first = explode(',', $path)[0];
    $len = strlen(trim($first));
    if ($len === 6) return 3;
    if ($len === 4) return 2;
    if ($len === 2) return 1;
    return 0; // unknown
}

// Count packets by hash size for a given time range (only packets with paths)
function countByHashSize($pdo, $table, $startDate, $endDate) {
    $counts = array('1-byte' => 0, '2-byte' => 0, '3-byte' => 0, 'total' => 0);

    $query = $pdo->prepare("SELECT path FROM $table WHERE sent_at >= :start AND sent_at < :end AND path IS NOT NULL AND path != ''");
    $query->bindParam(':start', $startDate, PDO::PARAM_STR);
    $query->bindParam(':end', $endDate, PDO::PARAM_STR);
    $query->execute();

    while ($row = $query->fetch(PDO::FETCH_ASSOC)) {
        $size = getPathHashSize($row['path']);
        if ($size === 0) continue; // skip unrecognized
        $counts['total']++;
        switch ($size) {
            case 1: $counts['1-byte']++; break;
            case 2: $counts['2-byte']++; break;
            case 3: $counts['3-byte']++; break;
        }
    }

    return $counts;
}

$now = new DateTime('now', new DateTimeZone('UTC'));
$thisWeekEnd = $now->format('Y-m-d H:i:s');
$thisWeekStart = (clone $now)->modify('-7 days')->format('Y-m-d H:i:s');
$lastWeekStart = (clone $now)->modify('-14 days')->format('Y-m-d H:i:s');

$tables = array('advertisements', 'channel_messages');

$thisWeek = array('1-byte' => 0, '2-byte' => 0, '3-byte' => 0, 'total' => 0);
$lastWeek = array('1-byte' => 0, '2-byte' => 0, '3-byte' => 0, 'total' => 0);

foreach ($tables as $table) {
    $tw = countByHashSize($pdo, $table, $thisWeekStart, $thisWeekEnd);
    $lw = countByHashSize($pdo, $table, $lastWeekStart, $thisWeekStart);
    foreach (array_keys($thisWeek) as $k) {
        $thisWeek[$k] += $tw[$k];
        $lastWeek[$k] += $lw[$k];
    }
}

// Per-table breakdown for this week
$byType = array();
foreach ($tables as $table) {
    $byType[$table] = countByHashSize($pdo, $table, $thisWeekStart, $thisWeekEnd);
}

$stats = array(
    'this_week' => $thisWeek,
    'last_week' => $lastWeek,
    'by_type' => $byType,
    'period' => array(
        'this_week_start' => $thisWeekStart,
        'this_week_end' => $thisWeekEnd,
        'last_week_start' => $lastWeekStart,
        'last_week_end' => $thisWeekStart
    )
);

setCache($cacheKey, $stats);

header('Content-Type: application/json; charset=utf-8');
header('X-Cache: MISS');
echo json_encode($stats, JSON_PRETTY_PRINT);

?>
