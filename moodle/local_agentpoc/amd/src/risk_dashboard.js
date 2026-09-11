/**
 * AI Learning Insight Course dashboard.
 *
 * @module     local_agentpoc/risk_dashboard
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define(['jquery'], function($) {
    'use strict';

    var escapeHtml = function(value) {
        return $('<div>').text(value === null || value === undefined ? '' : String(value)).html();
    };

    var riskText = function(value) { return ({HIGH: 'สูง', MEDIUM: 'ปานกลาง', LOW: 'ต่ำ', INCOMPLETE: 'ข้อมูลไม่สมบูรณ์'})[value] || value || 'ข้อมูลไม่สมบูรณ์'; };
    var dimensionText = function(value) { return ({progress: 'ความก้าวหน้า', performance: 'ผลการเรียน', competency: 'สมรรถนะ', submission: 'การส่งงาน'})[value] || value; };
    var statusText = function(value) { return ({VALID: 'พร้อมใช้งาน', REPAIRED: 'แก้ไขแล้ว', FALLBACK: 'ใช้ข้อมูลเชิงกำหนด', BLOCKED: 'ไม่ใช้ AI', STALE: 'ข้อมูล AI เก่า'})[value] || value; };
    var issueText = function(value) { return ({SUBMISSION_PROBLEM: 'ปัญหาการส่งงาน', LATE_PATTERN: 'รูปแบบการส่งล่าช้า', PERFORMANCE_PROBLEM: 'ปัญหาผลการเรียน', PERFORMANCE_CONCERN: 'ข้อควรติดตามด้านผลการเรียน'})[value] || value; };
    var actionText = function(value) { return ({REVIEW_PROBLEMATIC_ACTIVITY: 'ทบทวนกิจกรรมที่มีปัญหา', REVIEW_AT_RISK_STUDENTS: 'ทบทวนนักเรียนที่มีความเสี่ยง', REVIEW_COMMON_COMPETENCY_GAP: 'ทบทวนช่องว่างสมรรถนะร่วม', REVIEW_SUBMISSION_PATTERN: 'ทบทวนรูปแบบการส่งงาน', CONSIDER_REMEDIAL_SESSION: 'พิจารณาจัดกิจกรรมเสริมความเข้าใจ', CONSIDER_ADDITIONAL_PRACTICE: 'พิจารณาเพิ่มแบบฝึกหัด', MONITOR_COURSE_TREND: 'ติดตามแนวโน้มของรายวิชา'})[value] || value; };

    var pct = function(value) {
        return value === null || value === undefined ? '—' : Math.round(Number(value) * 100) + '%';
    };

    var riskBadge = function(level) {
        var cls = !level ? 'incomplete' : level === 'HIGH' ? 'high' : level === 'MEDIUM' ? 'medium' : 'low';
        return '<span class="agentpoc-risk-pill ' + cls + '">' + escapeHtml(riskText(level)) + '</span>';
    };

    var distributionText = function(dist) {
        dist = dist || {};
        return 'สูง ' + (dist.HIGH || 0) + ' · ปานกลาง ' + (dist.MEDIUM || 0) + ' · ต่ำ ' + (dist.LOW || 0);
    };

    var distributionBar = function(dist) {
        dist = dist || {};
        var high = Number(dist.HIGH || 0);
        var medium = Number(dist.MEDIUM || 0);
        var low = Number(dist.LOW || 0);
        var total = high + medium + low;
        var width = function(value) { return total > 0 ? ((value / total) * 100).toFixed(2) : '0'; };
        return '<div class="agentpoc-risk-segmented-bar" aria-label="' + escapeHtml(distributionText(dist)) + '">' +
            '<span class="agentpoc-risk-segment-high" style="width:' + width(high) + '%"></span>' +
            '<span class="agentpoc-risk-segment-medium" style="width:' + width(medium) + '%"></span>' +
            '<span class="agentpoc-risk-segment-low" style="width:' + width(low) + '%"></span></div>' +
            '<div class="agentpoc-risk-legend">' +
            '<div class="agentpoc-risk-legend-item"><span class="agentpoc-risk-dot high"></span>สูง<strong>' + high + '</strong></div>' +
            '<div class="agentpoc-risk-legend-item"><span class="agentpoc-risk-dot medium"></span>ปานกลาง<strong>' + medium + '</strong></div>' +
            '<div class="agentpoc-risk-legend-item"><span class="agentpoc-risk-dot low"></span>ต่ำ<strong>' + low + '</strong></div></div>';
    };

    var studentInitials = function(name) {
        var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) { return 'ST'; }
        return parts.slice(0, 2).map(function(part) { return part.charAt(0); }).join('').toUpperCase();
    };

    var dimensionIcon = function(name) {
        return ({progress: 'fa-tasks', performance: 'fa-bar-chart', competency: 'fa-bullseye', submission: 'fa-clock-o'})[name] || 'fa-circle-o';
    };

    var metricText = function(metric) {
        if (!metric) {
            return 'ไม่มีข้อมูล';
        }
        var count = metric.numerator !== undefined ? metric.numerator : (metric.count !== undefined ? metric.count : '—');
        var denominator = metric.denominator !== undefined ? metric.denominator : '—';
        var rate = metric.rate === null || metric.rate === undefined ? '—' : pct(metric.rate);
        return escapeHtml(count + '/' + denominator + ' (' + rate + ')');
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

    var get = function(config, params) {
        var url = config.endpoint + '?' + new URLSearchParams(params).toString();
        return fetch(url, {credentials: 'same-origin'}).then(function(response) {
            return response.json().then(function(body) {
                return {response: response, body: body};
            });
        });
    };

    return {
        init: function(config) {
            var state = {
                snapshotId: config.snapshotId || '',
                data: null,
                view: config.initialView === 'students' ? 'students' : 'overview'
            };

            var $loading = $('#agentpoc-risk-loading');
            var $overview = $('#agentpoc-risk-overview');
            var $students = $('#agentpoc-risk-students');
            var $alert = $('#agentpoc-risk-alert');

            var showAlert = function(message, type) {
                $alert.removeClass('d-none alert-danger alert-warning alert-info alert-success')
                    .addClass('alert-' + (type || 'danger'))
                    .text(message);
            };

            var clearAlert = function() {
                $alert.addClass('d-none').text('');
            };

            var setView = function(view) {
                state.view = view === 'students' ? 'students' : 'overview';
                $('#agentpoc-risk-tabs .nav-link').removeClass('active');
                $('#agentpoc-risk-tab-' + state.view).addClass('active');
                $overview.toggleClass('d-none', state.view !== 'overview');
                $students.toggleClass('d-none', state.view !== 'students');
                var url = new URL(window.location.href);
                url.searchParams.set('view', state.view);
                if (state.snapshotId) {
                    url.searchParams.set('snapshot_id', state.snapshotId);
                }
                window.history.replaceState({}, '', url.toString());
            };

            var studentHref = function(studentId) {
                var url = new URL(config.studentDetailUrl, window.location.origin);
                url.searchParams.set('courseid', config.courseId);
                url.searchParams.set('studentid', studentId);
                url.searchParams.set('snapshotid', state.snapshotId);
                return url.toString();
            };

            var renderStudentTable = function(rows, target, emptyText) {
                if (!rows || rows.length === 0) {
                    $(target).html('<div class="text-muted py-4 px-3 text-center">' + escapeHtml(emptyText || 'ไม่มีนักเรียนในมุมมองนี้') + '</div>');
                    return;
                }
                var body = rows.map(function(row) {
                    var identity = row.identity || {};
                    var name = identity.display_name || ('นักเรียน ' + row.student_id);
                    var drivers = (row.main_drivers || []).map(function(driver) {
                        return '<span class="agentpoc-risk-driver-chip">' + escapeHtml(dimensionText(driver)) + '</span>';
                    }).join('') || '<span class="text-muted">—</span>';
                    return '<tr data-student-name="' + escapeHtml(name.toLowerCase()) + '">' +
                        '<td><div class="agentpoc-risk-student-cell"><span class="agentpoc-risk-avatar">' + escapeHtml(studentInitials(name)) + '</span><div><a class="agentpoc-risk-student-name" href="' + escapeHtml(studentHref(row.student_id)) + '">' + escapeHtml(name) + '</a><div class="small text-muted">ID ' + escapeHtml(row.student_id) + '</div></div></div></td>' +
                        '<td>' + riskBadge(row.overall_risk) + '</td>' +
                        '<td>' + drivers + '</td>' +
                        '<td class="text-nowrap">' + riskBadge(row.dimensions && row.dimensions.progress) + '</td>' +
                        '<td class="text-nowrap">' + riskBadge(row.dimensions && row.dimensions.performance) + '</td>' +
                        '<td class="text-nowrap">' + riskBadge(row.dimensions && row.dimensions.competency) + '</td>' +
                        '<td class="text-nowrap">' + riskBadge(row.dimensions && row.dimensions.submission) + '</td>' +
                        '<td><a class="agentpoc-risk-detail-link" href="' + escapeHtml(studentHref(row.student_id)) + '">ดูรายละเอียด <i class="fa fa-angle-right"></i></a></td>' +
                        '</tr>';
                }).join('');
                $(target).html('<div class="table-responsive"><table class="table table-hover align-middle agentpoc-risk-table mb-0"><thead><tr>' +
                    '<th>นักเรียน</th><th>ความเสี่ยงรวม</th><th>ปัจจัยหลัก</th><th>ความก้าวหน้า</th><th>ผลการเรียน</th><th>สมรรถนะ</th><th>การส่งงาน</th><th></th>' +
                    '</tr></thead><tbody>' + body + '</tbody></table></div>');
            };

            var renderOverview = function(data) {
                var meta = data.metadata || {};
                var o = data.overview || {};
                state.snapshotId = meta.snapshot_id || state.snapshotId;
                $('#agentpoc-risk-snapshot').text(state.snapshotId ? 'สแนปช็อต ' + state.snapshotId.slice(0, 8) : 'ยังไม่มีสแนปช็อต');
                $('#agentpoc-risk-freshness').text('ข้อมูล ณ ' + (meta.data_as_of ? new Date(meta.data_as_of * 1000).toLocaleString('th-TH') : '—') +
                    ' · โมเดล ' + (meta.risk_model_version || '—'));
                $('#agentpoc-risk-coverage-label').text('ความครอบคลุมการประเมิน ' + pct(o.evaluation_coverage));

                if (Number(o.enrolled_count || 0) === 0) {
                    showAlert('รายวิชานี้ยังไม่มีนักเรียนที่ลงทะเบียนและมีสถานะใช้งาน จึงยังไม่มีข้อมูลสำหรับประเมินความเสี่ยง ข้อมูลรายวิชาใน Moodle ยังปลอดภัย เมื่อลงทะเบียนนักเรียนแล้วให้กดรีเฟรชอีกครั้ง', 'info');
                }

                var statCards = [
                    ['fa-users', 'ลงทะเบียน', o.enrolled_count || 0, 'นักเรียนในขอบเขตการประเมิน'],
                    ['fa-check-circle-o', 'ประเมินแล้ว', o.evaluated_count || 0, 'ความครอบคลุม ' + pct(o.evaluation_coverage)],
                    ['fa-exclamation-circle', 'ข้อมูลไม่สมบูรณ์', o.incomplete_count || 0, 'ไม่นำไปรวมในการกระจายความเสี่ยง']
                ].map(function(item) {
                    return '<div class="col-12 col-md-4"><div class="agentpoc-risk-stat-card h-100">' +
                        '<div class="agentpoc-risk-stat-top"><div class="agentpoc-risk-stat-label">' + escapeHtml(item[1]) + '</div><span class="agentpoc-risk-stat-icon"><i class="fa ' + item[0] + '"></i></span></div>' +
                        '<div><div class="agentpoc-risk-stat-value">' + escapeHtml(item[2]) + '</div><div class="agentpoc-risk-stat-foot">' + escapeHtml(item[3]) + '</div></div></div></div>';
                }).join('');
                var distribution = o.student_risk_distribution || {};
                var distributionCard = '<div class="col-12"><div class="agentpoc-risk-stat-card agentpoc-risk-distribution-card">' +
                    '<div class="agentpoc-risk-distribution-head"><div><div class="agentpoc-risk-stat-label">การกระจายความเสี่ยงของผู้เรียน</div><div class="small text-muted mt-1">เฉพาะนักเรียนที่ประเมินได้ — ไม่ใช่ระดับความเสี่ยงรวมของรายวิชา</div></div>' +
                    '<div class="agentpoc-risk-distribution-total">ประเมินแล้ว ' + escapeHtml(o.evaluated_count || 0) + ' คน</div></div>' + distributionBar(distribution) + '</div></div>';
                $('#agentpoc-risk-overview-cards').html(statCards + distributionCard);

                var dimensions = o.dimension_distributions || {};
                $('#agentpoc-risk-dimensions').html(['progress', 'performance', 'competency', 'submission'].map(function(name) {
                    var dist = dimensions[name] || {};
                    return '<div class="col-12 col-sm-6 col-xl-3"><div class="agentpoc-risk-dimension-card h-100">' +
                        '<div class="agentpoc-risk-dimension-head"><div class="agentpoc-risk-dimension-name"><span class="agentpoc-risk-dimension-icon"><i class="fa ' + dimensionIcon(name) + '"></i></span>' + escapeHtml(dimensionText(name)) + '</div><div class="agentpoc-risk-denominator">ตัวหาร ' + escapeHtml(dist.denominator || 0) + '</div></div>' +
                        distributionBar(dist) + '</div></div>';
                }).join(''));

                var needs = data.what_needs_attention || {};
                var activities = needs.activity_issues || [];
                $('#agentpoc-risk-activities').html(activities.length ? activities.map(function(issue) {
                    var label = issue.activity && issue.activity.name ? issue.activity.name : ('กิจกรรม ' + issue.activity_id);
                    var metrics = issue.affected || issue.metric || issue.impact || issue.metrics || null;
                    return '<div class="agentpoc-risk-item border-top py-2"><div class="d-flex justify-content-between gap-2">' +
                        '<strong>' + escapeHtml(label) + '</strong><span class="badge bg-light text-dark border">' + escapeHtml(issueText(issue.issue_type)) + '</span></div>' +
                        '<div class="small text-muted mt-1">ได้รับผลกระทบ ' + metricText(metrics) + '</div></div>';
                }).join('') : '<div class="text-muted py-2">ไม่พบกิจกรรมที่มีปัญหาตามเกณฑ์เชิงกำหนดในปัจจุบัน</div>');

                var gaps = needs.common_competency_gaps || [];
                $('#agentpoc-risk-gaps').html(gaps.length ? gaps.map(function(gap) {
                    var label = gap.competency && (gap.competency.shortname || gap.competency.idnumber) ?
                        (gap.competency.shortname || gap.competency.idnumber) : ('สมรรถนะ ' + gap.competency_id);
                    return '<div class="agentpoc-risk-item border-top py-2"><strong>' + escapeHtml(label) + '</strong>' +
                        '<div class="small text-muted">ช่องว่างที่ยืนยันแล้ว ' + metricText(gap.confirmed_gap || gap.metric || gap.gap_metric || gap) + '</div></div>';
                }).join('') : '<div class="text-muted py-2">ไม่พบช่องว่างสมรรถนะร่วมที่ถึงเกณฑ์ในปัจจุบัน</div>');

                var associations = needs.notable_associations || [];
                $('#agentpoc-risk-associations').html(associations.length ? associations.map(function(item) {
                    return '<div class="agentpoc-risk-item border-top py-2"><strong>กิจกรรมที่เกี่ยวข้อง ' + escapeHtml(item.activity_id) +
                        ' ↔ สมรรถนะ ' + escapeHtml(item.competency_id) + '</strong>' +
                        '<div class="small text-muted">นักเรียนที่ซ้อนทับกัน ' + escapeHtml(item.overlap_count || 0) + ' คน เป็นเพียงหลักฐานที่เกี่ยวข้อง ไม่ได้ยืนยันความสัมพันธ์เชิงเหตุและผล</div></div>';
                }).join('') : '<div class="text-muted py-2">ไม่พบความสัมพันธ์เชิงกำหนดที่มีนัยสำคัญ</div>');

                var actions = needs.action_candidates || [];
                $('#agentpoc-risk-actions').html(actions.length ? actions.map(function(item) {
                    return '<div class="agentpoc-risk-item border-top py-2"><strong>' + escapeHtml((item.priority_band ? item.priority_band + ' · ' : '') + actionText(item.action_code || item.code || 'Review')) + '</strong>' +
                        '<div class="small text-muted">' + escapeHtml(item.reason || item.description || 'ข้อเสนอให้ครูทบทวนจากกฎเชิงกำหนด') + '</div></div>';
                }).join('') : '<div class="text-muted py-2">ไม่มีข้อเสนอการดำเนินการสำหรับสแนปช็อตนี้</div>');

                renderStudentTable((data.students && data.students.attention) || [], '#agentpoc-risk-attention-students', 'ไม่มีนักเรียนความเสี่ยงสูงหรือปานกลางในสแนปช็อตนี้');
                renderStudentTable((data.students && data.students.all) || [], '#agentpoc-risk-students-table', 'ไม่มีนักเรียนในสแนปช็อตนี้');
            };

            var renderCourseInsight = function(insight) {
                insight = insight || {};
                var payload = insight.payload || {};
                var status = insight.status || 'FALLBACK';
                var cls = status === 'VALID' ? 'success' : status === 'REPAIRED' ? 'info' : status === 'BLOCKED' ? 'secondary' : 'warning text-dark';
                $('#agentpoc-risk-course-insight-status').attr('class', 'badge bg-' + cls).text(statusText(status) + (insight.cached ? ' · จากแคช' : ''));
                var findings = (payload.findings || []).map(function(item) { return '<li>' + escapeHtml(item.text || '') + '</li>'; }).join('');
                var actionItems = (payload.actions || []).map(function(action) {
                    return '<div class="agentpoc-risk-insight-action"><span class="agentpoc-risk-priority-chip">' + escapeHtml(action.priority_band || '—') + '</span><div><strong>' + escapeHtml(actionText(action.action_code || '')) + '</strong><div class="small text-muted">' + escapeHtml(action.rationale || 'ข้อเสนอการดำเนินการตามเกณฑ์เชิงกำหนด') + '</div></div></div>';
                }).join('');
                var qualification = payload.coverage_qualification ? '<div class="alert alert-info py-2 mt-2 mb-2">' + escapeHtml(payload.coverage_qualification) + '</div>' : '';
                var stale = status === 'STALE' ? '<div class="alert alert-warning py-2 mt-2 mb-2">ข้อมูลเชิงลึกนี้เป็นของสแนปช็อตที่บริบทความเสี่ยงเชิงกำหนดมีการเปลี่ยนแปลงภายหลัง จึงแสดงเป็นข้อมูลเก่าและจะไม่สร้างใหม่อัตโนมัติ</div>' : '';
                var narrative = '<div class="agentpoc-risk-insight-narrative"><div class="agentpoc-risk-insight-label">สรุปภาพรวม</div><p class="mb-2">' + escapeHtml(payload.summary || 'ยังไม่มีคำอธิบายจาก AI โดยผลความเสี่ยงเชิงกำหนดยังคงเป็นข้อมูลหลัก') + '</p>' + qualification + stale + (findings ? '<ul class="mb-0">' + findings + '</ul>' : '') + '</div>';
                var actionPanel = '<div><div class="agentpoc-risk-insight-label">ข้อเสนอการดำเนินการ</div>' + (actionItems ? '<div class="agentpoc-risk-insight-actions-grid">' + actionItems + '</div>' : '<div class="text-muted small">ยังไม่มีข้อเสนอการดำเนินการสำหรับสแนปช็อตนี้</div>') + '</div>';
                $('#agentpoc-risk-course-insight').removeClass('text-muted').html('<div class="agentpoc-risk-insight-layout">' + narrative + actionPanel + '</div>');
            };

            var loadCourseInsight = function() {
                if (!state.snapshotId) { return Promise.resolve(); }
                if (state.data && state.data.overview && Number(state.data.overview.enrolled_count || 0) === 0) {
                    $('#agentpoc-risk-course-insight-status').attr('class', 'badge bg-secondary').text('ยังไม่ใช้ AI');
                    $('#agentpoc-risk-course-insight').removeClass('text-muted').html('<p class="mb-0">ระบบยังไม่สร้างข้อมูลเชิงลึกจาก AI เนื่องจากรายวิชานี้ยังไม่มีนักเรียนที่มีสถานะใช้งาน กรุณาลงทะเบียนนักเรียนและรีเฟรชข้อมูลความเสี่ยงก่อน</p>');
                    return Promise.resolve();
                }
                $('#agentpoc-risk-course-insight-status').attr('class', 'badge bg-light text-dark border').text('กำลังโหลด');
                $('#agentpoc-risk-course-insight').addClass('text-muted').text('กำลังเตรียมข้อมูลเชิงลึกที่ผ่านการตรวจสอบ…');
                return get(config, {action: 'course_insight', course_id: config.courseId, snapshot_id: state.snapshotId}).then(function(result) {
                    if (!result.response.ok || !result.body.success) {
                        var error = result.body.error || {};
                        throw new Error(error.message || 'ไม่สามารถโหลดข้อมูลเชิงลึกของรายวิชาได้');
                    }
                    renderCourseInsight(result.body.data && result.body.data.insight);
                }).catch(function(error) {
                    $('#agentpoc-risk-course-insight-status').attr('class', 'badge bg-warning text-dark').text('ใช้ข้อมูลเชิงกำหนด');
                    $('#agentpoc-risk-course-insight').removeClass('text-muted').html('<p class="mb-0">' + escapeHtml(error.message) + ' ผลความเสี่ยง ปัญหา ความครอบคลุม และข้อเสนอการดำเนินการเชิงกำหนดยังคงใช้งานได้</p>');
                });
            };

            var loadDashboard = function() {
                clearAlert();
                $loading.removeClass('d-none');
                $overview.addClass('d-none');
                $students.addClass('d-none');
                var params = {action: 'dashboard', course_id: config.courseId};
                if (state.snapshotId) {
                    params.snapshot_id = state.snapshotId;
                }
                return get(config, params).then(function(result) {
                    if (!result.response.ok || !result.body.success) {
                        var error = result.body.error || {};
                        throw new Error(error.message || 'ไม่สามารถโหลดข้อมูลวิเคราะห์ความเสี่ยงได้');
                    }
                    state.data = result.body.data;
                    renderOverview(state.data);
                    $loading.addClass('d-none');
                    setView(state.view);
                    loadCourseInsight();
                }).catch(function(error) {
                    $loading.addClass('d-none');
                    showAlert(error.message + ' สามารถลองใหม่ได้โดยข้อมูลรายวิชาใน Moodle จะไม่สูญหาย', 'danger');
                });
            };

            $('#agentpoc-risk-tabs').on('click', '[data-view]', function() {
                setView($(this).data('view'));
            });
            $('#agentpoc-risk-view-all-students').on('click', function() {
                setView('students');
            });
            $('#agentpoc-risk-regenerate-ai').on('click', function() {
                if (!config.showAiTestTools || !state.snapshotId) {
                    return;
                }
                var $button = $(this).prop('disabled', true);
                clearAlert();
                $('#agentpoc-risk-course-insight-status').attr('class', 'badge bg-info text-dark').text('กำลังสร้างใหม่');
                $('#agentpoc-risk-course-insight').addClass('text-muted').text('กำลังบังคับสร้าง AI Summary ใหม่โดยไม่ใช้แคช…');
                post(config, {
                    action: 'course_insight_regenerate',
                    course_id: config.courseId,
                    snapshot_id: state.snapshotId,
                    sesskey: config.sesskey
                }).then(function(result) {
                    if (!result.response.ok || !result.body.success) {
                        var error = result.body.error || {};
                        throw new Error(error.message || 'ไม่สามารถสร้าง AI Summary ใหม่ได้');
                    }
                    var insight = result.body.data && result.body.data.insight;
                    renderCourseInsight(insight);
                    var calls = insight && insight.model_calls !== undefined ? insight.model_calls : '—';
                    showAlert('สร้าง AI Summary ใหม่แล้ว · Model calls: ' + calls, 'success');
                }).catch(function(error) {
                    showAlert(error.message + ' ผล Risk เชิงกำหนดยังคงใช้งานได้ตามปกติ', 'warning');
                    loadCourseInsight();
                }).finally(function() {
                    $button.prop('disabled', false);
                });
            });
            $('#agentpoc-risk-student-search').on('input', function() {
                var q = String($(this).val() || '').toLowerCase();
                $('#agentpoc-risk-students-table tbody tr').each(function() {
                    var name = String($(this).data('student-name') || '');
                    $(this).toggle(name.indexOf(q) !== -1);
                });
            });
            $('#agentpoc-risk-refresh').on('click', function() {
                if (!config.canRefresh) {
                    return;
                }
                var $button = $(this).prop('disabled', true);
                clearAlert();
                post(config, {
                    action: 'refresh',
                    course_id: config.courseId,
                    sesskey: config.sesskey
                }).then(function(result) {
                    if (!result.response.ok || !result.body.success) {
                        var error = result.body.error || {};
                        throw new Error(error.message || 'รีเฟรชข้อมูลความเสี่ยงไม่สำเร็จ');
                    }
                    state.snapshotId = result.body.data.snapshot_id || '';
                    showAlert('รีเฟรชข้อมูลความเสี่ยงสำเร็จ', 'success');
                    return loadDashboard();
                }).catch(function(error) {
                    showAlert(error.message, 'danger');
                }).finally(function() {
                    $button.prop('disabled', false);
                });
            });

            loadDashboard();
        }
    };
});
