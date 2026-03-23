<?php

class Utils {
    public static function time2str($seconds) {
        if (!is_int($seconds)) return null;

        $msec = 0;
        if ($seconds > 10000000000) {
            $msec = $seconds % 1000;
            $seconds /= 1000;
        }

        date_default_timezone_set('UTC');

        // Clamp future timestamps: if more than 5 minutes ahead, use server time
        $now = time();
        if ($seconds > $now + 300) {
            $seconds = $now;
            $msec = 0;
        }

        return date("Y-m-d H:i:s", $seconds) . "." . str_pad($msec, 3, "0", STR_PAD_LEFT);
    }

    public static function get($arr, $key, $fallback) {
        if (array_key_exists($key, $arr)) {
            return $arr[$key];
        }
        return $fallback;
    }
}

?>
