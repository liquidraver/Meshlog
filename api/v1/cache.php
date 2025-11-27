<?php

function getCacheFile($key, $cacheDir = null) {
    if ($cacheDir === null) {
        $cacheDir = __DIR__ . '/../../cache/api';
    }
    
    if (!is_dir($cacheDir)) {
        if (!@mkdir($cacheDir, 0700, true)) {
            error_log("Failed to create cache directory: $cacheDir");
            return false;
        }
    }
    
    if (!is_writable($cacheDir)) {
        error_log("Cache directory not writable: $cacheDir");
        return false;
    }
    
    $keyHash = md5($key);
    return $cacheDir . '/' . $keyHash . '.json';
}

function getCached($key, $ttlSeconds = 300) {
    $cacheFile = getCacheFile($key);
    
    if ($cacheFile === false) {
        return false;
    }
    
    if (!file_exists($cacheFile)) {
        return false;
    }
    
    $fileTime = filemtime($cacheFile);
    if ((time() - $fileTime) > $ttlSeconds) {
        @unlink($cacheFile);
        return false;
    }
    
    $data = @json_decode(file_get_contents($cacheFile), true);
    if ($data === null) {
        return false;
    }
    
    return $data;
}

function setCache($key, $data) {
    $cacheFile = getCacheFile($key);
    
    if ($cacheFile === false) {
        return false;
    }
    
    $cacheData = array(
        'data' => $data,
        'timestamp' => time()
    );
    @file_put_contents($cacheFile, json_encode($cacheData), LOCK_EX);
    return true;
}

?>

