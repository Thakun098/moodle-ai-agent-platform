#!/bin/sh
set -eu

ADMIN_USER="${MOODLE_ADMIN_USER:-admin}"
ADMIN_PASS="${MOODLE_ADMIN_PASS:-MoodleAgentPOC2026}"
ADMIN_EMAIL="${MOODLE_ADMIN_EMAIL:-admin@example.com}"
SITE_FULLNAME="${MOODLE_SITE_FULLNAME:-MoodleAgentPOC}"
SITE_SHORTNAME="${MOODLE_SITE_SHORTNAME:-Teacher AI Assistance 2}"

IS_INSTALLED=0
if su -s /bin/sh www-data -c "php -r \"define('CLI_SCRIPT', true); require('/var/www/html/config.php'); global \\\$DB; exit(count(\\\$DB->get_tables(false)) > 0 ? 0 : 1);\"" 2>/dev/null; then
    IS_INSTALLED=1
fi

if [ "$IS_INSTALLED" -eq 1 ]; then
    echo "Database already installed. Running upgrade..."
    su -s /bin/sh www-data -c "php /var/www/html/admin/cli/upgrade.php --non-interactive"
else
    echo "Fresh database. Installing..."
    su -s /bin/sh www-data -c "php /var/www/html/admin/cli/install_database.php --agree-license --adminuser='${ADMIN_USER}' --adminpass='${ADMIN_PASS}' --adminemail='${ADMIN_EMAIL}' --fullname='${SITE_FULLNAME}' --shortname='${SITE_SHORTNAME}'"
fi

echo "Configuring webservices..."
su -s /bin/sh www-data -c "php -r \"define('CLI_SCRIPT', true); require('/var/www/html/config.php'); set_config('enablewebservices', 1); set_config('webserviceprotocols', 'rest');\""

