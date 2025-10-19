<?php
/**
 * Web interface for deleting nodes from the meshlog database
 * 
 * This provides a simple web interface to delete contacts (nodes) from the database.
 * Access this through your web browser for easier interaction.
 */

// Include the database configuration
include "config.php";

// Function to determine node type based on advertisement type
function getNodeTypeFromAdType($adType) {
    switch ($adType) {
        case 1:
            return ['type' => 'Client', 'icon' => '👤', 'color' => '#28a745'];
        case 2:
            return ['type' => 'Repeater', 'icon' => '📡', 'color' => '#007bff'];
        case 3:
            return ['type' => 'Room', 'icon' => '🏠', 'color' => '#fd7e14'];
        default:
            return ['type' => 'Unknown', 'icon' => '❓', 'color' => '#6c757d'];
    }
}

// Function to list all contacts with sorting
function listContacts($pdo, $sortBy = 'id', $sortOrder = 'ASC') {
    // Validate sort column
    $allowedColumns = ['id', 'name', 'public_key', 'enabled', 'created_at', 'type'];
    if (!in_array($sortBy, $allowedColumns)) {
        $sortBy = 'id';
    }
    
    // Validate sort order
    $sortOrder = strtoupper($sortOrder);
    if (!in_array($sortOrder, ['ASC', 'DESC'])) {
        $sortOrder = 'ASC';
    }
    
    // Join with advertisements to get the latest type for each contact
    $orderBy = $sortBy;
    if ($sortBy === 'type') {
        $orderBy = 'ad_type';
    }
    
    $stmt = $pdo->query("
        SELECT c.id, c.public_key, c.name, c.enabled, c.created_at, 
               COALESCE(a.type, 0) as ad_type
        FROM contacts c
        LEFT JOIN (
            SELECT contact_id, type, 
                   ROW_NUMBER() OVER (PARTITION BY contact_id ORDER BY created_at DESC) as rn
            FROM advertisements
        ) a ON c.id = a.contact_id AND a.rn = 1
        ORDER BY $orderBy $sortOrder
    ");
    $contacts = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Add node type information to each contact
    foreach ($contacts as &$contact) {
        $contact['node_type'] = getNodeTypeFromAdType($contact['ad_type']);
    }
    unset($contact); // Clear the reference to prevent duplication
    
    // Check for public key collisions (first 2 characters) among repeaters
    $repeaterPrefixes = [];
    foreach ($contacts as $contact) {
        if ($contact['node_type']['type'] === 'Repeater' && !empty($contact['public_key'])) {
            $prefix = substr($contact['public_key'], 0, 2);
            if (!isset($repeaterPrefixes[$prefix])) {
                $repeaterPrefixes[$prefix] = [];
            }
            $repeaterPrefixes[$prefix][] = $contact['id'];
        }
    }
    
    // Check for duplicate names among repeaters (case insensitive)
    $repeaterNames = [];
    foreach ($contacts as $contact) {
        if ($contact['node_type']['type'] === 'Repeater' && !empty($contact['name'])) {
            $nameKey = strtolower($contact['name']);
            if (!isset($repeaterNames[$nameKey])) {
                $repeaterNames[$nameKey] = [];
            }
            $repeaterNames[$nameKey][] = $contact['id'];
        }
    }
    
    // Mark contacts with issues
    foreach ($contacts as &$contact) {
        $contact['has_key_collision'] = false;
        $contact['has_name_duplicate'] = false;
        
        if ($contact['node_type']['type'] === 'Repeater') {
            // Check for public key collision
            if (!empty($contact['public_key'])) {
                $prefix = substr($contact['public_key'], 0, 2);
                if (isset($repeaterPrefixes[$prefix]) && count($repeaterPrefixes[$prefix]) > 1) {
                    $contact['has_key_collision'] = true;
                }
            }
            
            // Check for duplicate name
            if (!empty($contact['name'])) {
                $nameKey = strtolower($contact['name']);
                if (isset($repeaterNames[$nameKey]) && count($repeaterNames[$nameKey]) > 1) {
                    $contact['has_name_duplicate'] = true;
                }
            }
        }
    }
    unset($contact); // Clear the reference to prevent duplication
    
    return $contacts;
}

// Function to find contact by ID
function findContactById($pdo, $id) {
    $stmt = $pdo->prepare("SELECT * FROM contacts WHERE id = ?");
    $stmt->execute([$id]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
}

// Function to find contact by public key
function findContactByPublicKey($pdo, $publicKey) {
    $stmt = $pdo->prepare("SELECT * FROM contacts WHERE public_key = ?");
    $stmt->execute([$publicKey]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
}

// Function to check if contact has historical data
function getContactDataCounts($pdo, $contactId) {
    $counts = [];
    
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM advertisements WHERE contact_id = ?");
    $stmt->execute([$contactId]);
    $counts['advertisements'] = $stmt->fetchColumn();
    
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM channel_messages WHERE contact_id = ?");
    $stmt->execute([$contactId]);
    $counts['channel_messages'] = $stmt->fetchColumn();
    
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM direct_messages WHERE contact_id = ?");
    $stmt->execute([$contactId]);
    $counts['direct_messages'] = $stmt->fetchColumn();
    
    return $counts;
}

// Function to delete contact and all related data
function deleteContact($pdo, $contactId) {
    try {
        $pdo->beginTransaction();
        
        // Count related records before deletion
        $counts = getContactDataCounts($pdo, $contactId);
        
        // Delete in correct order (respecting foreign key constraints)
        
        // 1. Delete advertisements
        if ($counts['advertisements'] > 0) {
            $stmt = $pdo->prepare("DELETE FROM advertisements WHERE contact_id = ?");
            $stmt->execute([$contactId]);
        }
        
        // 2. Delete channel messages (if any exist - to avoid foreign key constraint)
        if ($counts['channel_messages'] > 0) {
            $stmt = $pdo->prepare("DELETE FROM channel_messages WHERE contact_id = ?");
            $stmt->execute([$contactId]);
        }
        
        // 3. Delete the contact itself
        $stmt = $pdo->prepare("DELETE FROM contacts WHERE id = ?");
        $stmt->execute([$contactId]);
        
        $pdo->commit();
        
        $message = "Successfully deleted contact";
        if ($counts['advertisements'] > 0) {
            $message .= " and {$counts['advertisements']} advertisement(s)";
        }
        if ($counts['channel_messages'] > 0) {
            $message .= " and {$counts['channel_messages']} channel message(s)";
        }
        if ($counts['direct_messages'] > 0) {
            $message .= " and {$counts['direct_messages']} direct message(s)";
        }
        $message .= "!";
        
        return [
            'success' => true,
            'message' => $message,
            'deleted_counts' => $counts
        ];
        
    } catch (Exception $e) {
        $pdo->rollBack();
        return [
            'success' => false,
            'message' => "Error deleting contact: " . $e->getMessage()
        ];
    }
}

// Handle POST request for deletion
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
    if ($_POST['action'] === 'get_counts') {
        // Get data counts for a contact
        $contactId = intval($_POST['contact_id']);
        if ($contactId <= 0) {
            $result = ['success' => false, 'message' => 'Invalid contact ID'];
        } else {
            $pdo = openPdo();
            $counts = getContactDataCounts($pdo, $contactId);
            $result = ['success' => true, 'counts' => $counts];
        }
        
        header('Content-Type: application/json');
        echo json_encode($result);
        exit;
    }
    
    if ($_POST['action'] === 'delete') {
        $pdo = openPdo();
        $result = ['success' => false, 'message' => 'Invalid request'];
    
        if (isset($_POST['contact_id'])) {
            // Delete by ID
            $contactId = intval($_POST['contact_id']);
            if ($contactId <= 0) {
                $result = ['success' => false, 'message' => 'Invalid contact ID'];
            } else {
                $result = deleteContact($pdo, $contactId);
            }
        } elseif (isset($_POST['public_keys'])) {
            // Delete by multiple public keys
            $publicKeysText = trim($_POST['public_keys']);
            if (empty($publicKeysText)) {
                $result = ['success' => false, 'message' => 'No public keys provided.'];
            } else {
                // Parse public keys (one per line)
                $publicKeys = array_filter(array_map('trim', explode("\n", $publicKeysText)));
                $results = [];
                $successCount = 0;
                $errorCount = 0;
                
                foreach ($publicKeys as $publicKey) {
                    if (empty($publicKey)) continue;
                    
                    // Validate format
                    if (strlen($publicKey) !== 64 || !preg_match('/^[A-F0-9]+$/', $publicKey)) {
                        $results[] = "Invalid format: $publicKey";
                        $errorCount++;
                        continue;
                    }
                    
                    // Find and delete contact
                    $contact = findContactByPublicKey($pdo, $publicKey);
                    if (!$contact) {
                        $results[] = "Not found: $publicKey";
                        $errorCount++;
                    } else {
                        $deleteResult = deleteContact($pdo, $contact['id']);
                        if ($deleteResult['success']) {
                            $results[] = "Deleted: {$contact['name']} ($publicKey)";
                            $successCount++;
                        } else {
                            $results[] = "Error deleting $publicKey: " . $deleteResult['message'];
                            $errorCount++;
                        }
                    }
                }
                
                $message = "Processed " . count($publicKeys) . " keys: $successCount deleted, $errorCount errors.";
                if (!empty($results)) {
                    $message .= "\n\nDetails:\n" . implode("\n", $results);
                }
                
                $result = [
                    'success' => $errorCount === 0,
                    'message' => $message
                ];
            }
        }
        
        // Return JSON response
        header('Content-Type: application/json');
        echo json_encode($result);
        exit;
    }
}

// Get sorting parameters
$sortBy = $_GET['sort'] ?? 'id';
$sortOrder = $_GET['order'] ?? 'ASC';

// Get all contacts for display
try {
    $pdo = openPdo();
    $contacts = listContacts($pdo, $sortBy, $sortOrder);
} catch (Exception $e) {
    $error = "Database error: " . $e->getMessage();
    $contacts = [];
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Delete Meshlog Nodes</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            border-bottom: 2px solid #007bff;
            padding-bottom: 10px;
        }
        .error {
            background-color: #f8d7da;
            color: #721c24;
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 20px;
        }
        .success {
            background-color: #d4edda;
            color: #155724;
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 20px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }
        th {
            background-color: #f8f9fa;
            font-weight: bold;
            cursor: pointer;
            user-select: none;
            position: relative;
        }
        th:hover {
            background-color: #e9ecef;
        }
        .sortable::after {
            content: ' ↕';
            opacity: 0.5;
            font-size: 12px;
        }
        .sort-asc::after {
            content: ' ↑';
            opacity: 1;
            color: #007bff;
        }
        .sort-desc::after {
            content: ' ↓';
            opacity: 1;
            color: #007bff;
        }
        tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        .delete-btn {
            background-color: #dc3545;
            color: white;
            border: none;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .delete-btn:hover {
            background-color: #c82333;
        }
        .public-key {
            font-family: monospace;
            font-size: 11px;
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .confirm-dialog {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
            z-index: 1000;
        }
        .confirm-content {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border-radius: 8px;
            max-width: 400px;
            width: 90%;
        }
        .btn {
            padding: 8px 16px;
            margin: 5px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .btn-danger {
            background-color: #dc3545;
            color: white;
        }
        .btn-secondary {
            background-color: #6c757d;
            color: white;
        }
        .btn:hover {
            opacity: 0.8;
        }
        .node-type {
            display: inline-flex;
            align-items: center;
            padding: 2px 6px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: bold;
            margin-right: 8px;
            white-space: nowrap;
        }
        .node-type-icon {
            margin-right: 4px;
        }
        .client { background-color: #e8f5e8; color: #28a745; }
        .repeater { background-color: #e3f2fd; color: #007bff; }
        .room { background-color: #fff3e0; color: #fd7e14; }
        .unknown { background-color: #f8f9fa; color: #6c757d; }
        .key-collision {
            background-color: #fff3cd !important;
            border: 2px solid #ffc107 !important;
        }
        .name-duplicate {
            color: #dc3545 !important;
            font-weight: bold !important;
            text-decoration: underline !important;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Delete Meshlog Nodes</h1>
        
        <!-- Legend -->
        <div style="margin: 20px 0; padding: 15px; background-color: #f8f9fa; border-radius: 5px; border-left: 4px solid #007bff;">
            <h3 style="margin-top: 0; color: #007bff;">Legend & Color Codes</h3>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <!-- Node Types -->
                <div>
                    <h4 style="margin: 0 0 10px 0; color: #333;">Node Types:</h4>
                    <div style="display: flex; align-items: center; margin: 5px 0;">
                        <span class="node-type client"><span class="node-type-icon">👤</span>Client</span>
                        <span style="margin-left: 10px; color: #666;">Personal devices/clients</span>
                    </div>
                    <div style="display: flex; align-items: center; margin: 5px 0;">
                        <span class="node-type repeater"><span class="node-type-icon">📡</span>Repeater</span>
                        <span style="margin-left: 10px; color: #666;">Mesh repeaters/towers</span>
                    </div>
                    <div style="display: flex; align-items: center; margin: 5px 0;">
                        <span class="node-type room"><span class="node-type-icon">🏠</span>Room</span>
                        <span style="margin-left: 10px; color: #666;">Group/room nodes</span>
                    </div>
                    <div style="display: flex; align-items: center; margin: 5px 0;">
                        <span class="node-type unknown"><span class="node-type-icon">❓</span>Unknown</span>
                        <span style="margin-left: 10px; color: #666;">Unknown type</span>
                    </div>
                </div>
                
                <!-- Warning Indicators -->
                <div>
                    <h4 style="margin: 0 0 10px 0; color: #333;">Warning Indicators:</h4>
                    <div style="display: flex; align-items: center; margin: 5px 0;">
                        <div style="width: 100px; height: 20px; background-color: #fff3cd; border: 2px solid #ffc107; border-radius: 3px; margin-right: 10px;"></div>
                        <span style="color: #666;">Public key collision</span>
                    </div>
                    <div style="display: flex; align-items: center; margin: 5px 0;">
                        <span style="color: #dc3545; font-weight: bold; text-decoration: underline; margin-right: 10px;">Duplicate Name</span>
                        <span style="color: #666;">Repeater names are identical (case insensitive)</span>
                    </div>
                    <div style="display: flex; align-items: center; margin: 5px 0;">
                        <span style="color: #666; font-size: 12px;">🟡 Yellow boxes = Key collision | 🔴 Red names = Name collision</span>
                    </div>
                </div>
            </div>
        </div>
        
        <?php if (isset($error)): ?>
            <div class="error"><?php echo htmlspecialchars($error); ?></div>
        <?php endif; ?>
        
        <div id="message-container"></div>
        
        <?php if (!empty($contacts)): ?>
            <p>Found <?php echo count($contacts); ?> contacts. Click "Delete" to remove a contact and its advertisements.</p>
            
            <!-- Manual Delete Section -->
            <div style="margin: 20px 0; padding: 15px; background-color: #f8f9fa; border-radius: 5px; border-left: 4px solid #007bff;">
                <h3 style="margin-top: 0; color: #007bff;">Manual Delete by Public Key(s)</h3>
                <p style="margin-bottom: 10px;">Enter one or more full public keys to delete contacts (one per line):</p>
                <form id="manualDeleteForm">
                    <textarea id="manualPublicKeys" placeholder="Enter public keys, one per line:&#10;57F7344101614740C8F968476EA74A6F8721E112790E46AAD9EB35379E1B733F&#10;51CE3578FF59BD6059DDE358D22E78A2484E42029A626DCCF2921ED823750FB6&#10;..." 
                              style="width: 100%; height: 120px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-family: monospace; font-size: 12px; resize: vertical;"
                              rows="6"></textarea>
                    <div style="margin-top: 10px;">
                        <button type="submit" style="padding: 8px 16px; background-color: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Delete All Keys
                        </button>
                        <button type="button" onclick="clearManualKeys()" style="padding: 8px 16px; background-color: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; margin-left: 10px;">
                            Clear
                        </button>
                    </div>
                </form>
                <small style="color: #666; margin-top: 5px; display: block;">
                    Enter 64-character hexadecimal public keys, one per line. Empty lines will be ignored.
                </small>
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th class="sortable" data-column="id">ID</th>
                        <th class="sortable" data-column="type">Type</th>
                        <th class="sortable" data-column="name">Name</th>
                        <th class="sortable" data-column="public_key">Public Key</th>
                        <th class="sortable" data-column="enabled">Enabled</th>
                        <th class="sortable" data-column="created_at">Created</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($contacts as $contact): ?>
                        <tr>
                            <td><?php echo htmlspecialchars($contact['id']); ?></td>
                            <td>
                                <span class="node-type <?php echo strtolower(str_replace(' ', '-', $contact['node_type']['type'])); ?>">
                                    <span class="node-type-icon"><?php echo $contact['node_type']['icon']; ?></span>
                                    <?php echo htmlspecialchars($contact['node_type']['type']); ?>
                                </span>
                            </td>
                            <td class="<?php echo $contact['has_name_duplicate'] ? 'name-duplicate' : ''; ?>">
                                <?php echo htmlspecialchars($contact['name'] ?? 'NULL'); ?>
                            </td>
                            <td class="public-key <?php echo $contact['has_key_collision'] ? 'key-collision' : ''; ?>" 
                                title="<?php echo htmlspecialchars($contact['public_key']); ?>">
                                <?php echo htmlspecialchars($contact['public_key']); ?>
                            </td>
                            <td><?php echo $contact['enabled'] ? 'Yes' : 'No'; ?></td>
                            <td><?php echo htmlspecialchars($contact['created_at']); ?></td>
                            <td>
                                <button class="delete-btn" onclick="confirmDelete(<?php echo $contact['id']; ?>, '<?php echo htmlspecialchars($contact['name'] ?? 'Unknown'); ?>')">
                                    Delete
                                </button>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php else: ?>
            <p>No contacts found in the database.</p>
        <?php endif; ?>
    </div>
    
    <!-- Confirmation Dialog -->
    <div id="confirmDialog" class="confirm-dialog">
        <div class="confirm-content">
            <h3>Confirm Deletion</h3>
            <p>Are you sure you want to delete contact <strong id="contactName"></strong>?</p>
            
            <div id="dataCounts" style="display: none;">
                <p><strong>Data to be deleted:</strong></p>
                <ul id="dataList">
                    <li>Advertisements (current node status)</li>
                    <li>Contact record</li>
                </ul>
            </div>
            
            <div id="historicalDataWarning" style="display: none; background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 10px; margin: 10px 0;">
                <h4 style="color: #856404; margin: 0 0 10px 0;">⚠️ WARNING: Historical Data Will Be Lost!</h4>
                <p style="margin: 0; color: #856404;"><strong>This contact has historical communication data that will be permanently deleted:</strong></p>
                <ul id="historicalDataList" style="margin: 5px 0; color: #856404;"></ul>
                <p style="margin: 5px 0 0 0; color: #856404; font-weight: bold;">This action cannot be undone!</p>
            </div>
            
            <div id="checkboxContainer" style="display: none; margin: 15px 0;">
                <label style="display: flex; align-items: center; font-weight: bold; color: #dc3545;">
                    <input type="checkbox" id="confirmHistoricalData" style="margin-right: 8px;">
                    I understand that historical data will be permanently deleted and cannot be recovered
                </label>
            </div>
            
            <p style="margin-top: 15px;">This action cannot be undone!</p>
            <div>
                <button id="confirmDelete" class="btn btn-danger" disabled>Yes, Delete</button>
                <button onclick="closeConfirmDialog()" class="btn btn-secondary">Cancel</button>
            </div>
        </div>
    </div>

    <script>
        let contactToDelete = null;
        
        function confirmDelete(contactId, contactName) {
            contactToDelete = contactId;
            document.getElementById('contactName').textContent = contactName;
            
            // Reset dialog state
            document.getElementById('confirmDelete').disabled = true;
            document.getElementById('confirmHistoricalData').checked = false;
            document.getElementById('dataCounts').style.display = 'none';
            document.getElementById('historicalDataWarning').style.display = 'none';
            document.getElementById('checkboxContainer').style.display = 'none';
            
            // Fetch data counts for this contact
            const formData = new FormData();
            formData.append('action', 'get_counts');
            formData.append('contact_id', contactId);
            
            fetch('delete_node_web.php', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    updateConfirmationDialog(data.counts);
                } else {
                    // Fallback if counts can't be fetched
                    document.getElementById('confirmDelete').disabled = false;
                }
                document.getElementById('confirmDialog').style.display = 'block';
            })
            .catch(error => {
                console.error('Error fetching data counts:', error);
                // Fallback if counts can't be fetched
                document.getElementById('confirmDelete').disabled = false;
                document.getElementById('confirmDialog').style.display = 'block';
            });
        }
        
        function updateConfirmationDialog(counts) {
            const dataList = document.getElementById('dataList');
            const historicalDataList = document.getElementById('historicalDataList');
            const dataCounts = document.getElementById('dataCounts');
            const historicalDataWarning = document.getElementById('historicalDataWarning');
            const checkboxContainer = document.getElementById('checkboxContainer');
            const deleteButton = document.getElementById('confirmDelete');
            
            // Clear existing lists
            dataList.innerHTML = '';
            historicalDataList.innerHTML = '';
            
            // Build data list
            dataList.innerHTML = '<li>Advertisements (current node status)</li><li>Contact record</li>';
            
            // Check for historical data
            const hasHistoricalData = counts.channel_messages > 0 || counts.direct_messages > 0;
            
            if (hasHistoricalData) {
                // Show warning for historical data
                dataCounts.style.display = 'block';
                historicalDataWarning.style.display = 'block';
                checkboxContainer.style.display = 'block';
                
                // Add historical data items
                if (counts.channel_messages > 0) {
                    historicalDataList.innerHTML += `<li>${counts.channel_messages} channel message(s)</li>`;
                }
                if (counts.direct_messages > 0) {
                    historicalDataList.innerHTML += `<li>${counts.direct_messages} direct message(s)</li>`;
                }
                
                // Keep delete button disabled until checkbox is checked
                deleteButton.disabled = true;
            } else {
                // No historical data, just show basic info
                dataCounts.style.display = 'block';
                historicalDataWarning.style.display = 'none';
                checkboxContainer.style.display = 'none';
                deleteButton.disabled = false;
            }
        }
        
        function closeConfirmDialog() {
            document.getElementById('confirmDialog').style.display = 'none';
            contactToDelete = null;
        }
        
        document.getElementById('confirmDelete').addEventListener('click', function() {
            if (!contactToDelete) return;
            
            // Show loading state
            const btn = this;
            const originalText = btn.textContent;
            btn.textContent = 'Deleting...';
            btn.disabled = true;
            
            // Send delete request
            const formData = new FormData();
            formData.append('action', 'delete');
            formData.append('contact_id', contactToDelete);
            
            fetch('delete_node_web.php', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showMessage(data.message, 'success');
                    // Reload the page to update the table
                    setTimeout(() => {
                        location.reload();
                    }, 2000);
                } else {
                    showMessage(data.message, 'error');
                }
            })
            .catch(error => {
                showMessage('An error occurred: ' + error.message, 'error');
            })
            .finally(() => {
                btn.textContent = originalText;
                btn.disabled = false;
                closeConfirmDialog();
            });
        });
        
        function showMessage(message, type) {
            const container = document.getElementById('message-container');
            container.innerHTML = '<div class="' + type + '">' + message + '</div>';
            
            // Auto-hide success messages
            if (type === 'success') {
                setTimeout(() => {
                    container.innerHTML = '';
                }, 5000);
            }
        }
        
        // Close dialog when clicking outside
        document.getElementById('confirmDialog').addEventListener('click', function(e) {
            if (e.target === this) {
                closeConfirmDialog();
            }
        });
        
        // Sorting functionality
        function updateSortIndicators() {
            const urlParams = new URLSearchParams(window.location.search);
            const currentSort = urlParams.get('sort') || 'id';
            const currentOrder = urlParams.get('order') || 'ASC';
            
            // Remove all sort classes
            document.querySelectorAll('.sortable').forEach(th => {
                th.classList.remove('sort-asc', 'sort-desc');
            });
            
            // Add appropriate class to current sort column
            const currentTh = document.querySelector(`[data-column="${currentSort}"]`);
            if (currentTh) {
                currentTh.classList.add(currentOrder.toLowerCase() === 'desc' ? 'sort-desc' : 'sort-asc');
            }
        }
        
        function sortTable(column) {
            const urlParams = new URLSearchParams(window.location.search);
            const currentSort = urlParams.get('sort') || 'id';
            const currentOrder = urlParams.get('order') || 'ASC';
            
            // Determine new order
            let newOrder = 'ASC';
            if (currentSort === column && currentOrder === 'ASC') {
                newOrder = 'DESC';
            }
            
            // Update URL parameters
            urlParams.set('sort', column);
            urlParams.set('order', newOrder);
            
            // Reload page with new parameters
            window.location.href = window.location.pathname + '?' + urlParams.toString();
        }
        
        // Add click handlers to sortable columns
        document.querySelectorAll('.sortable').forEach(th => {
            th.addEventListener('click', function() {
                const column = this.getAttribute('data-column');
                sortTable(column);
            });
        });
        
        // Initialize sort indicators
        updateSortIndicators();
        
        // Handle checkbox for historical data confirmation
        document.getElementById('confirmHistoricalData').addEventListener('change', function() {
            const deleteButton = document.getElementById('confirmDelete');
            deleteButton.disabled = !this.checked;
        });
        
        // Handle manual delete form
        document.getElementById('manualDeleteForm').addEventListener('submit', function(e) {
            e.preventDefault();
            
            const publicKeysText = document.getElementById('manualPublicKeys').value.trim().toUpperCase();
            
            if (!publicKeysText) {
                showMessage('No public keys provided.', 'error');
                return;
            }
            
            // Parse and validate public keys
            const publicKeys = publicKeysText.split('\n').map(key => key.trim()).filter(key => key.length > 0);
            const invalidKeys = publicKeys.filter(key => key.length !== 64 || !/^[A-F0-9]+$/.test(key));
            
            if (invalidKeys.length > 0) {
                showMessage(`Invalid public key format(s). Must be 64 hexadecimal characters:\n${invalidKeys.join('\n')}`, 'error');
                return;
            }
            
            // Confirm deletion
            const keyCount = publicKeys.length;
            const keyList = publicKeys.slice(0, 3).join('\n');
            const moreText = keyCount > 3 ? `\n... and ${keyCount - 3} more keys` : '';
            
            if (!confirm(`Are you sure you want to delete ${keyCount} contact(s) with these public keys:\n\n${keyList}${moreText}\n\nThis will delete advertisements and contact records. Historical messages will be preserved.`)) {
                return;
            }
            
            // Show loading state
            const form = this;
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Deleting...';
            submitBtn.disabled = true;
            
            // Send delete request
            const formData = new FormData();
            formData.append('action', 'delete');
            formData.append('public_keys', publicKeysText);
            
            fetch('delete_node_web.php', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                // Show detailed results
                const messageType = data.success ? 'success' : 'error';
                showMessage(data.message, messageType);
                
                // Clear the form if all successful
                if (data.success) {
                    document.getElementById('manualPublicKeys').value = '';
                    // Reload the page to update the table
                    setTimeout(() => {
                        location.reload();
                    }, 3000);
                }
            })
            .catch(error => {
                showMessage('An error occurred: ' + error.message, 'error');
            })
            .finally(() => {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            });
        });
        
        // Clear button function
        function clearManualKeys() {
            document.getElementById('manualPublicKeys').value = '';
        }
    </script>
</body>
</html>
