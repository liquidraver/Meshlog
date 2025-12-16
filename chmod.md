# File Permissions Setup

Set proper file permissions and ownership after installation.

**Note:** Replace `www-data` with your Apache user/group if different (e.g., `apache`, `httpd`, `nginx`).

## One-Line Setup Script

```bash
mkdir -p cache/api cache/rate_limit && chown -R www-data:www-data . && find . -type d -exec chmod 755 {} \; && find . -type f -name "*.php" -exec chmod 644 {} \; && find . -type f \( -name "*.js" -o -name "*.css" -o -name "*.html" -o -name "*.json" -o -name "*.sql" -o -name "*.md" -o -name "*.png" -o -name "*.jpg" -o -name "*.svg" -o -name "*.ico" -o -name "*.mp3" \) -exec chmod 644 {} \; && chmod 600 config.php .htaccess .htpasswd 2>/dev/null && chown www-data:www-data config.php .htaccess .htpasswd 2>/dev/null && chmod 775 cache cache/api cache/rate_limit && chown -R www-data:www-data cache/
```
