<?php
require_once "../../../lib/meshlog.class.php";
require_once "../../../config.php";
include "../utils.php";
include "../rate_limit.php";
include "../cache.php";

// Cache for 1 minute only (since we're using database country_code, query is fast)
$cacheKey = 'node_stats_' . date('Y-m-d-H-i');
$cachedData = @getCached($cacheKey, 60);

// Check cache FIRST - if we have cached data, return it without rate limiting
if ($cachedData !== false && isset($cachedData['data'])) {
    header('Content-Type: application/json; charset=utf-8');
    header('X-Cache: HIT');
    echo json_encode($cachedData['data'], JSON_PRETTY_PRINT);
    exit;
}

// Rate limiting: 60 requests per 60 seconds per IP (only for non-cached requests)
// Increased to handle initial page loads before cache is populated
@checkRateLimit(60, 60);

$pdo = openPdo();
$pdo->setAttribute(PDO::ATTR_TIMEOUT, 15);
$meshlog = new MeshLog($pdo);

// Get unique contacts with their latest advertisement in the last 7 days
// This ensures we count each node only once, using its most recent advertisement
// Include all nodes, even those without country_code
$query = $pdo->prepare("
    SELECT 
        a.contact_id,
        a.country_code,
        a.type,
        a.sent_at
    FROM advertisements a
    INNER JOIN (
        SELECT contact_id, MAX(sent_at) as max_sent_at
        FROM advertisements
        WHERE lat != 0 AND lon != 0
        AND sent_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY contact_id
    ) latest ON a.contact_id = latest.contact_id AND a.sent_at = latest.max_sent_at
    WHERE a.lat != 0 AND a.lon != 0
    AND a.sent_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
");
$query->execute();
$nodes = $query->fetchAll(PDO::FETCH_ASSOC);

// Debug: log if no nodes found (remove after debugging)
if (empty($nodes)) {
    error_log("Node Stats: No nodes found. Query returned 0 rows. Current time: " . date('Y-m-d H:i:s'));
}

// Country name mapping (ISO 3166-1 alpha-2 to English names)
// Comprehensive list - automatically handles any country code found in database
function getCountryName($code) {
    // Comprehensive ISO 3166-1 alpha-2 country code to English name mapping
    static $countryNames = null;
    
    if ($countryNames === null) {
        $countryNames = array(
            'AD' => 'Andorra', 'AE' => 'United Arab Emirates', 'AF' => 'Afghanistan', 'AG' => 'Antigua and Barbuda',
            'AI' => 'Anguilla', 'AL' => 'Albania', 'AM' => 'Armenia', 'AO' => 'Angola', 'AQ' => 'Antarctica',
            'AR' => 'Argentina', 'AS' => 'American Samoa', 'AT' => 'Austria', 'AU' => 'Australia',
            'AW' => 'Aruba', 'AX' => 'Åland Islands', 'AZ' => 'Azerbaijan', 'BA' => 'Bosnia and Herzegovina',
            'BB' => 'Barbados', 'BD' => 'Bangladesh', 'BE' => 'Belgium', 'BF' => 'Burkina Faso',
            'BG' => 'Bulgaria', 'BH' => 'Bahrain', 'BI' => 'Burundi', 'BJ' => 'Benin',
            'BL' => 'Saint Barthélemy', 'BM' => 'Bermuda', 'BN' => 'Brunei', 'BO' => 'Bolivia',
            'BQ' => 'Caribbean Netherlands', 'BR' => 'Brazil', 'BS' => 'Bahamas', 'BT' => 'Bhutan',
            'BV' => 'Bouvet Island', 'BW' => 'Botswana', 'BY' => 'Belarus', 'BZ' => 'Belize',
            'CA' => 'Canada', 'CC' => 'Cocos Islands', 'CD' => 'DR Congo', 'CF' => 'Central African Republic',
            'CG' => 'Republic of the Congo', 'CH' => 'Switzerland', 'CI' => 'Côte d\'Ivoire', 'CK' => 'Cook Islands',
            'CL' => 'Chile', 'CM' => 'Cameroon', 'CN' => 'China', 'CO' => 'Colombia',
            'CR' => 'Costa Rica', 'CU' => 'Cuba', 'CV' => 'Cape Verde', 'CW' => 'Curaçao',
            'CX' => 'Christmas Island', 'CY' => 'Cyprus', 'CZ' => 'Czech Republic', 'DE' => 'Germany',
            'DJ' => 'Djibouti', 'DK' => 'Denmark', 'DM' => 'Dominica', 'DO' => 'Dominican Republic',
            'DZ' => 'Algeria', 'EC' => 'Ecuador', 'EE' => 'Estonia', 'EG' => 'Egypt',
            'EH' => 'Western Sahara', 'ER' => 'Eritrea', 'ES' => 'Spain', 'ET' => 'Ethiopia',
            'FI' => 'Finland', 'FJ' => 'Fiji', 'FK' => 'Falkland Islands', 'FM' => 'Micronesia',
            'FO' => 'Faroe Islands', 'FR' => 'France', 'GA' => 'Gabon', 'GB' => 'United Kingdom',
            'GD' => 'Grenada', 'GE' => 'Georgia', 'GF' => 'French Guiana', 'GG' => 'Guernsey',
            'GH' => 'Ghana', 'GI' => 'Gibraltar', 'GL' => 'Greenland', 'GM' => 'Gambia',
            'GN' => 'Guinea', 'GP' => 'Guadeloupe', 'GQ' => 'Equatorial Guinea', 'GR' => 'Greece',
            'GS' => 'South Georgia', 'GT' => 'Guatemala', 'GU' => 'Guam', 'GW' => 'Guinea-Bissau',
            'GY' => 'Guyana', 'HK' => 'Hong Kong', 'HM' => 'Heard Island', 'HN' => 'Honduras',
            'HR' => 'Croatia', 'HT' => 'Haiti', 'HU' => 'Hungary', 'ID' => 'Indonesia',
            'IE' => 'Ireland', 'IL' => 'Israel', 'IM' => 'Isle of Man', 'IN' => 'India',
            'IO' => 'British Indian Ocean Territory', 'IQ' => 'Iraq', 'IR' => 'Iran', 'IS' => 'Iceland',
            'IT' => 'Italy', 'JE' => 'Jersey', 'JM' => 'Jamaica', 'JO' => 'Jordan',
            'JP' => 'Japan', 'KE' => 'Kenya', 'KG' => 'Kyrgyzstan', 'KH' => 'Cambodia',
            'KI' => 'Kiribati', 'KM' => 'Comoros', 'KN' => 'Saint Kitts and Nevis', 'KP' => 'North Korea',
            'KR' => 'South Korea', 'KW' => 'Kuwait', 'KY' => 'Cayman Islands', 'KZ' => 'Kazakhstan',
            'LA' => 'Laos', 'LB' => 'Lebanon', 'LC' => 'Saint Lucia', 'LI' => 'Liechtenstein',
            'LK' => 'Sri Lanka', 'LR' => 'Liberia', 'LS' => 'Lesotho', 'LT' => 'Lithuania',
            'LU' => 'Luxembourg', 'LV' => 'Latvia', 'LY' => 'Libya', 'MA' => 'Morocco',
            'MC' => 'Monaco', 'MD' => 'Moldova', 'ME' => 'Montenegro', 'MF' => 'Saint Martin',
            'MG' => 'Madagascar', 'MH' => 'Marshall Islands', 'MK' => 'North Macedonia', 'ML' => 'Mali',
            'MM' => 'Myanmar', 'MN' => 'Mongolia', 'MO' => 'Macau', 'MP' => 'Northern Mariana Islands',
            'MQ' => 'Martinique', 'MR' => 'Mauritania', 'MS' => 'Montserrat', 'MT' => 'Malta',
            'MU' => 'Mauritius', 'MV' => 'Maldives', 'MW' => 'Malawi', 'MX' => 'Mexico',
            'MY' => 'Malaysia', 'MZ' => 'Mozambique', 'NA' => 'Namibia', 'NC' => 'New Caledonia',
            'NE' => 'Niger', 'NF' => 'Norfolk Island', 'NG' => 'Nigeria', 'NI' => 'Nicaragua',
            'NL' => 'Netherlands', 'NO' => 'Norway', 'NP' => 'Nepal', 'NR' => 'Nauru',
            'NU' => 'Niue', 'NZ' => 'New Zealand', 'OM' => 'Oman', 'PA' => 'Panama',
            'PE' => 'Peru', 'PF' => 'French Polynesia', 'PG' => 'Papua New Guinea', 'PH' => 'Philippines',
            'PK' => 'Pakistan', 'PL' => 'Poland', 'PM' => 'Saint Pierre and Miquelon', 'PN' => 'Pitcairn Islands',
            'PR' => 'Puerto Rico', 'PS' => 'Palestine', 'PT' => 'Portugal', 'PW' => 'Palau',
            'PY' => 'Paraguay', 'QA' => 'Qatar', 'RE' => 'Réunion', 'RO' => 'Romania',
            'RS' => 'Serbia', 'RU' => 'Russia', 'RW' => 'Rwanda', 'SA' => 'Saudi Arabia',
            'SB' => 'Solomon Islands', 'SC' => 'Seychelles', 'SD' => 'Sudan', 'SE' => 'Sweden',
            'SG' => 'Singapore', 'SH' => 'Saint Helena', 'SI' => 'Slovenia', 'SJ' => 'Svalbard and Jan Mayen',
            'SK' => 'Slovakia', 'SL' => 'Sierra Leone', 'SM' => 'San Marino', 'SN' => 'Senegal',
            'SO' => 'Somalia', 'SR' => 'Suriname', 'SS' => 'South Sudan', 'ST' => 'São Tomé and Príncipe',
            'SV' => 'El Salvador', 'SX' => 'Sint Maarten', 'SY' => 'Syria', 'SZ' => 'Eswatini',
            'TC' => 'Turks and Caicos Islands', 'TD' => 'Chad', 'TF' => 'French Southern Territories', 'TG' => 'Togo',
            'TH' => 'Thailand', 'TJ' => 'Tajikistan', 'TK' => 'Tokelau', 'TL' => 'Timor-Leste',
            'TM' => 'Turkmenistan', 'TN' => 'Tunisia', 'TO' => 'Tonga', 'TR' => 'Turkey',
            'TT' => 'Trinidad and Tobago', 'TV' => 'Tuvalu', 'TW' => 'Taiwan', 'TZ' => 'Tanzania',
            'UA' => 'Ukraine', 'UG' => 'Uganda', 'UM' => 'United States Minor Outlying Islands', 'US' => 'United States',
            'UY' => 'Uruguay', 'UZ' => 'Uzbekistan', 'VA' => 'Vatican City', 'VC' => 'Saint Vincent and the Grenadines',
            'VE' => 'Venezuela', 'VG' => 'British Virgin Islands', 'VI' => 'United States Virgin Islands', 'VN' => 'Vietnam',
            'VU' => 'Vanuatu', 'WF' => 'Wallis and Futuna', 'WS' => 'Samoa', 'YE' => 'Yemen',
            'YT' => 'Mayotte', 'ZA' => 'South Africa', 'ZM' => 'Zambia', 'ZW' => 'Zimbabwe',
            'UNKNOWN' => 'Unknown'
        );
    }
    
    // Return country name if found, otherwise return the code itself
    return isset($countryNames[$code]) ? $countryNames[$code] : $code;
}

// Group nodes by country and type
$countryStats = array();
$totalNodes = 0;

foreach ($nodes as $node) {
    $country = $node['country_code'] ? $node['country_code'] : 'UNKNOWN';
    
    if (!isset($countryStats[$country])) {
        $countryStats[$country] = array(
            'country_code' => $country,
            'country_name' => $country === 'UNKNOWN' ? 'Unknown' : getCountryName($country),
            'repeaters' => 0,
            'clients' => 0,
            'rooms' => 0,
            'sensors' => 0,
            'total' => 0
        );
    }
    
    $type = intval($node['type']);
    switch ($type) {
        case 1: // Client
            $countryStats[$country]['clients']++;
            break;
        case 2: // Repeater
            $countryStats[$country]['repeaters']++;
            break;
        case 3: // Room
            $countryStats[$country]['rooms']++;
            break;
        case 4: // Sensor
            $countryStats[$country]['sensors']++;
            break;
    }
    
    $countryStats[$country]['total']++;
    $totalNodes++;
}

// Convert to array and sort by total (descending)
$stats = array(
    'by_country' => array_values($countryStats),
    'total' => $totalNodes
);

// Sort by total descending
usort($stats['by_country'], function($a, $b) {
    return $b['total'] - $a['total'];
});

// Cache the result
setCache($cacheKey, $stats);

header('Content-Type: application/json; charset=utf-8');
header('X-Cache: MISS');
echo json_encode($stats, JSON_PRETTY_PRINT);

?>

