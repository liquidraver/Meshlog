<?php
include "config.php";

echo "=== Current Database Status ===\n\n";

try {
    $pdo = openPdo();
    
    $tables = [
        'reporters' => 'Reporters (your logger nodes)',
        'contacts' => 'Contacts (nodes that sent messages)', 
        'advertisements' => 'ADV messages (node advertisements)',
        'direct_messages' => 'MSG messages (direct messages)',
        'channels' => 'Channels (group channels)',
        'channel_messages' => 'PUB messages (channel messages)',
        'logs' => 'General logs',
        'raw' => 'Raw packet data'
    ];
    
    foreach ($tables as $table => $description) {
        echo "=== $description ===\n";
        
        $stmt = $pdo->query("SELECT COUNT(*) as count FROM $table");
        $count = $stmt->fetch(PDO::FETCH_ASSOC)['count'];
        
        echo "Records: $count\n";
        
        if ($count > 0) {
            // Show recent records
            $stmt = $pdo->query("SELECT * FROM $table ORDER BY created_at DESC LIMIT 3");
            $records = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            foreach ($records as $record) {
                echo "  - ID: " . $record['id'];
                if (isset($record['name'])) echo ", Name: " . $record['name'];
                if (isset($record['created_at'])) echo ", Created: " . $record['created_at'];
                if (isset($record['public_key'])) echo ", Key: " . substr($record['public_key'], 0, 16) . "...";
                echo "\n";
            }
        }
        echo "\n";
    }
    
} catch (PDOException $e) {
    echo "Database error: " . $e->getMessage() . "\n";
}
?>
