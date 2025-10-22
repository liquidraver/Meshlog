<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$url = 'https://api.meshcore.nz/api/v1/config';
$cacheFile = __DIR__ . '/presets-cache.json';
$cacheMaxAge = 86400; // 24 hours

// Try to fetch from API
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// If API fetch successful, save to cache and return
if (!curl_errno($ch) && $httpCode === 200 && $response) {
    // Validate JSON before caching
    $data = json_decode($response, true);
    if ($data !== null && isset($data['config'])) {
        // Save to cache file securely
        file_put_contents($cacheFile, $response, LOCK_EX);
        chmod($cacheFile, 0644); // Read-only for security
        echo $response;
        exit;
    }
}

// API failed, try to use cache
if (file_exists($cacheFile)) {
    $cacheAge = time() - filemtime($cacheFile);
    $cachedData = file_get_contents($cacheFile);
    
    if ($cachedData) {
        // Return cached data with age info
        $data = json_decode($cachedData, true);
        if ($data !== null) {
            $data['_cache_age_hours'] = round($cacheAge / 3600, 1);
            $data['_cache_timestamp'] = date('Y-m-d H:i:s', filemtime($cacheFile));
            echo json_encode($data);
            exit;
        }
    }
}

// Both API and cache failed
http_response_code(503);
echo json_encode(['error' => 'Presets API unavailable and no cache available']);
?>

