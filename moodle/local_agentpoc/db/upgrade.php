<?php
// This file is part of Moodle - http://moodle.org/

defined('MOODLE_INTERNAL') || die();

/**
 * Upgrade local_agentpoc plugin.
 *
 * @param int $oldversion
 * @return bool
 */
function xmldb_local_agentpoc_upgrade($oldversion) {
    global $DB;

    if ($oldversion < 2026090401) {
        $dbman = $DB->get_manager();
        $table = new xmldb_table('local_agentpoc_material');

        $fields = [
            new xmldb_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE),
            new xmldb_field('runid', XMLDB_TYPE_CHAR, '64', null, XMLDB_NOTNULL),
            new xmldb_field('structure_revision', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0'),
            new xmldb_field('sectionref', XMLDB_TYPE_CHAR, '128', null, XMLDB_NOTNULL),
            new xmldb_field('revision', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0'),
            new xmldb_field('usegrounding', XMLDB_TYPE_INTEGER, '1', null, XMLDB_NOTNULL, null, '1'),
            new xmldb_field('publishcourse', XMLDB_TYPE_INTEGER, '1', null, XMLDB_NOTNULL, null, '0'),
            new xmldb_field('userid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL),
            new xmldb_field('timecreated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL),
            new xmldb_field('timemodified', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL),
        ];
        foreach ($fields as $field) {
            $table->addField($field);
        }
        $table->addKey(new xmldb_key('primary', XMLDB_KEY_PRIMARY, ['id']));
        $table->addIndex(new xmldb_index('run_section_revision', XMLDB_INDEX_NOTUNIQUE, ['runid', 'sectionref', 'revision']));

        if (!$dbman->table_exists($table)) {
            $dbman->create_table($table);
        }

        upgrade_plugin_savepoint(true, 2026090401, 'local', 'agentpoc');
    }

    if ($oldversion < 2026090402) {
        upgrade_plugin_savepoint(true, 2026090402, 'local', 'agentpoc');
    }

    return true;
}
