/**
 * Snapshot-scoped Student Risk Detail renderer.
 *
 * @module     local_agentpoc/student_risk_detail
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define(['jquery'], function($) {
    'use strict';

    var escapeHtml = function(value) {
        return $('<div>').text(value === null || value === undefined ? '' : String(value)).html();
    };

    var riskText = function(value) { return ({HIGH: 'สูง', MEDIUM: 'ปานกลาง', LOW: 'ต่ำ', INCOMPLETE: 'ข้อมูลไม่สมบูรณ์', NO_PASS_CRITERION: 'ไม่มีเกณฑ์ผ่านที่กำหนด', COMPLETE_PASS: 'เสร็จและผ่าน', COMPLETE_FAIL: 'เสร็จแต่ไม่ผ่าน', COMPLETED: 'เสร็จสมบูรณ์', UNKNOWN: 'ไม่ทราบสถานะ', DRAFT: 'ฉบับร่าง', AVAILABLE: 'มีผลคะแนน'})[value] || value || 'ข้อมูลไม่สมบูรณ์'; };
    var dimensionText = function(value) { return ({PROGRESS: 'ความก้าวหน้า', PERFORMANCE: 'ผลการเรียน', COMPETENCY: 'สมรรถนะ', SUBMISSION: 'การส่งงาน', progress: 'ความก้าวหน้า', performance: 'ผลการเรียน', competency: 'สมรรถนะ', submission: 'การส่งงาน'})[value] || value; };
    var stateText = function(value) { return ({PASS: 'ผ่าน', FAIL: 'ไม่ผ่าน', PROFICIENT: 'ผ่านสมรรถนะ', CONFIRMED_GAP: 'ยืนยันช่องว่างสมรรถนะ', ON_TIME: 'ตรงเวลา', COMPLETE: 'เสร็จสมบูรณ์', LOW_SCORE: 'คะแนนต่ำ', COMPETENCY_CONCERN: 'ข้อควรติดตามด้านสมรรถนะ', SUBMITTED_LATE: 'ส่งล่าช้า', PENDING_GRADE: 'รอผลคะแนน', NOT_RATED: 'ยังไม่ประเมิน', NOT_ATTEMPTED: 'ยังไม่ทำ', OVERDUE: 'เกินกำหนด', REVIEW_PENDING: 'รอการทบทวน', NONE: 'ปกติ', NOT_DUE: 'ยังไม่ถึงกำหนด', INCOMPLETE: 'ข้อมูลไม่สมบูรณ์', NO_PASS_CRITERION: 'ไม่มีเกณฑ์ผ่านที่กำหนด', COMPLETE_PASS: 'เสร็จและผ่าน', COMPLETE_FAIL: 'เสร็จแต่ไม่ผ่าน', COMPLETED: 'เสร็จสมบูรณ์', UNKNOWN: 'ไม่ทราบสถานะ', DRAFT: 'ฉบับร่าง', AVAILABLE: 'มีผลคะแนน'})[value] || value; };
    var typeText = function(value) { return ({quiz: 'แบบทดสอบ', assignment: 'งานมอบหมาย'})[value] || value; };
    var statusText = function(value) { return ({VALID: 'พร้อมใช้งาน', REPAIRED: 'แก้ไขแล้ว', FALLBACK: 'ใช้ข้อมูลเชิงกำหนด', BLOCKED: 'ไม่ใช้ AI', STALE: 'ข้อมูล AI เก่า'})[value] || value; };
    var trendText = function(value) { return ({IMPROVING: 'ดีขึ้น', WORSENING: 'แย่ลง', STABLE: 'ทรงตัว', INSUFFICIENT_HISTORY: 'ข้อมูลย้อนหลังยังไม่เพียงพอ', NEW_RISK: 'เกิดความเสี่ยงใหม่', RESOLVED: 'ความเสี่ยงลดลง'})[value] || value; };
    var actionText = function(value) { return ({REVIEW_ASSESSMENT: 'ทบทวนผลการประเมิน', REVIEW_COMPETENCY_EVIDENCE: 'ทบทวนหลักฐานสมรรถนะ', FOLLOW_UP_OVERDUE_ACTIVITY: 'ติดตามกิจกรรมที่เกินกำหนด', PROVIDE_REMEDIAL_MATERIAL: 'จัดสื่อเสริมความเข้าใจ', SCHEDULE_TEACHER_CHECK_IN: 'นัดติดตามกับผู้สอน', REASSESS_COMPETENCY: 'ประเมินสมรรถนะซ้ำ', MONITOR_NEXT_ASSESSMENT: 'ติดตามการประเมินครั้งถัดไป'})[value] || value; };
    var metricText = function(value) { return ({total_applicable: 'กิจกรรมที่เกี่ยวข้องทั้งหมด', expected_count: 'จำนวนที่คาดหวัง', completed_count: 'กิจกรรมที่ทำเสร็จ', completed_expected_count: 'กิจกรรมที่ควรทำและทำเสร็จ', expected_progress: 'ความก้าวหน้าที่คาดหวัง', actual_progress: 'ความก้าวหน้าจริง', progress_gap_pp: 'ช่องว่างความก้าวหน้า', timeline_compliance: 'การทำตามกรอบเวลา', evaluable_count: 'รายการที่ประเมินได้', recent_fail_count: 'จำนวนไม่ผ่านล่าสุด', recent_low_score_count: 'จำนวนคะแนนต่ำล่าสุด', persistent_fail_count: 'จำนวนไม่ผ่านสะสม', persistent_low_score_count: 'จำนวนคะแนนต่ำสะสม', persistent_low_score_rate: 'สัดส่วนคะแนนต่ำสะสม', rated_expected_count: 'สมรรถนะที่ประเมินแล้ว', confirmed_gap_count: 'ช่องว่างที่ยืนยัน', confirmed_gap_rate: 'สัดส่วนช่องว่างที่ยืนยัน', concern_count: 'ข้อควรติดตาม', review_pending_count: 'รอการทบทวน', late_count: 'ส่งล่าช้า', overdue_count: 'เกินกำหนด', recovery_not_available_count: 'ไม่สามารถทำชดเชยได้'})[value] || value; };
    var ruleText = function(value) { return ({PROGRESS_GAP_HIGH: 'ช่องว่างความก้าวหน้าอยู่ในระดับสูง', PROGRESS_GAP_MEDIUM: 'ช่องว่างความก้าวหน้าอยู่ในระดับปานกลาง', PROGRESS_NONE_COMPLETED_GUARD: 'ยังไม่มีการทำกิจกรรมที่ถึงกำหนดเสร็จ', PROGRESS_TIMELINE_COMPLIANCE_LOW: 'การทำกิจกรรมตามกรอบเวลาอยู่ในระดับต่ำ', PROGRESS_WITHIN_POLICY: 'ความก้าวหน้าอยู่ในเกณฑ์ปกติ', PERFORMANCE_RECENT_FAIL_HIGH: 'มีผลไม่ผ่านหลายครั้งในช่วงล่าสุด', PERFORMANCE_RECENT_FAIL_MEDIUM: 'มีผลไม่ผ่านในช่วงล่าสุด', PERFORMANCE_RECENT_LOW_SCORE_HIGH: 'มีคะแนนต่ำหลายรายการในช่วงล่าสุด', PERFORMANCE_RECENT_LOW_SCORE_MEDIUM: 'มีคะแนนต่ำในช่วงล่าสุด', PERFORMANCE_PERSISTENT_FAIL_HIGH: 'มีผลไม่ผ่านต่อเนื่องหลายรายการ', PERFORMANCE_PERSISTENT_LOW_SCORE_MEDIUM: 'มีคะแนนต่ำต่อเนื่อง', PERFORMANCE_WITHIN_POLICY: 'ผลการเรียนอยู่ในเกณฑ์ปกติ', COMPETENCY_CONFIRMED_GAP_HIGH: 'มีช่องว่างสมรรถนะที่ยืนยันแล้วในระดับสูง', COMPETENCY_CONFIRMED_GAP_MEDIUM: 'พบช่องว่างสมรรถนะที่ยืนยันแล้ว', COMPETENCY_NO_CONFIRMED_GAP: 'ไม่พบช่องว่างสมรรถนะที่ยืนยันแล้ว', SUBMISSION_LATE_MEDIUM: 'มีการส่งงานล่าช้าหลายรายการ', SUBMISSION_LATE_HIGH: 'มีการส่งงานล่าช้าจำนวนมาก', SUBMISSION_OVERDUE_MEDIUM: 'มีกิจกรรมเกินกำหนด', SUBMISSION_OVERDUE_HIGH: 'มีกิจกรรมเกินกำหนดจำนวนมาก', SUBMISSION_MEDIUM_COMBINATION_HIGH: 'การส่งล่าช้าและงานเกินกำหนดรวมกันอยู่ในระดับสูง', SUBMISSION_WITHIN_POLICY: 'การส่งงานอยู่ในเกณฑ์ปกติ'})[value] || 'กฎการประเมินความเสี่ยงตามเกณฑ์ที่กำหนด'; };
    var evidenceKindText = function(value) { return ({PROGRESS_ACTIVITY: 'ความก้าวหน้าของกิจกรรม', ASSESSMENT_RESULT: 'ผลการประเมิน', SUBMISSION_STATE: 'สถานะการส่งงาน', COMPETENCY_STATE: 'สถานะสมรรถนะ'})[value] || value; };

    var pct = function(value) {
        return value === null || value === undefined ? '—' : Math.round(Number(value) * 100) + '%';
    };

    var dateText = function(epochSeconds) {
        return epochSeconds ? new Date(Number(epochSeconds) * 1000).toLocaleString('th-TH') : '—';
    };

    var riskBadge = function(level) {
        if (!level) {
            return '<span class="badge bg-secondary">ข้อมูลไม่สมบูรณ์</span>';
        }
        var cls = level === 'HIGH' ? 'danger' : level === 'MEDIUM' ? 'warning text-dark' : 'success';
        return '<span class="badge bg-' + cls + '">' + escapeHtml(riskText(level)) + '</span>';
    };

    var stateBadge = function(value, kind) {
        var cls = 'secondary';
        if (['PASS', 'PROFICIENT', 'ON_TIME', 'COMPLETE'].indexOf(value) !== -1) {
            cls = 'success';
        } else if (['FAIL', 'CONFIRMED_GAP', 'OVERDUE'].indexOf(value) !== -1) {
            cls = 'danger';
        } else if (['LOW_SCORE', 'COMPETENCY_CONCERN', 'SUBMITTED_LATE', 'PENDING_GRADE'].indexOf(value) !== -1) {
            cls = 'warning text-dark';
        } else if (value === 'NOT_RATED' || value === 'NOT_ATTEMPTED') {
            cls = 'secondary';
        }
        var label = kind ? kind + ': ' + stateText(value) : stateText(value);
        return '<span class="badge bg-' + cls + '">' + escapeHtml(label) + '</span>';
    };

    var get = function(config, params) {
        var url = config.endpoint + '?' + new URLSearchParams(params).toString();
        return fetch(url, {credentials: 'same-origin'}).then(function(response) {
            return response.json().then(function(body) {
                return {response: response, body: body};
            });
        });
    };

    var post = function(config, params) {
        return fetch(config.endpoint, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'},
            body: new URLSearchParams(params).toString()
        }).then(function(response) {
            return response.json().then(function(body) {
                return {response: response, body: body};
            });
        });
    };

    var renderStudentInsight = function(insight) {
        insight = insight || {};
        var payload = insight.payload || {};
        var status = insight.status || 'FALLBACK';
        var cls = status === 'VALID' ? 'success' : status === 'REPAIRED' ? 'info' : status === 'BLOCKED' ? 'secondary' : 'warning text-dark';
        $('#agentpoc-student-insight-status').attr('class', 'badge bg-' + cls + ' mb-2').text(statusText(status) + (insight.cached ? ' · จากแคช' : ''));
        var findings = (payload.findings || []).map(function(item) { return '<li>' + escapeHtml(item.text || '') + '</li>'; }).join('');
        var actions = (payload.actions || []).map(function(action) { return '<div class="border-top py-2"><strong>' + escapeHtml((action.priority_band || '') + ' · ' + actionText(action.action_code || '')) + '</strong><div class="text-muted">' + escapeHtml(action.rationale || '') + '</div></div>'; }).join('');
        var stale = status === 'STALE' ? '<div class="alert alert-warning py-2">ข้อมูลเชิงลึกนี้เป็นของสแนปช็อตย้อนหลังที่บริบท Risk เชิงกำหนดมีการเปลี่ยนแปลงภายหลัง ระบบจะไม่สร้างใหม่โดยอัตโนมัติ</div>' : '';
        $('#agentpoc-student-insight').removeClass('text-muted').html('<p>' + escapeHtml(payload.summary || 'ยังไม่มีคำอธิบายจาก AI') + '</p>' + stale + (findings ? '<ul>' + findings + '</ul>' : '') + actions);
    };

    var loadStudentInsight = function(config, forceGenerate) {
        var params = {
            action: forceGenerate ? 'student_insight_regenerate' : 'student_insight',
            course_id: config.courseId,
            student_id: config.studentId,
            snapshot_id: config.snapshotId
        };
        if (forceGenerate) {
            params.sesskey = config.sesskey;
            return post(config, params);
        }
        return get(config, params);
    };

    var table = function(headers, rows, emptyText) {
        if (!rows.length) {
            return '<div class="text-muted py-2">' + escapeHtml(emptyText) + '</div>';
        }
        return '<div class="table-responsive"><table class="table table-sm table-hover align-middle agentpoc-risk-table"><thead><tr>' +
            headers.map(function(h) { return '<th>' + escapeHtml(h) + '</th>'; }).join('') +
            '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
    };

    return {
        init: function(config) {
            var $loading = $('#agentpoc-student-risk-loading');
            var $content = $('#agentpoc-student-risk-content');
            var $alert = $('#agentpoc-student-risk-alert');

            var fail = function(message) {
                $loading.addClass('d-none');
                $content.addClass('d-none');
                $alert.removeClass('d-none').addClass('alert-danger').text(message);
            };

            get(config, {
                action: 'student',
                course_id: config.courseId,
                student_id: config.studentId,
                snapshot_id: config.snapshotId
            }).then(function(result) {
                if (!result.response.ok || !result.body.success) {
                    var error = result.body.error || {};
                    throw new Error(error.message || 'ไม่สามารถโหลดรายละเอียดความเสี่ยงของนักเรียนได้');
                }

                var data = result.body.data;
                var student = data.student || {};
                var meta = data.metadata || {};
                var journey = data.evidence_journey || {};
                var trend = data.trend || {};
                var evidence = journey.evidence || [];
                var evidenceById = {};
                evidence.forEach(function(item) { evidenceById[item.evidence_id] = item; });

                $('#agentpoc-student-risk-level').html(riskBadge(student.overall_risk));
                $('#agentpoc-student-risk-snapshot').text('สแนปช็อต ' + String(meta.snapshot_id || config.snapshotId).slice(0, 8) +
                    ' · ข้อมูล ณ ' + dateText(meta.data_as_of) + ' · ' + (meta.risk_model_version || '—'));

                if (meta.is_current === false) {
                    $('#agentpoc-student-historical-note').removeClass('d-none').html(
                        '<strong>สแนปช็อตย้อนหลัง</strong> มีสแนปช็อตความเสี่ยงที่ใหม่กว่าแล้ว ค่าหลักฐานด้านล่างยังคงตรึงตามสแนปช็อตนี้ ส่วนลิงก์ “เปิดข้อมูลปัจจุบันใน Moodle” อาจแสดงสถานะที่ใหม่กว่า'
                    );
                }

                var drivers = (student.main_drivers || []).map(dimensionText).join(', ') || 'ไม่มี';
                if (student.overall_risk === 'LOW') {
                    $('#agentpoc-student-summary').html(
                        '<p class="mb-1"><strong>สรุปความเสี่ยงต่ำ:</strong> ไม่มีกฎความเสี่ยงเชิงกำหนดที่มีนัยสำคัญสูงกว่าระดับต่ำในสแนปช็อตนี้</p>' +
                        '<div class="small text-muted">ปัจจัยหลัก: ' + escapeHtml(drivers) + ' ติดตามตามปกติ โดยระดับต่ำไม่จำเป็นต้องเรียก AI เพื่อสร้างคำอธิบายเพิ่มเติม</div>'
                    );
                } else {
                    $('#agentpoc-student-summary').html(
                        '<p class="mb-1"><strong>ความเสี่ยงเชิงกำหนดปัจจุบัน:</strong> ' + escapeHtml(riskText(student.overall_risk || 'INCOMPLETE')) + '</p>' +
                        '<div class="small text-muted mb-2">ปัจจัยหลัก: ' + escapeHtml(drivers) + ' โดยหลักฐานและร่องรอยกฎเชิงกำหนดยังคงเป็นข้อมูลหลัก</div>' +
                        '<div id="agentpoc-student-insight-status" class="badge bg-light text-dark border mb-2">กำลังโหลดข้อมูลเชิงลึก</div>' +
                        '<div id="agentpoc-student-insight" class="small text-muted">กำลังเตรียมข้อมูลเชิงลึกที่ผ่านการตรวจสอบ…</div>'
                    );
                    loadStudentInsight(config, false).then(function(insightResult) {
                        if (!insightResult.response.ok || !insightResult.body.success) {
                            var insightError = insightResult.body.error || {};
                            throw new Error(insightError.message || 'ไม่สามารถโหลดข้อมูลเชิงลึกของนักเรียนได้');
                        }
                        renderStudentInsight(insightResult.body.data && insightResult.body.data.insight || {});
                    }).catch(function(insightError) {
                        $('#agentpoc-student-insight-status').attr('class', 'badge bg-warning text-dark mb-2').text('ใช้ข้อมูลเชิงกำหนด');
                        $('#agentpoc-student-insight').removeClass('text-muted').text(insightError.message + ' ผลความเสี่ยงและหลักฐานเชิงกำหนดยังคงใช้งานได้');
                    });
                }

                if (config.showAiTestTools) {
                    $('#agentpoc-student-regenerate-ai').off('click').on('click', function() {
                        var $button = $(this).prop('disabled', true);
                        $alert.addClass('d-none').removeClass('alert-danger alert-warning alert-info alert-success').text('');
                        if ($('#agentpoc-student-insight-status').length) {
                            $('#agentpoc-student-insight-status').attr('class', 'badge bg-info text-dark mb-2').text('กำลังสร้างใหม่');
                            $('#agentpoc-student-insight').addClass('text-muted').text('กำลังบังคับสร้าง AI Summary ใหม่โดยไม่ใช้แคช…');
                        }
                        loadStudentInsight(config, true).then(function(insightResult) {
                            if (!insightResult.response.ok || !insightResult.body.success) {
                                var insightError = insightResult.body.error || {};
                                throw new Error(insightError.message || 'ไม่สามารถสร้าง AI Summary ใหม่ได้');
                            }
                            var insight = insightResult.body.data && insightResult.body.data.insight || {};
                            if ($('#agentpoc-student-insight-status').length) {
                                renderStudentInsight(insight);
                            }
                            var calls = insight.model_calls !== undefined ? insight.model_calls : '—';
                            $alert.removeClass('d-none alert-danger alert-warning alert-info').addClass('alert-success')
                                .text('สร้าง AI Summary ใหม่แล้ว · Model calls: ' + calls + (calls === 0 ? ' (Policy ของ Risk ไม่อนุญาตให้เรียก AI สำหรับสถานะนี้)' : ''));
                        }).catch(function(error) {
                            $alert.removeClass('d-none alert-danger alert-info alert-success').addClass('alert-warning')
                                .text(error.message + ' ผล Risk และหลักฐานเชิงกำหนดยังคงใช้งานได้ตามปกติ');
                        }).finally(function() {
                            $button.prop('disabled', false);
                        });
                    });
                }

                var trendDims = trend.dimensions || {};
                $('#agentpoc-student-trend').html(
                    '<div class="d-flex align-items-center justify-content-between mb-2"><span>ภาพรวม</span><strong>' + escapeHtml(trendText(trend.overall || 'INSUFFICIENT_HISTORY')) + '</strong></div>' +
                    ['progress', 'performance', 'competency', 'submission'].map(function(d) {
                        return '<div class="small d-flex justify-content-between"><span class="text-capitalize">' + escapeHtml(dimensionText(d)) + '</span><span>' + escapeHtml(trendText(trendDims[d] || '—')) + '</span></div>';
                    }).join('') +
                    '<div class="small text-muted mt-2">จุดข้อมูลล่าสุด ' + escapeHtml(trend.recent_window_points || 0) +
                    ' · จุดข้อมูลประกอบ ' + escapeHtml(trend.context_window_points || 0) +
                    ' · โมเดล ' + escapeHtml(trend.risk_model_version || '—') + '</div>'
                );

                var dimensions = data.dimensions || {};
                $('#agentpoc-student-dimensions').html(['progress', 'performance', 'competency', 'submission'].map(function(name) {
                    var d = dimensions[name] || {};
                    var metrics = d.metrics || {};
                    var metricHtml = Object.keys(metrics).map(function(key) {
                        var value = metrics[key];
                        return '<div class="small d-flex justify-content-between gap-2"><span class="text-muted">' + escapeHtml(metricText(key)) + '</span><span>' + escapeHtml(value === null ? '—' : value) + '</span></div>';
                    }).join('');
                    return '<div class="col-12 col-md-6 col-xl-3"><div class="card h-100"><div class="card-body">' +
                        '<div class="d-flex justify-content-between align-items-center mb-2"><strong class="text-capitalize">' + escapeHtml(dimensionText(name)) + '</strong>' + riskBadge(d.risk_level) + '</div>' +
                        metricHtml + '<div class="small text-muted mt-2">กฎที่เข้าเงื่อนไข ' + escapeHtml((d.rule_hits || []).length) + '</div></div></div></div>';
                }).join(''));

                var progress = journey.progress || {};
                $('#agentpoc-student-progress').html(
                    '<div class="row g-3">' +
                    '<div class="col-6 col-md-3"><div class="text-muted small">ที่คาดหวัง</div><div class="h5">' + pct(progress.expected_progress) + '</div><div class="small">' + escapeHtml(progress.expected_count || 0) + ' กิจกรรม</div></div>' +
                    '<div class="col-6 col-md-3"><div class="text-muted small">ทำได้จริง</div><div class="h5">' + pct(progress.actual_progress) + '</div><div class="small">' + escapeHtml(progress.completed_expected_count || 0) + ' กิจกรรมที่ควรทำและทำเสร็จ</div></div>' +
                    '<div class="col-6 col-md-3"><div class="text-muted small">ช่องว่าง</div><div class="h5">' + escapeHtml(progress.progress_gap_pp === undefined ? '—' : progress.progress_gap_pp) + ' จุดเปอร์เซ็นต์</div></div>' +
                    '<div class="col-6 col-md-3"><div class="text-muted small">การทำตามกรอบเวลา</div><div class="h5">' + pct(progress.timeline_compliance) + '</div></div>' +
                    '</div>'
                );

                var currentLink = function(evidenceId) {
                    var item = evidenceById[evidenceId];
                    var nav = item && item.current_source_navigation;
                    if (!nav || !nav.url) {
                        return '—';
                    }
                    return '<a href="' + escapeHtml(nav.url) + '" target="_blank" rel="noopener">เปิดข้อมูลปัจจุบันใน Moodle</a>';
                };

                var assessments = journey.assessments || [];
                $('#agentpoc-student-assessments').html(table(
                    ['กิจกรรม', 'ประเภท', 'สถานะทางการเรียน', 'สัญญาณผลการเรียน', 'คะแนน', 'เกณฑ์ผ่าน', 'สัดส่วนคะแนน', 'แหล่งข้อมูลปัจจุบัน'],
                    assessments.map(function(item) {
                        var grade = item.final_grade === null ? '—' : item.final_grade + (item.grade_max !== null ? ' / ' + item.grade_max : '');
                        var pass = item.grade_to_pass === null ? 'ไม่ได้กำหนดเกณฑ์ผ่าน' : item.grade_to_pass;
                        return '<tr><td>#' + escapeHtml(item.activity_id) + '</td><td>' + escapeHtml(typeText(item.activity_type)) + '</td><td>' + stateBadge(item.academic_status) +
                            '</td><td>' + stateBadge(item.performance_signal) + '</td><td>' + escapeHtml(grade) + '</td><td>' + escapeHtml(pass) + '</td><td>' +
                            escapeHtml(item.score_ratio === null ? '—' : pct(item.score_ratio)) + '</td><td>' + currentLink(item.evidence_id) + '</td></tr>';
                    }),
                    'ไม่มีหลักฐานการประเมินในสแนปช็อตนี้'
                ));

                var competencies = journey.competencies || [];
                $('#agentpoc-student-competencies').html(table(
                    ['สมรรถนะ', 'สถานะ', 'รอการทบทวน', 'กิจกรรมที่เกี่ยวข้อง', 'แหล่งข้อมูลปัจจุบัน'],
                    competencies.map(function(item) {
                        var review = item.review_pending ? stateBadge('REVIEW_PENDING') : '<span class="text-muted">ไม่</span>';
                        return '<tr><td>#' + escapeHtml(item.competency_id) + '</td><td>' + stateBadge(item.state) + '</td><td>' + review + '</td><td>' +
                            escapeHtml((item.related_activity_ids || []).join(', ') || '—') + '</td><td>' + currentLink(item.evidence_id) + '</td></tr>';
                    }),
                    'ไม่มีหลักฐานสมรรถนะในสแนปช็อตนี้'
                ));

                var submissions = journey.submissions || [];
                $('#agentpoc-student-submissions').html(table(
                    ['กิจกรรม', 'ประเภท', 'สถานะ', 'กำหนดส่ง', 'ส่งเมื่อ', 'การชดเชย', 'แหล่งข้อมูลปัจจุบัน'],
                    submissions.map(function(item) {
                        return '<tr><td>#' + escapeHtml(item.activity_id) + '</td><td>' + escapeHtml(typeText(item.activity_type)) + '</td><td>' + stateBadge(item.state) + '</td><td>' +
                            escapeHtml(dateText(item.due_at)) + '</td><td>' + escapeHtml(dateText(item.submitted_at)) + '</td><td>' +
                            (item.recovery_not_available ? '<span class="badge bg-warning text-dark">ไม่สามารถทำชดเชยได้</span>' : '<span class="text-muted">—</span>') +
                            '</td><td>' + currentLink(item.evidence_id) + '</td></tr>';
                    }),
                    'ไม่มีหลักฐานการส่งงานในสแนปช็อตนี้'
                ));

                var rules = data.rule_hits || [];
                $('#agentpoc-student-rule-trace').html(rules.length ? rules.map(function(rule) {
                    var refs = (rule.evidence_refs || []).map(function(ref) {
                        var item = evidenceById[ref];
                        var nav = item && item.current_source_navigation;
                        var label = escapeHtml(ref);
                        return nav && nav.url ? '<a class="badge bg-light text-dark border text-decoration-none me-1" href="' + escapeHtml(nav.url) + '" target="_blank" rel="noopener">' + label + '</a>' :
                            '<span class="badge bg-light text-dark border me-1">' + label + '</span>';
                    }).join('');
                    return '<div class="border-top py-3 agentpoc-risk-item"><div class="d-flex flex-wrap gap-2 align-items-center mb-1">' +
                        '<strong>' + escapeHtml(ruleText(rule.rule_id)) + '</strong>' + riskBadge(rule.resulting_level) + '<span class="badge bg-light text-dark border">' + escapeHtml(dimensionText(rule.dimension)) + '</span></div>' +
                        '<div>' + escapeHtml(ruleText(rule.rule_id)) + '</div><div class="small mt-2"><span class="text-muted me-1">หลักฐาน:</span>' + (refs || '—') + '</div></div>';
                }).join('') : '<div class="text-muted py-2">ไม่มีกฎความเสี่ยงที่มีนัยสำคัญสูงกว่าเกณฑ์พื้นฐานในสแนปช็อตนี้</div>');

                $('#agentpoc-student-evidence').html(table(
                    ['หลักฐาน', 'ประเภท', 'สถานะที่พบ', 'ค่าที่พบ', 'พบเมื่อ', 'แหล่งข้อมูล'],
                    evidence.map(function(item) {
                        var nav = item.current_source_navigation || {};
                        var source = nav.url ? '<a href="' + escapeHtml(nav.url) + '" target="_blank" rel="noopener">เปิดข้อมูลปัจจุบันใน Moodle</a>' : '—';
                        return '<tr id="evidence-' + escapeHtml(item.evidence_id) + '"><td><code>' + escapeHtml(item.evidence_id) + '</code></td><td>' + escapeHtml(evidenceKindText(item.kind)) +
                            '</td><td>' + escapeHtml(stateText(item.observed_state)) + '</td><td>' + escapeHtml(item.observed_value === null ? '—' : item.observed_value) + '</td><td>' +
                            escapeHtml(dateText(item.observed_at)) + '</td><td>' + source + '</td></tr>';
                    }),
                    'ไม่มีรายการหลักฐานมาตรฐานในสแนปช็อตนี้'
                ));

                $loading.addClass('d-none');
                $content.removeClass('d-none');
            }).catch(function(error) {
                fail(error.message + ' กรุณากลับไปที่แดชบอร์ดรายวิชาแล้วลองใหม่');
            });
        }
    };
});
