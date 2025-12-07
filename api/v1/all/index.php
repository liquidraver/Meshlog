<?php
require_once "../../../lib/meshlog.class.php";
require_once "../../../config.php";
include "../utils.php";
include "../rate_limit.php";
include "../cache.php";

// Rate limiting: 60 requests per 60 seconds per IP (increased for initial page loads)
@checkRateLimit(60, 60);

// Build cache key from parameters
$cacheKey = 'all_' . md5(json_encode(array(
    'offset' => getParam('offset', 0),
    'count' => getParam('count', DEFAULT_COUNT),
    'after_ms' => getParam('after_ms', 0),
    'before_ms' => getParam('before_ms', 0)
)));

// Cache for 10 seconds (data changes frequently but short cache helps with concurrent loads)
$cachedData = @getCached($cacheKey, 10);

if ($cachedData !== false && isset($cachedData['data'])) {
    header('Content-Type: application/json; charset=utf-8');
    header('X-Cache: HIT');
    echo json_encode($cachedData['data'], JSON_PRETTY_PRINT);
    exit;
}

$pdo = openPdo();
// Set query timeout to 10 seconds
$pdo->setAttribute(PDO::ATTR_TIMEOUT, 10);
$meshlog = new MeshLog($pdo);

$params = array(
    'offset' => getParam('offset', 0),
    'count' => getParam('count', DEFAULT_COUNT),
    'after_ms' => getParam('after_ms', 0),
    'before_ms' => getParam('before_ms', 0),
);

$paramsContacts = array(
    'offset' => getParam('offset', 0),
    'count' => getParam('count', DEFAULT_COUNT),
    'after_ms' => getParam('after_ms', 0),
    'before_ms' => getParam('before_ms', 0),
    'advertisements' => TRUE
);

// Execute queries - smaller tables first for faster initial response
// Reporters and channels are small, load them first
$reporters = $meshlog->getReporters($params);
$channels = $meshlog->getChannels($params);

// Then load larger tables
$contacts = $meshlog->getContacts($paramsContacts);
$advertisements = $meshlog->getAdvertisements($params);
$direct_messages = $meshlog->getDirectMessages($params);
$channel_messages = $meshlog->getChannelMessages($params);

$result = array(
    'reporters' => $reporters,
    'contacts' => $contacts,
    'advertisements' => $advertisements,
    'channels' => $channels,
    'direct_messages' => $direct_messages,
    'channel_messages' => $channel_messages
);

// Cache the result
setCache($cacheKey, $result);

header('Content-Type: application/json; charset=utf-8');
header('X-Cache: MISS');
echo json_encode($result, JSON_PRETTY_PRINT);

?>