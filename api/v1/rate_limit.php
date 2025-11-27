<?php

function getClientIp() {
    $ip = null;
    
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $ips = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
        $ip = trim($ips[0]);
    } elseif (!empty($_SERVER['HTTP_X_REAL_IP'])) {
        $ip = $_SERVER['HTTP_X_REAL_IP'];
    } elseif (!empty($_SERVER['REMOTE_ADDR'])) {
        $ip = $_SERVER['REMOTE_ADDR'];
    }
    
    if ($ip && filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
        return $ip;
    }
    
    return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
}

function checkRateLimit($maxRequests = 60, $windowSeconds = 60, $cacheDir = null) {
    if ($cacheDir === null) {
        $cacheDir = __DIR__ . '/../../cache/rate_limit';
    }
    
    if (!is_dir($cacheDir)) {
        if (!@mkdir($cacheDir, 0700, true)) {
            error_log("Failed to create rate limit directory: $cacheDir");
            return true;
        }
    }
    
    if (!is_writable($cacheDir)) {
        error_log("Rate limit directory not writable: $cacheDir");
        return true;
    }
    
    $ip = getClientIp();
    $ipHash = md5($ip);
    $rateLimitFile = $cacheDir . '/' . $ipHash . '.json';
    
    $now = time();
    $data = array('count' => 0, 'reset_time' => $now + $windowSeconds);
    
    if (file_exists($rateLimitFile)) {
        $fileData = @json_decode(file_get_contents($rateLimitFile), true);
        if ($fileData && is_array($fileData)) {
            if ($fileData['reset_time'] > $now) {
                $data = $fileData;
            }
        }
    }
    
    $data['count']++;
    
    if ($data['count'] > $maxRequests) {
        http_response_code(429);
        header('Retry-After: ' . ($data['reset_time'] - $now));
        header('Content-Type: application/json');
        echo json_encode(array('error' => 'Rate limit exceeded. Please try again later.'));
        exit;
    }
    
    @file_put_contents($rateLimitFile, json_encode($data), LOCK_EX);
    
    return true;
}

?>

