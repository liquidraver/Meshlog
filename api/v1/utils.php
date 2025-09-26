<?php

function getParam($key, $fallback=null) {
    $value = null;
    
    if (isset($_POST[$key])) {
        $value = $_POST[$key];
    } elseif (isset($_GET[$key])) {
        $value = $_GET[$key];
    } else {
        return $fallback;
    }
    
    // Basic sanitization
    if (is_string($value)) {
        $value = trim($value);
        // Remove null bytes and control characters
        $value = str_replace(["\0", "\r", "\n", "\t"], '', $value);
        // Limit length to prevent buffer overflow
        if (strlen($value) > 1000) {
            $value = substr($value, 0, 1000);
        }
    }
    
    return $value;
}

function validateInteger($value, $min = null, $max = null) {
    if (!is_numeric($value)) return false;
    $int = intval($value);
    if ($min !== null && $int < $min) return false;
    if ($max !== null && $int > $max) return false;
    return $int;
}

function validateString($value, $maxLength = 1000) {
    if (!is_string($value)) return false;
    if (strlen($value) > $maxLength) return false;
    return $value;
}

function sanitizeInput($input) {
    if (is_array($input)) {
        return array_map('sanitizeInput', $input);
    }
    
    if (is_string($input)) {
        // Remove potentially dangerous characters
        $input = str_replace(['<', '>', '"', "'", '&'], ['&lt;', '&gt;', '&quot;', '&#x27;', '&amp;'], $input);
        return trim($input);
    }
    
    return $input;
}

?>