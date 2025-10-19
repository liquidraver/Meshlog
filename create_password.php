<?php
/**
 * Script to create Apache .htpasswd file for delete node protection
 * 
 * This script helps you create the .htpasswd file needed for Apache authentication.
 * Run this script once to set up password protection.
 * 
 * Usage: php create_password.php
 */

echo "=== Apache Password Setup for Delete Node Scripts ===\n\n";

// Get username and password from user
echo "Enter username for delete access: ";
$username = trim(fgets(STDIN));

if (empty($username)) {
    echo "Error: Username cannot be empty.\n";
    exit(1);
}

echo "Enter password for '$username': ";

// Hide password input on Unix systems
if (PHP_OS_FAMILY !== 'Windows') {
    system('stty -echo');
}

$password = trim(fgets(STDIN));

if (PHP_OS_FAMILY !== 'Windows') {
    system('stty echo');
    echo "\n";
}

if (empty($password)) {
    echo "Error: Password cannot be empty.\n";
    exit(1);
}

// Generate password hash using Apache's crypt method
$hash = crypt($password, base64_encode($password));

// Create .htpasswd file
$htpasswd_content = "$username:$hash\n";
$htpasswd_file = '.htpasswd';

if (file_put_contents($htpasswd_file, $htpasswd_content)) {
    echo "\n✓ Successfully created .htpasswd file!\n";
    echo "✓ Username: $username\n";
    echo "✓ Password hash: " . substr($hash, 0, 20) . "...\n\n";
    
    echo "=== Setup Complete ===\n";
    echo "Your delete node scripts are now password protected.\n\n";
    
    echo "To access the web interface:\n";
    echo "1. Go to: http://your-server/delete_node_web.php\n";
    echo "2. Enter username: $username\n";
    echo "3. Enter the password you just set\n\n";
    
    echo "To change the password later, run this script again.\n";
    echo "To remove password protection, delete the .htaccess and .htpasswd files.\n\n";
    
    // Set proper permissions
    if (PHP_OS_FAMILY !== 'Windows') {
        chmod($htpasswd_file, 0644);
        echo "✓ Set file permissions to 644\n";
    }
    
} else {
    echo "\n✗ Error: Could not create .htpasswd file. Check file permissions.\n";
    exit(1);
}

echo "\n=== Security Notes ===\n";
echo "- The .htpasswd file contains password hashes - keep it secure\n";
echo "- Consider placing .htpasswd outside your web root for better security\n";
echo "- You can use multiple users by running this script multiple times\n";
echo "- To add more users, edit .htpasswd manually or run this script again\n";
?>
