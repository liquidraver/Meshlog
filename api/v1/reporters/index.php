<?php
require_once "../../../lib/meshlog.class.php";
require_once "../../../config.php";
include "../utils.php";
include "../cache.php";

// Cache reporters for 60 seconds (they change infrequently)
$cacheKey = 'reporters_all';
$cachedData = @getCached($cacheKey, 60);

if ($cachedData !== false && isset($cachedData['data'])) {
    header('Content-Type: application/json; charset=utf-8');
    header('X-Cache: HIT');
    echo json_encode($cachedData['data'], JSON_PRETTY_PRINT);
    exit;
}

$meshlog = new MeshLog(openPdo());

$results = $meshlog->getReporters(array('offset' => 0, 'count' => DEFAULT_COUNT));

// Cache the result
setCache($cacheKey, $results);

header('Content-Type: application/json; charset=utf-8');
header('X-Cache: MISS');
echo json_encode($results, JSON_PRETTY_PRINT);
?>