<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Get parameters
$text = $_GET['text'] ?? '';
$from = $_GET['from'] ?? 'auto';
$to = $_GET['to'] ?? 'en';

if (empty($text)) {
    http_response_code(400);
    echo json_encode(['error' => 'Text parameter is required']);
    exit();
}

// Call MyMemory API
$url = "https://api.mymemory.translated.net/get?q=" . urlencode($text) . "&langpair=" . urlencode($from) . "|" . urlencode($to);

$context = stream_context_create([
    'http' => [
        'timeout' => 10,
        'user_agent' => 'MeshLog/1.0'
    ]
]);

$response = file_get_contents($url, false, $context);

if ($response === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Translation service unavailable']);
    exit();
}

$data = json_decode($response, true);

if ($data && isset($data['responseData']['translatedText'])) {
    echo json_encode([
        'success' => true,
        'translation' => $data['responseData']['translatedText']
    ]);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'Translation failed']);
}
?>

