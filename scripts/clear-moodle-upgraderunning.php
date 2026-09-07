<?php
define('CLI_SCRIPT', true);
define('NO_UPGRADE_CHECK', true);
require '/var/www/html/config.php';
unset_config('upgraderunning');
echo "upgraderunning cleared\n";
