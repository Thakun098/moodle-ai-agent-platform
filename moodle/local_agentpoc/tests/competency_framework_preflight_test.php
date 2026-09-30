<?php
namespace local_agentpoc;

defined('MOODLE_INTERNAL') || die();

use local_agentpoc\external\competency_framework_preflight as preflight;

/** @covers \local_agentpoc\external\competency_framework_preflight */
final class competency_framework_preflight_test extends \advanced_testcase {
    protected function setUp(): void {
        global $CFG;
        parent::setUp();
        require_once($CFG->dirroot . '/lib/gradelib.php');
        $this->resetAfterTest();
        $this->setAdminUser();
        set_config('enabled', 1, 'core_competency');
    }

    private function framework(array $overrides = []): \core_competency\competency_framework {
        return $this->getDataGenerator()->get_plugin_generator('core_competency')->create_framework($overrides);
    }

    public function test_selected_framework_is_exact_and_signature_detects_changes(): void {
        $framework = $this->framework();
        $id = (int)$framework->get('id');
        $before = preflight::execute($id, false);
        $this->assertSame('ENABLED', $before['status']);
        $this->assertSame($id, $before['framework_id']);
        \core_competency\api::update_framework((object)['id' => $id, 'shortname' => 'Changed authority']);
        $after = preflight::execute($id, false);
        $this->assertNotSame($before['framework_signature'], $after['framework_signature']);
        $this->assertSame(1, \core_competency\competency_framework::count_records());
    }

    public function test_hidden_canonical_never_creates_replacement(): void {
        $this->framework(['idnumber' => preflight::DEFAULT_IDNUMBER, 'visible' => 0]);
        $this->assertSame('CHECK_FAILED', preflight::execute()['status']);
        $this->assertSame(1, \core_competency\competency_framework::count_records());
    }

    public function test_visible_institution_framework_requires_selection(): void {
        $this->framework(['idnumber' => 'INSTITUTION']);
        $this->assertSame('SELECTION_REQUIRED', preflight::execute()['status']);
        $this->assertSame(1, \core_competency\competency_framework::count_records());
    }

    public function test_readonly_absence_never_provisions(): void {
        $this->assertSame('CHECK_FAILED', preflight::execute(0, false)['status']);
        $this->assertSame(0, \core_competency\competency_framework::count_records());
    }

    public function test_default_scale_absence_is_only_supported_system_bypass(): void {
        foreach (\grade_scale::fetch_all_global() as $scale) {
            $scale->delete();
        }
        $this->assertSame('BYPASSED', preflight::execute()['status']);
        $this->assertSame(0, \core_competency\competency_framework::count_records());
    }

    public function test_default_ensure_retries_return_one_identity(): void {
        foreach (\grade_scale::fetch_all_global() as $existing) {
            $existing->delete();
        }
        $scale = new \grade_scale(null, false);
        $scale->courseid = 0;
        $scale->name = get_string('defaultcompetencescale');
        $scale->scale = 'Not yet competent,Competent';
        $scale->userid = 0;
        $scale->description = '';
        $scale->insert();
        $first = preflight::execute();
        $second = preflight::execute();
        $this->assertSame('ENABLED', $first['status']);
        $this->assertSame($first['framework_id'], $second['framework_id']);
        $this->assertSame($first['framework_signature'], $second['framework_signature']);
        $this->assertSame(1, \core_competency\competency_framework::count_records());
    }

    public function test_disabled_subsystem_is_not_bypassed(): void {
        set_config('enabled', 0, 'core_competency');
        $this->expectException(\moodle_exception::class);
        preflight::execute();
    }
}
