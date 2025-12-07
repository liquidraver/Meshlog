<?php
require_once "../../../lib/meshlog.class.php";
require_once "../../../config.php";
include "../utils.php";
include "../cache.php";

// Build cache key from parameters
$afterMs = getParam('after_ms', 0);
$cacheKey = 'channels_' . md5($afterMs);

// Cache channels for 60 seconds (they change infrequently)
$cachedData = @getCached($cacheKey, 60);

if ($cachedData !== false && isset($cachedData['data'])) {
    header('Content-Type: application/json; charset=utf-8');
    header('X-Cache: HIT');
    echo json_encode($cachedData['data'], JSON_PRETTY_PRINT);
    exit;
}

$meshlog = new MeshLog(openPdo());

$results = $meshlog->getChannels(array('offset' => 0, 'count' => DEFAULT_COUNT, 'after_ms' => $afterMs));

// Cache the result
setCache($cacheKey, $results);

header('Content-Type: application/json; charset=utf-8');
header('X-Cache: MISS');
echo json_encode($results, JSON_PRETTY_PRINT);

?>