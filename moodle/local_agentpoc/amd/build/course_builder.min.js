/**
 * AI Course Builder AMD Module.
 *
 * @module     local_agentpoc/course_builder
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define(['jquery', 'local_agentpoc/contract_helpers', 'local_agentpoc/core_context_view'], function($, contractHelpers, coreContextView) {
    'use strict';

    var MAX_SYLLABUS_FILE_BYTES = 10 * 1024 * 1024;
    var MAX_MATERIAL_FILE_BYTES = 30 * 1024 * 1024;

    function fileSizeValidationError(file, maxBytes, label) {
        if (!file || typeof file.size !== 'number' || file.size <= maxBytes) {
            return null;
        }
        var maxMb = Math.round(maxBytes / (1024 * 1024));
        var actualMb = (file.size / (1024 * 1024)).toFixed(1);
        return label + ' file "' + file.name + '" is ' + actualMb + ' MB. Maximum allowed size is ' + maxMb + ' MB.';
    }

    var state = {
        sesskey: '',
        ajaxurl: '',
        categories: [],
        selectedCategoryId: null,
        courseFormat: null,
        selectedFile: null,
        teacherInstruction: '',
        runId: null,
        stagedMode: false,
        structureRevision: null,
        currentStructure: null,
        planId: null,
        revision: 1,
        currentEnvelope: null,
        currentPreview: null,
        executionResult: null,
        approvedRevision: null,
        progressTimer: null,
        sectionMaterials: {},
        activityIntents: {},
        requiresAiReview: false,
        activityLoadingCount: 0,
        outcomeProposals: [],
        outcomeCoverage: [],
        competencyCandidates: [],
        coreContextRevision: null,
        coreContext: null,
        outcomeReviews: [],
        selectedOutcomeReviewKey: null,
        selectedWeekRef: new URL(window.location.href).searchParams.get('week_ref'),
        selectedActivityWeekRef: new URL(window.location.href).searchParams.get('activity_week_ref'),
        selectedActivityTabByWeek: {},
        selectedQuizQuestionByActivity: {},
        activityRenderVersion: 0,
        outcomeAuthorityFeedback: null,
        outcomeReviewNavScrollTop: 0,
        activeDraftGuard: null,
        draftSessions: {},
        recoveryWriteFailures: {}
    };

    function recoverySnapshotKey(surface, entityRef) {
        return ['moodle-agent-draft', state.runId || 'no-run', surface, entityRef || 'root'].join(':');
    }

    function recoveryHost(surface) {
        return surface === 'activity-content' ? $('#activity-structure-container') : $('#preview-sections-container');
    }

    function readRecoverySnapshot(surface, entityRef) {
        try {
            var raw = window.localStorage.getItem(recoverySnapshotKey(surface, entityRef));
            return raw ? JSON.parse(raw) : null;
        } catch (err) {
            return null;
        }
    }

    function beginDraftSession(surface, entityRef, baseRevision, mode) {
        if (!state.runId) return {ok: false, reason: 'no-run'};
        var revision = Number(baseRevision);
        var snapshot = readRecoverySnapshot(surface, entityRef);
        if (snapshot && snapshot.base_revision !== revision) {
            return {ok: false, reason: 'conflict', snapshot: snapshot};
        }
        if (snapshot && mode !== 'restored') {
            return {ok: false, reason: 'recovery-pending', snapshot: snapshot};
        }
        state.draftSessions[recoverySnapshotKey(surface, entityRef)] = {
            base_revision: revision,
            mode: mode || 'fresh'
        };
        return {ok: true, snapshot: snapshot};
    }

    function endDraftSession(surface, entityRef) {
        delete state.draftSessions[recoverySnapshotKey(surface, entityRef)];
    }

    function writeRecoverySnapshot(surface, entityRef, baseRevision, payload) {
        if (!state.runId) return false;
        var key = recoverySnapshotKey(surface, entityRef);
        var session = state.draftSessions[key];
        if (!session || session.base_revision !== Number(baseRevision)) return false;
        var existing = readRecoverySnapshot(surface, entityRef);
        if (existing && existing.base_revision !== Number(baseRevision)) return false;
        var snapshot = {
            run_id: state.runId,
            surface: surface,
            entity_ref: entityRef || 'root',
            base_revision: Number(baseRevision),
            payload: payload,
            saved_at: new Date().toISOString()
        };
        try {
            window.localStorage.setItem(key, JSON.stringify(snapshot));
            delete state.recoveryWriteFailures[key];
            return true;
        } catch (err) {
            if (!state.recoveryWriteFailures[key]) {
                state.recoveryWriteFailures[key] = true;
                showError('Your recovery draft could not be saved in this browser. Keep this editor open and use explicit Save before navigating away.');
            }
            return false;
        }
    }

    function removeRecoveryBanner(surface, entityRef) {
        var $host = recoveryHost(surface);
        if (!$host.length) return;
        var bannerKey = recoverySnapshotKey(surface, entityRef);
        $host.find('[data-recovery-key="' + bannerKey.replace(/"/g, '&quot;') + '"]').remove();
    }

    function discardRecoverySnapshot(surface, entityRef) {
        endDraftSession(surface, entityRef);
        try {
            window.localStorage.removeItem(recoverySnapshotKey(surface, entityRef));
        } catch (err) {
            return false;
        }
        removeRecoveryBanner(surface, entityRef);
        return true;
    }

    function hasRecoveryConflict(surface, entityRef, serverRevision) {
        var snapshot = readRecoverySnapshot(surface, entityRef);
        return Boolean(snapshot && snapshot.base_revision !== Number(serverRevision));
    }

    function clearRecoverySnapshotAfterSave(surface, entityRef) {
        discardRecoverySnapshot(surface, entityRef);
    }

    function restoreRecoverySnapshot(surface, entityRef, snapshot, applyDraft) {
        if (!snapshot || typeof applyDraft !== 'function') return false;
        var session = beginDraftSession(surface, entityRef, snapshot.base_revision, 'restored');
        if (!session.ok) return false;
        applyDraft(snapshot.payload || {});
        return true;
    }

    function showRecoveryBanner(surface, entityRef, serverRevision, applyDraft, $hostOverride) {
        var snapshot = readRecoverySnapshot(surface, entityRef);
        if (!snapshot) return;
        var $host = $hostOverride && $hostOverride.length ? $hostOverride : recoveryHost(surface);
        if (!$host.length) return;
        var bannerKey = recoverySnapshotKey(surface, entityRef);
        if ($host.find('[data-recovery-key="' + bannerKey.replace(/"/g, '&quot;') + '"]').length) return;
        var matching = snapshot.base_revision === Number(serverRevision);
        var $alert = $('<div class="alert mb-3"></div>').attr('data-recovery-key', bannerKey).addClass(matching ? 'alert-info' : 'alert-warning');
        $alert.append($('<div class="font-weight-bold mb-1"></div>').text(matching ? 'Recoverable draft available' : 'Draft conflict'));
        $alert.append($('<div class="small mb-2"></div>').text(matching
            ? 'A local recovery snapshot exists for this server revision. It will not be applied unless you choose Restore draft.'
            : 'The server revision has advanced. Review the local recovery snapshot or discard it; it will not be applied or merged automatically.'));
        if (matching) {
            var $restore = $('<button type="button" class="btn btn-sm btn-primary mr-2"></button>').text('Restore draft');
            $restore.on('click', function() {
                if (restoreRecoverySnapshot(surface, entityRef, snapshot, applyDraft)) $alert.remove();
            });
            $alert.append($restore);
        } else {
            var $review = $('<button type="button" class="btn btn-sm btn-outline-secondary mr-2"></button>').text('Review draft');
            $review.on('click', function() {
                window.alert(JSON.stringify(snapshot.payload || {}, null, 2));
            });
            $alert.append($review);
        }
        var $discard = $('<button type="button" class="btn btn-sm btn-outline-danger"></button>').text('Discard');
        $discard.on('click', function() {
            discardRecoverySnapshot(surface, entityRef);
            clearActiveDraftGuard(surface, entityRef);
            $alert.remove();
        });
        $alert.append($discard);
        $host.prepend($alert);
    }

    function setActiveDraftGuard(guard) {
        state.activeDraftGuard = guard || null;
    }

    function clearActiveDraftGuard(surface, entityRef) {
        if (!state.activeDraftGuard) return;
        if (surface && state.activeDraftGuard.surface !== surface) return;
        if (entityRef && state.activeDraftGuard.entityRef !== entityRef) return;
        state.activeDraftGuard = null;
    }

    function guardedNavigate(navigate) {
        var guard = state.activeDraftGuard;
        if (!guard) {
            navigate();
            return;
        }
        guardDraftNavigation({
            isDirty: guard.isDirty,
            save: guard.save,
            discard: function() {
                if (typeof guard.discard === 'function') guard.discard();
                discardRecoverySnapshot(guard.surface, guard.entityRef);
                clearActiveDraftGuard(guard.surface, guard.entityRef);
            },
            navigate: navigate
        });
    }

    function guardDraftNavigation(options) {
        if (!options || !options.isDirty || !options.isDirty()) {
            options.navigate();
            return;
        }
        var $modal = $('<div class="modal fade draft-navigation-modal" tabindex="-1" role="dialog" aria-modal="true"></div>');
        var $dialog = $('<div class="modal-dialog modal-dialog-centered" role="document"></div>');
        var $content = $('<div class="modal-content"></div>');
        var $body = $('<div class="modal-body"></div>').append($('<div class="font-weight-bold mb-2"></div>').text('Unsaved changes'));
        $body.append($('<div class="small text-muted"></div>').text('Choose what to do with your working copy before navigation continues.'));
        var $footer = $('<div class="modal-footer"></div>');
        var $save = $('<button type="button" class="btn btn-primary"></button>').text('Save');
        var $discard = $('<button type="button" class="btn btn-outline-danger"></button>').text('Discard');
        var $cancel = $('<button type="button" class="btn btn-outline-secondary"></button>').text('Cancel');
        function closeModal() {
            $modal.modal('hide');
            $modal.on('hidden.bs.modal', function() { $modal.remove(); });
        }
        $save.on('click', function() {
            $save.prop('disabled', true);
            Promise.resolve(options.save()).then(function() {
                closeModal();
                options.navigate();
            }).catch(function(err) {
                $save.prop('disabled', false);
                showError('Could not save changes before navigation: ' + err.message, err.details);
            });
        });
        $discard.on('click', function() {
            if (typeof options.discard === 'function') options.discard();
            closeModal();
            options.navigate();
        });
        $cancel.on('click', function() {
            closeModal();
        });
        $footer.append($save).append($discard).append($cancel);
        $content.append($body).append($footer);
        $dialog.append($content);
        $modal.append($dialog);
        $('body').append($modal);
        $modal.modal({backdrop: 'static', keyboard: false, show: true});
    }

    function showCoreContext(context) {
        state.coreContext = context || null;
        $('#core-course-design-context').html(coreContextView.render(context)).toggleClass('d-none', !context);
    }

    function learnerContextNeedsAcknowledgment() {
        return Boolean(
            state.coreContext &&
            state.coreContext.learner_context &&
            state.coreContext.learner_context.status === 'UNSPECIFIED' &&
            state.coreContext.learner_context.teacher_acknowledged_unspecified !== true
        );
    }

    function renderLearnerContextAcknowledgmentControl(onAcknowledged) {
        var learner = state.coreContext && state.coreContext.learner_context;
        if (!learner || learner.status !== 'UNSPECIFIED') return null;
        var $panel = $('<div class="alert mb-3 learner-context-acknowledgment"></div>')
            .addClass(learner.teacher_acknowledged_unspecified === true ? 'alert-success' : 'alert-warning');
        $panel.append($('<div class="font-weight-bold"></div>').text('Learner Context: UNSPECIFIED'));
        $panel.append($('<div class="small mb-2"></div>').text(
            learner.teacher_acknowledged_unspecified === true
                ? 'Teacher acknowledgment applies to Learner Context revision ' + learner.revision + ' and is shared by all Activities.'
                : 'Learner details are not specified. Acknowledge this once for Learner Context revision ' + learner.revision + ' before generating Activities.'
        ));
        if (learner.teacher_acknowledged_unspecified === true) {
            $panel.append($('<span class="badge badge-success"></span>').text('Acknowledged'));
            return $panel;
        }
        var $ack = $('<input type="checkbox" class="mr-2 learner-context-shared-ack">');
        var $label = $('<label class="mb-0 small font-weight-bold"></label>').append($ack).append(' I acknowledge learner context is unspecified');
        $ack.on('change', function() {
            if (!$ack.is(':checked')) return;
            $ack.prop('disabled', true);
            callBff('acknowledge_learner_context', {
                run_id: state.runId,
                learner_context_revision: learner.revision
            }).then(function(result) {
                var context = result && result.core_course_design_context;
                if (!context) throw new Error('Acknowledgment response did not include Core Course Design Context.');
                showCoreContext(context);
                state.coreContextRevision = context.revision;
                if (typeof onAcknowledged === 'function') onAcknowledged();
            }).catch(function(err) {
                $ack.prop('checked', false).prop('disabled', false);
                showError('Failed to acknowledge Learner Context: ' + err.message, err.details);
            });
        });
        $panel.append($label);
        return $panel;
    }

    function showError(message, details) {
        $('#builder-error-message').text(message || 'An unexpected error occurred.');
        if (details) {
            $('#builder-error-details pre').text(typeof details === 'string' ? details : JSON.stringify(details, null, 2));
            $('#builder-error-details').removeClass('d-none');
        } else {
            $('#builder-error-details').addClass('d-none');
        }
        $('#builder-error-alert').removeClass('d-none');
        $('html, body').animate({ scrollTop: $('#builder-error-alert').offset().top - 80 }, 300);
    }

    function clearError() {
        $('#builder-error-alert').addClass('d-none');
        $('#builder-error-message').empty();
        $('#builder-error-details pre').empty();
        $('#builder-error-details').addClass('d-none');
    }

    function stopProgressPolling() {
        if (state.progressTimer) {
            clearInterval(state.progressTimer);
            state.progressTimer = null;
        }
    }

    function startProgressPolling() {
        stopProgressPolling();
        state.progressTimer = setInterval(function() {
            if (!state.runId) return;
            callBff('get_planning_progress', {run_id: state.runId}).then(function(progress) {
                var planning = progress.planning || {};
                var completed = planning.completed_sections || 0;
                var total = planning.total_sections || 0;
                var current = (planning.current_sections || planning.currentSectionRefs || []).join(', ');
                var label = planning.stage === 'generating_activities' ? 'Generating activities' : planning.stage === 'planning_structure' ? 'Designing course structure' : planning.stage === 'validating_contract' ? 'Validating CoursePlan' : 'Preparing plan preview';
                $('#upload-progress-status').text(label + (total ? ' (' + completed + '/' + total + ' sections)' : '...'));
                if (current) $('#upload-progress-checklist').attr('data-current-sections', current);
            }).catch(function() {});
        }, 1000);
    }

    function bindModalDismiss(modalSelector) {
        var dismiss = function(e) {
            e.preventDefault();
            $(modalSelector).modal('hide');
        };
        $(modalSelector + ' .close').on('click', dismiss);
        $(modalSelector + ' [data-dismiss="modal"]').on('click', dismiss);
    }

    function setStep(stepNumber) {
        clearError();
        $('.stepper-item').removeClass('active completed');
        $('.stepper-line').removeClass('completed');

        var visibleStep = Math.min(stepNumber, 4);
        for (var i = 1; i <= 4; i++) {
            if (i < visibleStep || stepNumber > 4) $('.step-item-' + i).addClass('completed');
            else if (i === visibleStep) $('.step-item-' + i).addClass('active');
            if (i < visibleStep) $('.line-' + i + '-' + (i + 1)).addClass('completed');
        }
        if (stepNumber > 4) $('.line-3-4').addClass('completed');

        $('.step-view').addClass('d-none');
        if (stepNumber === 1) $('#step-view-upload').removeClass('d-none');
        else if (stepNumber === 2) $('#step-view-review').removeClass('d-none');
        else if (stepNumber === 3) $('#step-view-activities').removeClass('d-none');
        else if (stepNumber === 4) $('#step-view-approve').removeClass('d-none');
        else if (stepNumber === 5) $('#step-view-executing').removeClass('d-none');
        else if (stepNumber === 6) $('#step-view-completed').removeClass('d-none');
    }

    function callBff(action, data, isMultipart, method) {
        var url = state.ajaxurl + (state.ajaxurl.indexOf('?') !== -1 ? '&' : '?') + 'action=' + encodeURIComponent(action) + '&sesskey=' + encodeURIComponent(state.sesskey);
        var options = {
            method: method || 'POST'
        };

        if (isMultipart) {
            options.body = data;
        } else if (data) {
            var params = new URLSearchParams();
            Object.keys(data).forEach(function(key) {
                if (data[key] !== undefined && data[key] !== null) {
                    var val = data[key];
                    if (typeof val === 'object') {
                        val = JSON.stringify(val);
                    }
                    params.append(key, val);
                }
            });
            options.headers = {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            };
            options.body = params.toString();
        }

        return fetch(url, options).then(function(res) {
            return res.json().then(function(json) {
                if (!res.ok || !json.success) {
                    var msg = (json.error && json.error.message) ? json.error.message : ('Request failed with HTTP ' + res.status);
                    var err = new Error(msg);
                    err.details = json;
                    throw err;
                }
                return json.data;
            });
        });
    }

    function structurePreviewEnvelope(structure) {
        var sections = (structure && structure.content && structure.content.sections) || [];
        return {
            schema_version: '0.1',
            plan_id: 'structure-review',
            revision: structure.revision || 1,
            plan_type: 'course',
            operation: 'create',
            title: structure.title,
            summary: structure.summary,
            warnings: [],
            assumptions: [],
            content: {
                course: structure.content.course,
                sections: sections.map(function(sec) {
                    return {
                        ref: sec.ref,
                        position: sec.position,
                        title: sec.title,
                        summary: sec.summary,
                        source_refs: sec.source_refs || [],
                        activity_intents: sec.activity_intents || [],
                        aligned_objective_ids: sec.aligned_objective_ids || [],
                        aligned_outcome_ids: sec.aligned_outcome_ids || [],
                        alignment_status: sec.alignment_status || "CURRENT",
                        activities: []
                    };
                })
            }
        };
    }

    function appendPreviewList($container, label, values) {
        if (!Array.isArray(values) || !values.length) return;
        var $field = $('<div class="mb-2"></div>');
        $field.append($('<div class="font-weight-bold"></div>').text(label));
        var $list = $('<ul class="mb-0 pl-4"></ul>');
        values.forEach(function(value) {
            $list.append($('<li></li>').text(String(value)));
        });
        $field.append($list);
        $container.append($field);
    }

    function appendPreviewValue($container, label, value) {
        if (value === undefined || value === null || value === '') return;
        var $field = $('<div class="mb-2"></div>');
        $field.append($('<span class="font-weight-bold"></span>').text(label + ': '));
        $field.append($('<span></span>').text(String(value)));
        $container.append($field);
    }

    function renderCanonicalQuestionPreview(question, index, $container) {
        var $card = $('<div class="border rounded p-2 mb-2"></div>');
        var questionNumber = index + 1;
        var questionText = question && typeof question.question === 'string' && question.question.trim()
            ? question.question
            : 'Question content unavailable';
        $card.append($('<div class="font-weight-bold mb-2"></div>').text(questionNumber + '. ' + questionText));

        var type = question && question.type ? question.type : 'unknown';
        var typeLabel = type === 'multichoice' ? 'Multiple Choice'
            : type === 'truefalse' ? 'True/False'
                : type === 'shortanswer' ? 'Short Answer'
                    : type === 'essay' ? 'Essay' : 'Unknown';
        appendPreviewValue($card, 'Type', typeLabel);

        if (type === 'multichoice') {
            var correctRefs = Array.isArray(question.correct_choice_refs) ? question.correct_choice_refs : [];
            var $choices = $('<div class="mb-2"></div>');
            $choices.append($('<div class="font-weight-bold"></div>').text('Choices'));
            var choices = Array.isArray(question.choices) ? question.choices : [];
            var $choiceList = $('<ul class="mb-0 pl-4"></ul>');
            choices.forEach(function(choice) {
                var isCorrect = correctRefs.indexOf(choice.ref) !== -1;
                var $choice = $('<li></li>').toggleClass('font-weight-bold text-success', isCorrect);
                $choice.append(document.createTextNode((isCorrect ? '✓ ' : '') + String(choice.text || '')));
                if (isCorrect) $choice.append($('<span class="badge badge-success ml-2"></span>').text('Correct'));
                $choiceList.append($choice);
            });
            $choices.append($choiceList);
            $card.append($choices);
        } else if (type === 'truefalse') {
            appendPreviewValue($card, 'Correct answer', question.correct_answer === true ? 'True' : question.correct_answer === false ? 'False' : 'Not specified');
        } else if (type === 'shortanswer') {
            appendPreviewList($card, 'Accepted answers', question.accepted_answers);
            appendPreviewValue($card, 'Case-sensitive', question.case_sensitive === true ? 'Yes' : 'No');
        } else if (type === 'essay') {
            appendPreviewList($card, 'Grading guidance', question.grading_guidance);
        }

        appendPreviewValue($card, 'Feedback', question.feedback);
        appendPreviewValue($card, 'Default mark', question.default_mark);
        $container.append($card);
    }

    // Renders the canonical QuizPlan shape. Keep this as the single UI
    // mapping for Activity Structure and the later Official Preview.
    function renderQuizActivityPreview(quiz, $container) {
        if (quiz.title) $container.append($('<div class="font-weight-bold mb-1"></div>').text(quiz.title));
        if (quiz.description) $container.append($('<div class="mb-2"></div>').text(quiz.description));
        var questions = Array.isArray(quiz.questions) ? quiz.questions : [];
        if (!questions.length) {
            $container.append($('<div class="text-muted"></div>').text('No questions yet.'));
            return;
        }
        questions.forEach(function(question, index) {
            renderCanonicalQuestionPreview(question, index, $container);
        });
    }

    function saveStructureRevision(structure) {
        return callBff('save_structure_revision', {
            run_id: state.runId,
            structure: JSON.stringify(structure)
        }).then(function(result) {
            state.structureRevision = result.structure_revision.revision;
            state.currentStructure = result.structure_revision;
            state.outcomeCoverage = result.coverage || [];
            state.sectionMaterials = {};
            $('#material-generation-stage').remove();
            $('#btn-review-continue').prop('disabled', false).text('Confirm structure');
            var envelope = structurePreviewEnvelope(result.structure_revision);
            state.currentEnvelope = envelope;
            renderPreview(envelope, envelope);
            return result;
        });
    }

    function renderAssignmentActivityPreview(assignment, $container) {
        $container.append($('<div class="font-weight-bold mb-1"></div>').text(assignment.title || 'Assignment'));
        appendPreviewValue($container, 'Description', assignment.description);
        appendPreviewList($container, 'Instructions', assignment.instructions);
        appendPreviewList($container, 'Learning objectives', assignment.learning_objectives);
        appendPreviewValue($container, 'Grade', assignment.grade);
    }

    function renderOfficialPreview(preview, envelope) {
        var $container = $('#approve-official-preview');
        $container.empty();
        var content = envelope && envelope.content ? envelope.content : (preview && preview.structure && preview.structure.type === 'course' ? preview.structure : {});
        var course = content.course || {};
        var warnings = (envelope && envelope.warnings) || preview.warnings || [];
        var assumptions = (envelope && envelope.assumptions) || preview.assumptions || [];
        $('#approve-preview-identity').text('Plan ' + (envelope.plan_id || preview.plan_id || 'unknown') + ' • Revision ' + (envelope.revision || preview.revision || '?'));

        var $course = $('<div class="border rounded bg-light p-3 mb-3"></div>');
        $course.append($('<div class="h5 mb-1"></div>').text(course.title || envelope.title || preview.title || 'Untitled Course'));
        appendPreviewValue($course, 'Summary', course.summary || envelope.summary || preview.summary);
        var persistedCourseFormat = preview && preview.execution_config ? preview.execution_config.course_format : null;
        appendPreviewValue($course, 'Course Format', persistedCourseFormat || 'Unavailable');
        $container.append($course);

        var sections = content.sections || [];
        sections.forEach(function(section, index) {
            var $section = $('<div class="border rounded p-3 mb-3"></div>');
            $section.append($('<div class="font-weight-bold mb-1"></div>').text((index + 1) + '. ' + (section.title || 'Section ' + (index + 1))));
            if (section.summary) $section.append($('<div class="small text-muted mb-2"></div>').text(section.summary));

            var resources = section.resources || [];
            if (resources.length) {
                var $resourceBlock = $('<div class="mb-3"></div>').append($('<div class="font-weight-bold"></div>').text('File Resources'));
                var $resourceList = $('<ul class="mb-0 pl-4"></ul>');
                resources.forEach(function(resource) {
                    $resourceList.append($('<li></li>').text(resource.title + ' (' + resource.filename + ')'));
                });
                $resourceBlock.append($resourceList);
                $section.append($resourceBlock);
            } else {
                $section.append($('<div class="small text-muted mb-3"></div>').text('No planned File Resource'));
            }

            (section.activities || []).forEach(function(activity) {
                var $activity = $('<div class="border-top pt-2 mt-2"></div>');
                var isShell = warnings.some(function(warning) { return String(warning).indexOf(activity.ref) !== -1 && String(warning).indexOf('Empty Activity Shell') !== -1; });
                var needsReview = warnings.some(function(warning) { return String(warning).indexOf(activity.ref) !== -1 && String(warning).indexOf('Teacher Review Required') !== -1; });
                var label = activity.type === 'quiz' ? 'Quiz' : 'Assignment';
                var $badges = $('<span class="ml-2"></span>');
                if (isShell) $badges.append($('<span class="badge badge-warning mr-1"></span>').text('Empty Shell'));
                if (needsReview) $badges.append($('<span class="badge badge-warning"></span>').text('Teacher Review Required'));
                $activity.append($('<div class="font-weight-bold mb-2"></div>').text(label).append($badges));
                if (activity.type === 'quiz') renderQuizActivityPreview(activity, $activity);
                else renderAssignmentActivityPreview(activity, $activity);
                $section.append($activity);
            });
            $container.append($section);
        });

        var notes = warnings.concat(assumptions);
        var $notes = $('<div class="alert alert-info small mb-0"></div>');
        $notes.append($('<div class="font-weight-bold mb-1"></div>').text('Warnings and assumptions'));
        if (!notes.length) $notes.append($('<div></div>').text('None'));
        notes.forEach(function(note) { $notes.append($('<div></div>').text('• ' + note)); });
        $container.append($notes);
    }


    function outcomeReviewKey(item) {
        return item.item_type + ':' + item.item_id;
    }

    function outcomeReviewStatusPresentation(status) {
        if (status === 'REVIEWED') return {label: 'Reviewed', badge: 'badge-info'};
        if (status === 'NEEDS_REVISION') return {label: 'Needs revision', badge: 'badge-danger'};
        if (status === 'APPROVED') return {label: 'CLO Approved', badge: 'badge-success'};
        return {label: 'Pending review', badge: 'badge-secondary'};
    }

    function outcomeReviewWhereUsed(item) {
        var sections = state.currentStructure && state.currentStructure.content && Array.isArray(state.currentStructure.content.sections)
            ? state.currentStructure.content.sections
            : [];
        return sections.filter(function(section) {
            var ids = item.item_type === 'LO' ? (section.aligned_objective_ids || []) : (section.aligned_outcome_ids || []);
            return ids.indexOf(item.item_id) !== -1 || (item.approved_outcome_id && ids.indexOf(item.approved_outcome_id) !== -1);
        }).map(function(section) { return section.title || section.ref; });
    }

    function focusOutcomeReviewSelection() {
        var $target = $('#outcome-review-text:not(:disabled)');
        if (!$target.length) $target = $('#outcome-review-next:not(:disabled)');
        if (!$target.length) $target = $('.outcome-review-focus');
        $target.first().trigger('focus');
    }

    function renderOutcomeReviewWorkbench() {
        var $root = $('#outcome-review-workbench');
        if (!$root.length) return;
        var items = state.outcomeReviews || [];
        if (!state.stagedMode || !items.length) {
            $root.addClass('d-none').empty();
            return;
        }
        $('#core-course-design-context').addClass('d-none');
        $root.removeClass('d-none').empty();

        var selected = items.find(function(item) { return outcomeReviewKey(item) === state.selectedOutcomeReviewKey; });
        if (!selected) {
            selected = items[0];
            state.selectedOutcomeReviewKey = selected ? outcomeReviewKey(selected) : null;
        }
        if (!selected) return;

        var completeCount = items.filter(function(item) { return item.status === 'REVIEWED' || item.status === 'APPROVED'; }).length;
        var $header = $('<div class="outcome-workbench-header px-3 py-3 border-bottom bg-light"></div>');
        $header.append($('<div class="d-flex flex-wrap justify-content-between align-items-center"></div>')
            .append($('<div></div>')
                .append($('<div class="font-weight-bold h6 mb-1"></div>').text('Outcome Review Workbench'))
                .append($('<div class="small text-muted"></div>').text('Select → Inspect → Decide → Save → Next')))
            .append($('<span class="badge badge-light border"></span>').text(completeCount + ' / ' + items.length + ' reviewed or approved')));
        $root.append($header);

        var $row = $('<div class="row no-gutters"></div>');
        var $nav = $('<nav class="col-lg-3 outcome-review-nav border-right p-2" aria-label="Outcome navigator"></nav>');
        $nav.on('scroll', function() {
            state.outcomeReviewNavScrollTop = $nav.scrollTop();
        });
        var $workspace = $('<section class="col-lg-6 outcome-review-focus p-3" aria-live="polite" aria-labelledby="outcome-review-selected-title" tabindex="-1"></section>');
        var $inspector = $('<aside class="col-lg-3 outcome-review-inspector border-left p-3"></aside>');

        function appendNavGroup(title, type) {
            $nav.append($('<div class="small text-uppercase text-muted font-weight-bold px-2 pt-2 pb-1"></div>').text(title));
            items.filter(function(item) { return item.item_type === type; }).forEach(function(item) {
                var presentation = outcomeReviewStatusPresentation(item.status);
                var active = outcomeReviewKey(item) === state.selectedOutcomeReviewKey;
                var label = semanticDisplayLabel(type, item.authoritative_text || item.source_text, item.item_id);
                var $button = $('<button type="button" class="btn btn-block text-left outcome-review-nav-item mb-1"></button>')
                    .addClass(active ? 'btn-primary' : 'btn-light')
                    .attr('aria-current', active ? 'true' : null);
                $button.append($('<div class="small font-weight-bold text-truncate"></div>').text(label));
                $button.append($('<span class="badge mt-1"></span>').addClass(active ? 'badge-light' : presentation.badge).text(presentation.label));
                $button.on('click', function() {
                    state.selectedOutcomeReviewKey = outcomeReviewKey(item);
                    renderOutcomeReviewWorkbench();
                    focusOutcomeReviewSelection();
                });
                $nav.append($button);
            });
        }
        appendNavGroup('Learning Objectives', 'LO');
        appendNavGroup('Course Learning Outcomes', 'CLO');

        var presentation = outcomeReviewStatusPresentation(selected.status);
        var title = semanticDisplayLabel(selected.item_type, selected.authoritative_text || selected.source_text, selected.item_id);
        $workspace.append($('<div class="d-flex justify-content-between align-items-start mb-3"></div>')
            .append($('<div></div>').append($('<div class="small text-muted"></div>').text(selected.item_type === 'LO' ? 'Learning Objective' : 'Course Learning Outcome')).append($('<h5 class="mb-0" id="outcome-review-selected-title"></h5>').text(title)))
            .append($('<span class="badge"></span>').addClass(presentation.badge).text(presentation.label)));

        var isApprovedClo = selected.item_type === 'CLO' && selected.status === 'APPROVED';
        var editable = selected.status !== 'APPROVED' || isApprovedClo;
        var workingText = isApprovedClo
            ? (selected.authoritative_text || selected.source_text || '')
            : (selected.draft_text !== null && selected.draft_text !== undefined ? selected.draft_text : (selected.authoritative_text || selected.source_text || ''));
        var $text = $('<textarea class="form-control mb-3" rows="5" id="outcome-review-text"></textarea>').val(workingText).prop('disabled', !editable);
        $workspace.append($('<label class="small font-weight-bold mb-1" for="outcome-review-text"></label>').text(isApprovedClo ? 'Approved CLO wording' : 'Review wording'));
        $workspace.append($text);
        if (isApprovedClo) {
            $workspace.append($('<div class="alert alert-warning py-2 mb-3" id="approved-clo-edit-warning"></div>')
                .text('This wording is CLO Approved authority. Saving a change requires confirmation, invalidates the current CLO approval, and may make dependent items Stale. Nothing is regenerated automatically.'));
        } else if (editable) {
            $workspace.append($('<div class="small text-muted mb-3"></div>').text('Changes above remain a review draft until Save review succeeds. Source provenance remains unchanged.'));
        }

        var $actions = $('<div class="d-flex flex-wrap align-items-center outcome-review-actions"></div>');
        if (isApprovedClo) {
            var persistedApprovedText = String(selected.authoritative_text || selected.source_text || '').trim();
            var $saveApprovedEdit = $('<button type="button" class="btn btn-warning mr-2 mb-2" id="outcome-review-save"></button>').text('Save approved CLO edit');
            function approvedEditHasChange() {
                var nextText = String($text.val() || '').trim();
                return nextText !== '' && nextText !== persistedApprovedText;
            }
            function updateApprovedEditAvailability() {
                $saveApprovedEdit.prop('disabled', !approvedEditHasChange());
            }
            $text.on('input', updateApprovedEditAvailability);
            updateApprovedEditAvailability();
            $saveApprovedEdit.on('click', function() {
                if (!approvedEditHasChange()) return;
                var confirmed = window.confirm('Saving this edit will invalidate the current CLO approval and may mark dependent Structure, Activities, and Competency decisions Stale. Any current Final Plan Approval will also no longer be current. No downstream content will regenerate automatically. Continue?');
                if (!confirmed) return;
                $saveApprovedEdit.prop('disabled', true).text('Saving authority change...');
                callBff('edit_approved_learning_outcome', {
                    run_id: state.runId,
                    source_outcome_id: selected.item_id,
                    teacher_text: String($text.val() || '').trim(),
                    confirmed: true
                }).then(function(result) {
                    state.outcomeAuthorityFeedback = {
                        item_id: selected.item_id,
                        structure_stale: Boolean(result.stale && result.stale.structure_alignment),
                        activity_count: result.stale && Number(result.stale.activity_count || 0),
                        competency_candidate_count: result.stale && Number(result.stale.competency_candidate_count || 0)
                    };
                    return reloadInstructionalDesignAuthority();
                }).then(function(result) {
                    focusOutcomeReviewSelection();
                    return result;
                }).catch(function(err) {
                    $saveApprovedEdit.prop('disabled', false).text('Save approved CLO edit');
                    showError('Failed to save approved CLO edit: ' + err.message, err.details);
                });
            });
            $actions.append($saveApprovedEdit);
        } else if (editable) {
            var $status = $('<select class="custom-select custom-select-sm mb-3" id="outcome-review-status"></select>');
            $status.append($('<option value="PENDING_REVIEW">Pending review</option>'));
            $status.append($('<option value="REVIEWED">Reviewed</option>'));
            $status.append($('<option value="NEEDS_REVISION">Needs revision</option>'));
            $status.val(selected.status);
            $workspace.append($('<label class="small font-weight-bold mb-1" for="outcome-review-status"></label>').text('Review decision'));
            $workspace.append($status);

            var $save = $('<button type="button" class="btn btn-primary mr-2 mb-2" id="outcome-review-save"></button>').text('Save review');
            $save.on('click', function() {
                $save.prop('disabled', true).text('Saving...');
                callBff('save_outcome_review', {
                    run_id: state.runId,
                    item_type: selected.item_type,
                    item_id: selected.item_id,
                    status: $status.val(),
                    draft_text: $text.val()
                }).then(function() {
                    return loadOutcomeReviews();
                }).then(function(result) {
                    focusOutcomeReviewSelection();
                    return result;
                }).catch(function(err) {
                    $save.prop('disabled', false).text('Save review');
                    showError('Failed to save Outcome review: ' + err.message, err.details);
                });
            });
            $actions.append($save);

            if (selected.item_type === 'CLO' && selected.status === 'REVIEWED') {
                var persistedReviewedText = String(selected.draft_text || selected.authoritative_text || selected.source_text || '').trim();
                var $approve = $('<button type="button" class="btn btn-success mr-2 mb-2" id="outcome-review-approve" aria-describedby="outcome-review-approve-hint"></button>').text('Approve CLO');
                var $approveHint = $('<span class="small text-muted mr-2 mb-2 d-none" id="outcome-review-approve-hint"></span>')
                    .text('Save review changes before approving this CLO.');
                function approvalHasUnsavedChanges() {
                    return String($text.val() || '').trim() !== persistedReviewedText || $status.val() !== 'REVIEWED';
                }
                function updateApprovalAvailability() {
                    var hasUnsavedChanges = approvalHasUnsavedChanges();
                    $approve.prop('disabled', hasUnsavedChanges);
                    $approveHint.toggleClass('d-none', !hasUnsavedChanges);
                }
                $text.on('input', updateApprovalAvailability);
                $status.on('change', updateApprovalAvailability);
                updateApprovalAvailability();
                $approve.on('click', function() {
                    if (approvalHasUnsavedChanges()) {
                        updateApprovalAvailability();
                        return;
                    }
                    $approve.prop('disabled', true).text('Approving...');
                    var text = persistedReviewedText;
                    var proposal = (state.outcomeProposals || []).find(function(item) { return item.source_outcome_id === selected.item_id; });
                    var payload = {run_id: state.runId, source_outcome_id: selected.item_id};
                    if (!selected.draft_text || text === String(selected.source_text || '').trim()) {
                        payload.use_source_as_is = true;
                    } else {
                        payload.teacher_text = text;
                        payload.recommended_text = proposal ? proposal.recommended_text : selected.source_text;
                    }
                    callBff('approve_learning_outcome', payload).then(function(result) {
                        state.outcomeAuthorityFeedback = null;
                        applyOutcomeApproval(result, selected.item_id);
                        return loadOutcomeReviews();
                    }).then(function(result) {
                        focusOutcomeReviewSelection();
                        return result;
                    }).catch(function(err) {
                        $approve.prop('disabled', false).text('Approve CLO');
                        showError('Failed to approve CLO: ' + err.message, err.details);
                    });
                });
                $actions.append($approve).append($approveHint);
            }
        }

        var currentIndex = items.findIndex(function(item) { return outcomeReviewKey(item) === state.selectedOutcomeReviewKey; });
        var $next = $('<button type="button" class="btn btn-outline-secondary mb-2 ml-auto" id="outcome-review-next"></button>').text('Next');
        $next.prop('disabled', currentIndex < 0 || currentIndex >= items.length - 1);
        $next.on('click', function() {
            if (currentIndex >= 0 && currentIndex < items.length - 1) {
                state.selectedOutcomeReviewKey = outcomeReviewKey(items[currentIndex + 1]);
                renderOutcomeReviewWorkbench();
                focusOutcomeReviewSelection();
            }
        });
        $actions.append($next);
        $workspace.append($actions);

        $inspector.append($('<div class="small text-uppercase text-muted font-weight-bold mb-2"></div>').text('Inspector'));
        $inspector.append($('<div class="font-weight-bold small mb-1"></div>').text('Authority'));
        if (selected.item_type === 'LO') {
            $inspector.append($('<div class="small mb-3"></div>').text('Reviewed state only. LO has no CLO Approved authority and is separate from Final Plan Approval.'));
        } else if (selected.status === 'APPROVED') {
            $inspector.append($('<div class="small mb-3 text-success"></div>').text('CLO Approved — global Course Learning Outcome authority. This is not Final Plan Approval.'));
        } else {
            $inspector.append($('<div class="small mb-3"></div>').text(selected.status === 'REVIEWED' ? 'Reviewed — ready for explicit CLO approval. Reviewed is not CLO Approved or Final Plan Approval.' : 'Review decision is not CLO Approved authority or Final Plan Approval.'));
        }
        if (state.outcomeAuthorityFeedback && state.outcomeAuthorityFeedback.item_id === selected.item_id) {
            var feedback = state.outcomeAuthorityFeedback;
            var staleParts = [];
            if (feedback.structure_stale) staleParts.push('Structure alignment: Stale');
            if (feedback.activity_count) staleParts.push(String(feedback.activity_count) + ' Activity item(s): Stale');
            if (feedback.competency_candidate_count) staleParts.push(String(feedback.competency_candidate_count) + ' Competency candidate approval(s) withdrawn');
            $inspector.append($('<div class="alert alert-warning py-2 small mb-3" id="outcome-authority-feedback"></div>')
                .text('Previous CLO approval was invalidated. ' + (staleParts.join(' · ') || 'Downstream authority must be reviewed.') + '. Recovery remains Teacher-triggered; nothing was regenerated automatically.'));
        }

        $inspector.append($('<div class="font-weight-bold small mb-1"></div>').text('Provenance / source'));
        var refs = selected.source_refs || [];
        if (!refs.length) {
            $inspector.append($('<div class="small text-muted mb-3"></div>').text('No source reference available.'));
        } else {
            refs.forEach(function(ref) {
                $inspector.append($('<div class="small border rounded bg-light p-2 mb-2"></div>').text('Line ' + ref.start_line + (ref.end_line && ref.end_line !== ref.start_line ? '–' + ref.end_line : '') + ': ' + (ref.text || '')));
            });
        }

        $inspector.append($('<div class="font-weight-bold small mt-3 mb-1"></div>').text('Where used'));
        var whereUsed = outcomeReviewWhereUsed(selected);
        if (!whereUsed.length) {
            $inspector.append($('<div class="small text-muted"></div>').text('Not currently mapped to a Week.'));
        } else {
            var $usedList = $('<ul class="small pl-3 mb-0"></ul>');
            whereUsed.forEach(function(label) { $usedList.append($('<li></li>').text(label)); });
            $inspector.append($usedList);
        }

        $row.append($nav).append($workspace).append($inspector);
        $root.append($row);
        $nav.scrollTop(state.outcomeReviewNavScrollTop || 0);
    }

    function loadOutcomeReviews() {
        if (!state.runId) return Promise.resolve(null);
        return callBff('get_outcome_reviews', {run_id: state.runId}).then(function(result) {
            state.outcomeReviews = result.items || [];
            if (!state.selectedOutcomeReviewKey || !state.outcomeReviews.some(function(item) { return outcomeReviewKey(item) === state.selectedOutcomeReviewKey; })) {
                var next = state.outcomeReviews.find(function(item) { return item.status !== 'APPROVED'; }) || state.outcomeReviews[0];
                state.selectedOutcomeReviewKey = next ? outcomeReviewKey(next) : null;
            }
            renderOutcomeReviewWorkbench();
            updateStructureContinueState();
            return result;
        });
    }

    function reloadInstructionalDesignAuthority() {
        if (!state.runId) return Promise.resolve(null);
        return callBff('get_instructional_design', {run_id: state.runId}).then(function(result) {
            showCoreContext(result.core_context);
            state.coreContextRevision = result.core_context.revision;
            state.outcomeProposals = result.outcome_proposals || [];
            state.outcomeCoverage = result.coverage || [];
            var restored = result.structure_revision;
            if (restored) {
                state.structureRevision = restored.revision;
                state.currentStructure = restored;
                state.currentEnvelope = structurePreviewEnvelope(restored);
                renderAlignmentReview(state.currentStructure);
            }
            return callBff('get_competency_candidates', {run_id: state.runId}).then(function(candidateResult) {
                state.competencyCandidates = candidateResult.candidates || [];
            }).catch(function() {}).then(function() {
                return loadOutcomeReviews();
            });
        });
    }

    function approvedSourceOutcomeIds() {
        var approved = state.coreContext && Array.isArray(state.coreContext.approved_learning_outcomes)
            ? state.coreContext.approved_learning_outcomes
            : [];
        var ids = {};
        approved.forEach(function(outcome) {
            (outcome.source_outcome_ids || []).forEach(function(sourceId) { ids[sourceId] = true; });
        });
        return ids;
    }

    function unapprovedSourceOutcomes() {
        var sources = state.coreContext && Array.isArray(state.coreContext.source_learning_outcomes)
            ? state.coreContext.source_learning_outcomes
            : [];
        var approvedIds = approvedSourceOutcomeIds();
        return sources.filter(function(outcome) { return !approvedIds[outcome.source_outcome_id]; });
    }

    function currentAlignmentIsStale() {
        if (!state.currentStructure) return false;
        var constraints = state.currentStructure.teacher_constraints || state.currentStructure.teacherConstraintsJson;
        if (constraints && constraints.alignment_state === 'STALE_ALIGNMENT') return true;
        var sections = state.currentStructure.content && Array.isArray(state.currentStructure.content.sections)
            ? state.currentStructure.content.sections
            : [];
        return sections.some(function(section) { return section.alignment_status === 'STALE_ALIGNMENT'; });
    }

    function updateStructureContinueState() {
        var $button = $('#btn-review-continue');
        if ((state.outcomeReviews || []).some(function(item) { return item.status === 'NEEDS_REVISION'; })) {
            $button.prop('disabled', true).text('Resolve outcome revisions to continue');
            return;
        }
        if ((state.outcomeReviews || []).some(function(item) { return item.item_type === 'LO' && item.status === 'PENDING_REVIEW'; })) {
            $button.prop('disabled', true).text('Review Learning Objectives to continue');
            return;
        }
        if (unapprovedSourceOutcomes().length > 0) {
            $button.prop('disabled', true).text('Approve Outcomes to continue');
            return;
        }
        if (currentAlignmentIsStale()) {
            $button.prop('disabled', true).text('Revalidate alignment to continue');
            return;
        }
        if ((state.outcomeCoverage || []).some(function(item) { return item.state === 'UNCOVERED'; })) {
            $button.prop('disabled', true).text('Repair Outcome coverage to continue');
            return;
        }
        if (state.stagedMode && state.currentStructure && (state.currentStructure.content.sections || []).some(function(section) { return weekReviewStatus(section) === 'Pending review'; })) {
            $button.prop('disabled', true).text('Mark every Week reviewed to continue');
            return;
        }
        $button.prop('disabled', false).text('Confirm structure');
    }

    function markCurrentAlignmentStale() {
        if (!state.currentStructure) return;
        if (!state.currentStructure.teacher_constraints) state.currentStructure.teacher_constraints = {};
        state.currentStructure.teacher_constraints.alignment_state = 'STALE_ALIGNMENT';
        if (state.currentStructure.content && Array.isArray(state.currentStructure.content.sections)) {
            state.currentStructure.content.sections.forEach(function(section) { section.alignment_status = 'STALE_ALIGNMENT'; });
        }
    }

    function applyOutcomeApproval(result, sourceOutcomeId) {
        state.coreContextRevision = result.core_context.revision;
        state.outcomeCoverage = [];
        showCoreContext(result.core_context);
        state.outcomeProposals = (state.outcomeProposals || []).filter(function(item) {
            return item.source_outcome_id !== sourceOutcomeId;
        });
        markCurrentAlignmentStale();
        renderAlignmentReview(state.currentStructure);
    }

    function semanticDisplayLabel(kind, textValue, id) {
        var clean = typeof textValue === 'string' ? textValue.trim() : '';
        if (!clean) return kind + ' · ' + String(id || 'unmapped').slice(0, 12);
        var explicit = clean.match(/^((?:CLO|PLO|LO|CO)\s*\d+(?:\.\d+)*)\s*[:\-–—]?\s*(.*)$/i);
        if (explicit) {
            var code = explicit[1].replace(/\s+/g, '').toUpperCase();
            return code + (explicit[2] ? ' · ' + explicit[2] : '');
        }
        if (kind === 'LO') {
            var numbered = clean.match(/^(\d+(?:\.\d+)+)\s*[:\-–—]?\s*(.*)$/);
            if (numbered) return 'LO ' + numbered[1] + (numbered[2] ? ' · ' + numbered[2] : '');
        }
        return kind + ' · ' + clean;
    }

    function objectiveDisplayLabel(objectiveId) {
        var objectives = state.coreContext && Array.isArray(state.coreContext.learning_objectives)
            ? state.coreContext.learning_objectives
            : [];
        var match = objectives.find(function(objective) { return objective.objective_id === objectiveId; });
        return semanticDisplayLabel('LO', match && match.source_text, objectiveId);
    }

    function outcomeDisplayLabel(outcomeId) {
        var approved = state.coreContext && Array.isArray(state.coreContext.approved_learning_outcomes)
            ? state.coreContext.approved_learning_outcomes
            : [];
        var match = approved.find(function(outcome) { return outcome.outcome_id === outcomeId; });
        return semanticDisplayLabel('CLO', match && match.text, outcomeId);
    }

    function approvedOutcomeLabel(outcomeId) {
        return outcomeDisplayLabel(outcomeId);
    }

    function renderExternalCoverageControls($root) {
        var uncovered = (state.outcomeCoverage || []).filter(function(item) { return item.state === 'UNCOVERED'; });
        if (!uncovered.length) return;
        var $panel = $('<div class="alert alert-secondary mt-3 mb-0"></div>');
        $panel.append($('<div class="font-weight-bold mb-1"></div>').text('External coverage confirmation'));
        $panel.append($('<div class="small mb-2"></div>').text('Use only when this Outcome is intentionally covered outside this Moodle course. Repair Section mappings for internal coverage.'));
        uncovered.forEach(function(item) {
            var $row = $('<div class="border rounded bg-white p-2 mb-2"></div>');
            $row.append($('<div class="small font-weight-bold mb-1"></div>').text(approvedOutcomeLabel(item.outcome_id)));
            var $reason = $('<input type="text" class="form-control form-control-sm mb-2" placeholder="Describe the external evidence">');
            var $confirm = $('<button type="button" class="btn btn-sm btn-outline-secondary"></button>').text('Confirm external coverage');
            $confirm.on('click', function() {
                var reason = $reason.val().trim();
                if (!reason) {
                    showError('Describe the external coverage evidence before confirming.');
                    return;
                }
                $confirm.prop('disabled', true).text('Saving...');
                callBff('set_coverage_override', {run_id: state.runId, outcome_id: item.outcome_id, reason: reason}).then(function(result) {
                    state.outcomeCoverage = result.coverage || [];
                    renderAlignmentReview(state.currentStructure);
                }).catch(function(err) {
                    $confirm.prop('disabled', false).text('Confirm external coverage');
                    showError('Failed to confirm external coverage: ' + err.message, err.details);
                });
            });
            $row.append($reason).append($confirm);
            $panel.append($row);
        });
        $root.append($panel);
    }

    function populateAlignmentSelect(selector, items, idField, textField, selectedIds) {
        var selected = selectedIds || [];
        var $select = $(selector).empty();
        (items || []).forEach(function(item) {
            var id = item[idField];
            if (!id) return;
            var label = item[textField] || id;
            $select.append($('<option></option>').val(id).text(label).attr('title', id).prop('selected', selected.indexOf(id) !== -1));
        });
    }
    function competencyCandidateStatusPresentation(status) {
        var presentations = {
            APPROVED: {label: 'Approved', badge: 'badge-success', card: 'border-success', icon: 'fa-check-circle text-success'},
            REJECTED: {label: 'Rejected', badge: 'badge-danger', card: 'border-danger', icon: 'fa-times-circle text-danger'},
            DEFERRED: {label: 'Deferred', badge: 'badge-warning', card: 'border-warning', icon: 'fa-pause-circle text-warning'},
            UNALIGNED: {label: 'Unaligned', badge: 'badge-danger', card: 'border-danger', icon: 'fa-exclamation-triangle text-danger'},
            PROPOSED: {label: 'Proposed', badge: 'badge-secondary', card: 'border-light', icon: 'fa-clock-o text-muted'}
        };
        return presentations[status] || presentations.PROPOSED;
    }
    function renderCompetencyCandidates($root) {
        if (!state.coreContext || !Array.isArray(state.coreContext.approved_learning_outcomes) || !state.coreContext.approved_learning_outcomes.length) return;
        $root.append($('<div class="font-weight-bold mt-3 mb-2"></div>').text('Competency Candidates · Teacher review required'));
        if (!(state.competencyCandidates || []).length) {
            var $derive = $('<button type="button" class="btn btn-sm btn-outline-primary mb-2"></button>').text('Derive Competency Candidates');
            $derive.on('click', function() {
                $derive.prop('disabled', true).text('Deriving...');
                callBff('derive_competency_candidates', {run_id: state.runId}).then(function(result) {
                    state.competencyCandidates = result.candidates || [];
                    renderAlignmentReview(state.currentStructure);
                }).catch(function(err) {
                    $derive.prop('disabled', false).text('Derive Competency Candidates');
                    showError('Failed to derive Competency Candidates: ' + err.message, err.details);
                });
            });
            $root.append($derive);
            $root.append($('<div class="small text-muted"></div>').text('AI may propose candidates; Moodle Competencies are not created in this step.'));
            return;
        }
        (state.competencyCandidates || []).forEach(function(candidate) {
            var candidatePresentation = competencyCandidateStatusPresentation(candidate.status);
            var $card = $('<div class="border rounded p-2 mb-2 competency-candidate-card"></div>').addClass(candidatePresentation.card);
            var $statusLine = $('<div class="d-flex justify-content-between align-items-center small mb-2"></div>');
            var $candidateIdentity = $('<span class="text-muted text-truncate mr-2"></span>').text(candidate.candidate_id);
            var $statusBadge = $('<span class="badge competency-candidate-status"></span>').addClass(candidatePresentation.badge).addClass('competency-status-' + String(candidate.status || 'PROPOSED').toLowerCase());
            var $statusIcon = $('<i class="fa mr-1" aria-hidden="true"></i>').addClass(candidatePresentation.icon);
            $statusBadge.append($statusIcon).append(document.createTextNode(candidatePresentation.label));
            $statusLine.append($candidateIdentity).append($statusBadge);
            $card.append($statusLine);
            var $name = $('<input type="text" class="form-control form-control-sm mb-1">').val(candidate.name || '');
            var $description = $('<textarea class="form-control form-control-sm mb-1" rows="2"></textarea>').val(candidate.description || '');
            $card.append($name).append($description);
            $card.append($('<div class="small mb-2"></div>').text('Derived from approved Outcomes: ' + (((candidate.derived_from_outcome_ids || []).map(outcomeDisplayLabel)).join(' | ') || 'None')));
            var $candidateOutcomes = $('<select class="form-control form-control-sm mb-2" multiple size="4"></select>');
            (state.coreContext.approved_learning_outcomes || []).forEach(function(outcome) {
                $candidateOutcomes.append($('<option></option>').val(outcome.outcome_id).text(outcomeDisplayLabel(outcome.outcome_id)).attr('title', outcome.outcome_id).prop('selected', (candidate.derived_from_outcome_ids || []).indexOf(outcome.outcome_id) !== -1));
            });
            $card.append($('<div class="small mb-2"></div>').text('Teacher may clear mappings to request UNALIGNED review.'));
            var candidateDecisionInFlight = false;
            function applyCandidateStatusPresentation(nextCandidate) {
                candidate = nextCandidate;
                var presentation = competencyCandidateStatusPresentation(candidate.status);
                $card.removeClass('border-light border-success border-danger border-warning').addClass(presentation.card);
                $statusBadge.removeClass('badge-secondary badge-success badge-danger badge-warning competency-status-proposed competency-status-approved competency-status-rejected competency-status-deferred competency-status-unaligned')
                    .addClass(presentation.badge).addClass('competency-status-' + String(candidate.status || 'PROPOSED').toLowerCase()).empty();
                $statusIcon = $('<i class="fa mr-1" aria-hidden="true"></i>').addClass(presentation.icon);
                $statusBadge.append($statusIcon).append(document.createTextNode(presentation.label));
                $approve.prop('disabled', candidate.status === 'APPROVED').text(candidate.status === 'APPROVED' ? 'Approved' : 'Approve Candidate');
                $reject.prop('disabled', candidate.status === 'REJECTED').text(candidate.status === 'REJECTED' ? 'Rejected' : 'Reject');
                $defer.prop('disabled', candidate.status === 'DEFERRED').text(candidate.status === 'DEFERRED' ? 'Deferred' : 'Defer');
            }
            function decide(action, override) {
                if (candidateDecisionInFlight) return Promise.resolve(null);
                candidateDecisionInFlight = true;
                $actions.find('button').prop('disabled', true);
                var decision = {
                    action: action,
                    expected_revision: candidate.revision,
                    expected_context_revision: state.coreContext.revision,
                    name: $name.val(),
                    description: $description.val(),
                    derived_from_outcome_ids: $candidateOutcomes.val() || []
                };
                if (override) decision.teacher_override = override;
                return callBff('decide_competency_candidate', {run_id: state.runId, candidate_id: candidate.candidate_id, decision: JSON.stringify(decision)}).then(function(result) {
                    state.competencyCandidates = (state.competencyCandidates || []).map(function(item) { return item.candidate_id === candidate.candidate_id ? result.candidate : item; });
                    if (result.candidate.status === 'UNALIGNED') renderAlignmentReview(state.currentStructure);
                    else applyCandidateStatusPresentation(result.candidate);
                }).catch(function(err) {
                    var code = err.details && err.details.error && err.details.error.code;
                    if (code === 'COMPETENCY_CANDIDATE_REVISION_CONFLICT') {
                        return reloadInstructionalDesignAuthority().then(function() {
                            if (state.currentStructure) renderAlignmentReview(state.currentStructure);
                            showError('Candidate or approved Outcome authority changed. The latest server state has been reloaded; review it before retrying.', err.details);
                        }).catch(function(reloadErr) {
                            candidateDecisionInFlight = false;
                            if (state.currentStructure) renderAlignmentReview(state.currentStructure);
                            showError('Candidate authority changed, but the latest server state could not be reloaded. Check connectivity and retry the reload before deciding again.', reloadErr.details || err.details);
                        });
                    }
                    candidateDecisionInFlight = false;
                    $actions.find('button').prop('disabled', false);
                    throw err;
                });
            }
            var $actions = $('<div class="d-flex flex-wrap"></div>');
            var $edit = $('<button type="button" class="btn btn-sm btn-outline-secondary mr-2 mb-1"></button>').text('Save Candidate edit');
            $edit.on('click', function() { $edit.prop('disabled', true).text('Saving...'); decide('edit').catch(function(err) { $edit.prop('disabled', false).text('Save Candidate edit'); showError('Failed to edit Candidate: ' + err.message, err.details); }); });
            $actions.append($edit);
            var $approve = $('<button type="button" class="btn btn-sm btn-primary mr-2 mb-1"></button>').text('Approve Candidate');
            $approve.on('click', function() { $approve.prop('disabled', true).text('Saving...'); decide('approve').catch(function(err) { $approve.prop('disabled', false).text('Approve Candidate'); showError('Failed to approve Candidate: ' + err.message, err.details); }); });
            $actions.append($approve);
            var $reject = $('<button type="button" class="btn btn-sm btn-outline-danger mr-2 mb-1"></button>').text('Reject');
            $reject.on('click', function() { $reject.prop('disabled', true); decide('reject').catch(function(err) { $reject.prop('disabled', false); showError('Failed to reject Candidate: ' + err.message, err.details); }); });
            $actions.append($reject);
            var $defer = $('<button type="button" class="btn btn-sm btn-outline-warning mb-1"></button>').text('Defer');
            $defer.on('click', function() { $defer.prop('disabled', true); decide('defer').catch(function(err) { $defer.prop('disabled', false); showError('Failed to defer Candidate: ' + err.message, err.details); }); });
            $actions.append($defer);
            if (candidate.status === 'UNALIGNED') {
                var $override = $('<label class="small d-block mt-2"></label>');
                var $ack = $('<input type="checkbox" class="mr-1">');
                var $reason = $('<input type="text" class="form-control form-control-sm mt-1" placeholder="Reason for approving an unaligned Candidate">');
                $override.append($ack).append(' Teacher override required before approval');
                $card.append($override).append($reason);
                $approve.off('click').on('click', function() {
                    if (!$ack.is(':checked') || !$reason.val().trim()) { showError('A Teacher override acknowledgment and reason are required.'); return; }
                    $approve.prop('disabled', true).text('Saving...');
                    decide('approve', {acknowledged: true, reason: $reason.val().trim()}).catch(function(err) { $approve.prop('disabled', false).text('Approve Candidate'); showError('Failed to approve Candidate: ' + err.message, err.details); });
                });
            }
            $card.append($actions);
            applyCandidateStatusPresentation(candidate);
            $root.append($card);
        });
    }
    function weekReviewEntry(section) {
        var reviews = state.currentStructure && Array.isArray(state.currentStructure.week_reviews) ? state.currentStructure.week_reviews : [];
        return reviews.find(function(review) { return review.section_ref === section.ref; }) || null;
    }

    function weekReviewStatus(section) {
        var entry = weekReviewEntry(section);
        if (section.alignment_status === 'STALE_ALIGNMENT' || currentAlignmentIsStale()) return 'Stale';
        return entry ? entry.status : 'Pending review';
    }

    function weekStatusPresentation(status) {
        var badges = {'Pending review': 'badge-secondary', 'Ready to configure': 'badge-info', 'In progress': 'badge-primary', 'Ready': 'badge-success', 'Stale': 'badge-warning'};
        return {label: Object.prototype.hasOwnProperty.call(badges, status) ? status : 'Pending review', badge: badges[status] || 'badge-secondary'};
    }

    /**
     * Format the label for a section/week based on its title and position.
     */
    function weekDisplayLabel(section) {
        return /^week\s+\d+/i.test(section.title || '') ? section.title : ('Week ' + section.position + ' · ' + (section.title || 'Untitled'));
    }

    /**
     * Update Week nav active/ARIA state in-place without rebuilding the rail DOM.
     */
    function updateWeekNavSelection(newRef) {
        var $rail = $('.week-review-rail');
        if (!$rail.length) return;
        $rail.find('.week-review-nav-item').each(function(index, element) {
            var $item = $(element);
            var isNew = $item.attr('data-week-ref') === newRef;
            $item.toggleClass('active week-nav-current', isNew)
                 .attr('aria-current', isNew ? 'true' : 'false');
        });
    }

    /**
     * Update one Week review badge in-place so the rail node and scroll position stay stable.
     */
    function updateWeekNavReviewStatus(sectionRef) {
        var sections = state.currentStructure && state.currentStructure.content && Array.isArray(state.currentStructure.content.sections)
            ? state.currentStructure.content.sections
            : [];
        var section = sections.find(function(item) { return item.ref === sectionRef; });
        if (!section) return;
        var presentation = weekStatusPresentation(weekReviewStatus(section));
        $('.week-review-rail').find('.week-review-nav-item').each(function(index, element) {
            var $item = $(element);
            if ($item.attr('data-week-ref') !== sectionRef) return;
            $item.find('.badge')
                .removeClass('badge-secondary badge-info badge-primary badge-success badge-warning')
                .addClass(presentation.badge)
                .text(presentation.label);
        });
    }

    /**
     * Render only the workspace content for the currently selected week.
     * The $workspace container is cleared and re-populated; the rail shell is preserved.
     */
    function renderWeekWorkspaceContent(sections, $workspace) {
        $workspace.empty();
        var selectedWeek = sections.find(function(section) { return section.ref === state.selectedWeekRef; });
        if (!selectedWeek) return;
        var selectedWeekLabel = weekDisplayLabel(selectedWeek);
        $workspace.append($('<div class="week-selected-context alert alert-primary py-2 px-3 mb-3"></div>')
            .append($('<div class="small text-uppercase font-weight-bold"></div>').text('Currently reviewing'))
            .append($('<div class="font-weight-bold"></div>').text(selectedWeekLabel)));
        var visibleSections = sections.filter(function(section) { return section.ref === state.selectedWeekRef; });
        visibleSections.forEach(function(sec) {
            var idx = sections.indexOf(sec);
            renderSectionCard(sec, idx, $workspace);
        });
        if (state.selectedWeekRef) {
            var recoveryIndex = sections.findIndex(function(section) { return section.ref === state.selectedWeekRef; });
            if (recoveryIndex >= 0) {
                showRecoveryBanner('structure-week', state.selectedWeekRef, state.structureRevision, function(payload) {
                    openEditSectionModal(recoveryIndex, payload);
                }, $workspace);
            }
        }
    }

    /**
     * Render a single section card with edit/delete/review controls.
     * Extracted from renderPreview so both full and partial renders share the same code.
     */
    function renderSectionCard(sec, idx, $cards) {
        var secNum = idx + 1;
        var $secCard = $('<div class="card mb-3 border-light bg-light"></div>');
        var $secHeader = $('<div class="card-header bg-white d-flex justify-content-between align-items-center py-2"></div>');
        $secHeader.append($('<span class="font-weight-bold"></span>').text(secNum + '. ' + (sec.title || 'Section ' + secNum)));

        var $editBtn = $('<button type="button" class="btn btn-sm btn-link text-secondary p-0"><i class="fa fa-pencil mr-1"></i>Edit</button>');
        $editBtn.on('click', function() {
            guardedNavigate(function() { openEditSectionModal(idx); });
        });
        $secHeader.append($editBtn);
        var $deleteBtn = $('<button type="button" class="btn btn-sm btn-link text-danger p-0 ml-2"><i class="fa fa-trash mr-1"></i>Delete</button>');
        $deleteBtn.on('click', function(e) {
            e.preventDefault();
            deleteSection(idx);
        });
        $secHeader.append($deleteBtn);
        $secCard.append($secHeader);

        var $secBody = $('<div class="card-body py-2 px-3"></div>');
        if (sec.summary) {
            $secBody.append($('<p class="text-muted small mb-2"></p>').text(sec.summary));
        }

        if (!state.stagedMode) {
            var activities = sec.activities || [];
            if (activities.length > 0) {
                var $actList = $('<ul class="list-group list-group-flush mb-0"></ul>');
                activities.forEach(function(act) {
                    var isQuiz = (act.type === 'quiz');
                    var icon = isQuiz ? 'fa-question-circle text-info' : 'fa-file-text text-success';
                    var typeLabel = isQuiz ? 'Quiz' : 'Assignment';
                    var $li = $('<li class="list-group-item bg-transparent py-1 px-0 border-0 d-flex align-items-center small"></li>');
                    $li.append($('<i class="fa ' + icon + ' mr-2"></i>'));
                    $li.append($('<span></span>').text(typeLabel + ': ' + (act.title || 'Untitled')));
                    $actList.append($li);
                });
                $secBody.append($actList);
                activities.forEach(function(act) {
                    if (act.type !== 'quiz') return;
                    var $quizPreview = $('<div class="border rounded bg-light p-2 mt-2 small"></div>');
                    renderQuizActivityPreview(act, $quizPreview);
                    $secBody.append($quizPreview);
                });
            }
        }

        $secCard.append($secBody);
        if (state.stagedMode && state.currentStructure) {
            var status = weekReviewStatus(sec);
            var $review = $('<button type="button" class="btn btn-sm btn-outline-primary mt-2 week-mark-reviewed"></button>').text('Mark Reviewed');
            var outcomesReady = !(state.outcomeReviews || []).some(function(item) { return item.status === 'NEEDS_REVISION' || (item.item_type === 'LO' && item.status !== 'REVIEWED'); }) && unapprovedSourceOutcomes().length === 0;
            $review.prop('disabled', status !== 'Pending review' || !outcomesReady);
            $review.on('click', function() {
                $review.prop('disabled', true);
                callBff('mark_week_reviewed', {run_id: state.runId, section_ref: sec.ref, revision: state.structureRevision}).then(function(result) {
                    state.currentStructure = result.structure_revision;
                    state.structureRevision = result.structure_revision.revision;
                    state.currentEnvelope = structurePreviewEnvelope(state.currentStructure);
                    updateWeekNavReviewStatus(sec.ref);
                    updateWeekNavSelection(state.selectedWeekRef);
                    var $workspace = $('.week-review-workspace');
                    if ($workspace.length) {
                        renderWeekWorkspaceContent(state.currentEnvelope.content.sections || [], $workspace);
                    }
                    renderAlignmentReview(state.currentStructure);
                    updateStructureContinueState();
                }).catch(function(err) {
                    $review.prop('disabled', false);
                    showError('Failed to mark Week reviewed: ' + err.message, err.details);
                });
            });
            $secBody.append($review);
        }
        $cards.append($secCard);
    }

    /**
     * Perform a partial week selection update: updates state, URL, nav, and workspace
     * without rebuilding the entire workbench shell (rail, course header, warnings).
     */
    function selectWeekPartial(newRef) {
        var sections = (state.currentEnvelope && state.currentEnvelope.content && state.currentEnvelope.content.sections) || [];
        if (!sections.some(function(s) { return s.ref === newRef; })) return;
        state.selectedWeekRef = newRef;
        var url = new URL(window.location.href);
        url.searchParams.set('week_ref', newRef);
        window.history.replaceState(null, '', url.toString());
        updateWeekNavSelection(newRef);
        var $workspace = $('.week-review-workspace');
        if ($workspace.length) {
            renderWeekWorkspaceContent(sections, $workspace);
        }
        renderAlignmentReview(state.currentStructure || {content: {sections: sections}});
    }

    function renderAlignmentReview(structure) {
        var $root = $('#instructional-design-review');
        if (!$root.length) return;
        $root.empty();
        if (!state.stagedMode || !structure) {
            $root.addClass('d-none');
            return;
        }
        $root.removeClass('d-none');
        var $heading = $('<div class="font-weight-bold mb-2"></div>').text('Instructional Designer review · DESIGN_STRUCTURE');
        $root.append($heading);
        $root.append($('<div class="small text-muted mb-3"></div>').text('Sections are aligned to authorized Objective/Outcome IDs. Activity creation remains a separate Teacher-authorized step.'));
        var $learnerContextControl = renderLearnerContextAcknowledgmentControl(function() {
            renderAlignmentReview(state.currentStructure);
        });
        if ($learnerContextControl) $root.append($learnerContextControl);
        var sections = structure.content && Array.isArray(structure.content.sections) ? structure.content.sections : [];
        sections.filter(function(section) { return !state.selectedWeekRef || section.ref === state.selectedWeekRef; }).forEach(function(section) {
            var $card = $('<div class="border rounded p-2 mb-2"></div>');
            $card.append($('<div class="font-weight-bold"></div>').text(section.title || section.ref));
            $card.append($('<div class="small"></div>').text('LO / Objectives: ' + (((section.aligned_objective_ids || []).map(objectiveDisplayLabel)).join(' | ') || 'None')));
            $card.append($('<div class="small"></div>').text('CLO / Outcomes: ' + (((section.aligned_outcome_ids || []).map(outcomeDisplayLabel)).join(' | ') || 'None')));
            if (!(section.aligned_outcome_ids || []).length && state.coreContext && state.coreContext.source_learning_outcomes.length) {
                $card.append($("<span class=\"badge badge-danger mt-1\"></span>").text("REVIEW REQUIRED · no Outcome mapping"));
            }
            if (section.alignment_status === 'STALE_ALIGNMENT') {
                $card.append($('<span class="badge badge-warning mt-1"></span>').text('Stale · Outcome authority changed'));
            }
            $root.append($card);
        });
        var isStale = sections.some(function(section) { return section.alignment_status === 'STALE_ALIGNMENT'; });
        if (isStale) {
            var $staleAlert = $('<div class="alert alert-warning d-flex justify-content-between align-items-center mb-3"></div>');
            $staleAlert.append($('<span><i class="fa fa-exclamation-triangle mr-2"></i>Structure alignment is system-set Stale after an Outcome authority change. Revalidation recomputes alignment; Stale cannot be cleared manually.</span>'));
            var $revalidateBtn = $('<button type="button" class="btn btn-sm btn-outline-dark" id="btn-revalidate-alignment">Revalidate Alignment</button>');
            $revalidateBtn.on('click', function() {
                $revalidateBtn.prop('disabled', true).text('Revalidating...');
                callBff('rebase_structure_alignment', {run_id: state.runId}).then(function(rebaseResult) {
                    state.currentStructure = rebaseResult.structure_revision;
                    state.outcomeCoverage = rebaseResult.coverage || [];
                    state.structureRevision = rebaseResult.structure_revision.revision;
                    renderAlignmentReview(state.currentStructure);
                }).catch(function(err) {
                    var coverageDetails = err.details && err.details.error && err.details.error.details;
                    if (coverageDetails && Array.isArray(coverageDetails.coverage)) state.outcomeCoverage = coverageDetails.coverage;
                    $revalidateBtn.prop('disabled', false).text('Revalidate Alignment');
                    renderAlignmentReview(state.currentStructure);
                    showError('Failed to revalidate alignment: ' + err.message, err.details);
                });
            });
            $staleAlert.append($revalidateBtn);
            $root.append($staleAlert);
        }
        renderOutcomeReviewWorkbench();
        renderCompetencyCandidates($root);
        renderExternalCoverageControls($root);
        updateStructureContinueState();
    }

    function applyPlanRevision(plan, preview) {
        state.currentEnvelope = plan.rawEnvelope;
        state.requiresAiReview = (plan.reviewRequirements || []).some(function(item) { return item && item.code; });
        $('#ack-ai-expanded-content').prop('checked', false);
        $('#ai-review-ack-area').toggleClass('d-none', !state.requiresAiReview);
        $('#btn-approve-execute').prop('disabled', state.requiresAiReview);
        renderPreview(preview, plan.rawEnvelope);
    }

    function renderPreview(preview, envelope) {
        state.currentPreview = preview;
        if (envelope) {
            state.currentEnvelope = envelope;
        }

        var course = preview.content ? preview.content.course : (envelope ? envelope.content.course : {});
        $('#preview-course-title').text(course.title || preview.title || 'Untitled Course');
        $('#preview-course-summary').text(course.summary || preview.summary || '');

        var sections = (preview.content && preview.content.sections) ? preview.content.sections : (envelope && envelope.content && envelope.content.sections ? envelope.content.sections : []);
        var $container = $('#preview-sections-container');
        $container.empty();
        var $cards = $container;
        if (state.stagedMode && sections.length) {
            if (!sections.some(function(section) { return section.ref === state.selectedWeekRef; })) state.selectedWeekRef = sections[0].ref;
            var $layout = $('<div class="row week-review-workbench"></div>');
            var $rail = $('<nav class="col-md-6 mb-3 week-review-rail" aria-label="Week review"></nav>');
            var $workspace = $('<div class="col-md-6 week-review-workspace"></div>');
            $rail.append($('<div class="week-rail-heading small text-uppercase text-muted font-weight-bold px-2 py-2"></div>').text('Course weeks'));
            var $navList = $('<div class="week-review-nav-list"></div>');
            sections.forEach(function(section) {
                var presentation = weekStatusPresentation(weekReviewStatus(section));
                var label = weekDisplayLabel(section);
                var $week = $('<button type="button" class="list-group-item list-group-item-action text-left week-review-nav-item"></button>')
                    .attr('data-week-ref', section.ref).attr('aria-current', section.ref === state.selectedWeekRef ? 'true' : 'false')
                    .toggleClass('active week-nav-current', section.ref === state.selectedWeekRef)
                    .append($('<span class="d-block font-weight-bold"></span>').text(label))
                    .append($('<span class="badge mt-1"></span>').addClass(presentation.badge).text(presentation.label));
                $week.on('click', function() {
                    guardedNavigate(function() {
                        selectWeekPartial(section.ref);
                    });
                });
                $navList.append($week);
            });
            $rail.append($navList);
            $layout.append($rail).append($workspace);
            $container.append($layout);
            $cards = $workspace;
            renderWeekWorkspaceContent(sections, $workspace);
        } else {
            // Non-staged mode: render all sections inline
            var visibleSections = sections;
            visibleSections.forEach(function(sec) {
                var idx = sections.indexOf(sec);
                renderSectionCard(sec, idx, $cards);
            });
        }

        showRecoveryBanner('course-identity', 'course', courseIdentityDraftRevision(), openEditCourseTitleModal);

        renderAlignmentReview(state.currentStructure || {content: {sections: sections}});

        // Warnings & Assumptions
        var $warnList = $('#preview-warnings-list');
        $warnList.empty();
        var warnings = preview.warnings || [];
        var assumptions = preview.assumptions || [];
        var combined = warnings.concat(assumptions);

        if (combined.length === 0) {
            $warnList.append($('<li class="text-muted font-italic">No warnings or special assumptions noted.</li>'));
        } else {
            combined.forEach(function(item) {
                $warnList.append($('<li class="mb-2"><i class="fa fa-angle-right mr-1"></i> ' + $('<div>').text(item).html() + '</li>'));
            });
        }
    }

    function courseIdentityDraftRevision() {
        if (state.stagedMode) return Number(state.structureRevision);
        return Number(state.currentEnvelope && state.currentEnvelope.revision ? state.currentEnvelope.revision : state.revision);
    }

    function persistCourseIdentityDraft() {
        writeRecoverySnapshot('course-identity', 'course', courseIdentityDraftRevision(), {
            title: $('#input-edit-course-title').val(),
            summary: $('#input-edit-course-summary').val()
        });
    }

    function openEditCourseTitleModal(recoveredPayload) {
        var draft = recoveredPayload || null;
        var session = beginDraftSession('course-identity', 'course', courseIdentityDraftRevision(), draft ? 'restored' : 'fresh');
        if (!session.ok) {
            showRecoveryBanner('course-identity', 'course', courseIdentityDraftRevision(), openEditCourseTitleModal);
            showError(session.reason === 'conflict'
                ? 'Resolve the Draft conflict for the Course title before starting a new edit.'
                : 'Restore or discard the recoverable Course title draft before starting a new edit.');
            return;
        }
        var course = state.currentEnvelope ? state.currentEnvelope.content.course : {};
        $('#input-edit-course-title').val(draft ? draft.title || '' : (course.title || $('#preview-course-title').text()));
        $('#input-edit-course-summary').val(draft ? draft.summary || '' : (course.summary || $('#preview-course-summary').text()));
        var courseDraftDirty = Boolean(draft);
        $('#modal-edit-title input, #modal-edit-title textarea')
            .off('.ticket05draft')
            .on('input.ticket05draft change.ticket05draft', function() {
                courseDraftDirty = true;
                persistCourseIdentityDraft();
            });
        setActiveDraftGuard({
            surface: 'course-identity',
            entityRef: 'course',
            isDirty: function() { return courseDraftDirty; },
            save: function() {
                if (!$('#input-edit-course-title').val().trim()) {
                    return Promise.reject(new Error('Course title cannot be empty.'));
                }
                return saveCourseTitle();
            },
            discard: function() {
                courseDraftDirty = false;
                $('#modal-edit-title').modal('hide');
            }
        });
        $('#modal-edit-title').modal('show');
    }

    function saveCourseTitle() {
        var newTitle = $('#input-edit-course-title').val().trim();
        var newSummary = $('#input-edit-course-summary').val().trim();

        if (!newTitle) {
            alert('Course title cannot be empty.');
            return null;
        }

        $('#modal-edit-title').modal('hide');

        var newEnvelope = JSON.parse(JSON.stringify(state.currentEnvelope));
        newEnvelope.title = newTitle;
        newEnvelope.content.course.title = newTitle;
        contractHelpers.setOptionalString(newEnvelope.content.course, 'summary', newSummary);
        if (newSummary) {
            newEnvelope.summary = newSummary;
        }

        if (state.stagedMode) {
            var structure = JSON.parse(JSON.stringify(state.currentStructure));
            structure.title = newTitle;
            structure.summary = newSummary || structure.summary;
            structure.content.course.title = newTitle;
            contractHelpers.setOptionalString(structure.content.course, 'summary', newSummary);
            return saveStructureRevision(structure).then(function(result) {
                clearRecoverySnapshotAfterSave('course-identity', 'course');
                clearActiveDraftGuard('course-identity', 'course');
                return result;
            }).catch(function(err) {
                showError('Failed to save revised course structure: ' + err.message, err.details);
                throw err;
            });
        }

        return callBff('save_revision', {
            plan_id: state.planId,
            envelope: JSON.stringify(newEnvelope),
            summary: 'Updated course title and summary'
        }).then(function(res) {
            clearRecoverySnapshotAfterSave('course-identity', 'course');
            clearActiveDraftGuard('course-identity', 'course');
            applyPlanRevision(res.plan, res.preview);
            return res;
        }).catch(function(err) {
            showError('Failed to save revised course title: ' + err.message, err.details);
            throw err;
        });
    }

    function persistStructureDraft(index) {
        var sections = state.currentEnvelope && state.currentEnvelope.content ? state.currentEnvelope.content.sections || [] : [];
        var sec = sections[index];
        if (!sec) return;
        var payload = {
            title: $('#input-edit-section-title').val(),
            summary: $('#input-edit-section-summary').val(),
            aligned_objective_ids: $('#input-edit-section-objectives').val() || [],
            aligned_outcome_ids: $('#input-edit-section-outcomes').val() || []
        };
        writeRecoverySnapshot('structure-week', sec.ref, state.structureRevision, payload);
    }

    function openEditSectionModal(index, recoveredPayload) {
        var sections = state.currentEnvelope.content.sections || [];
        var sec = sections[index] || {};
        var draft = recoveredPayload || null;
        var session = beginDraftSession('structure-week', sec.ref, state.structureRevision, draft ? 'restored' : 'fresh');
        if (!session.ok) {
            showRecoveryBanner('structure-week', sec.ref, state.structureRevision, function(payload) {
                openEditSectionModal(index, payload);
            });
            showError(session.reason === 'conflict'
                ? 'Resolve the Draft conflict for this Week before starting a new edit.'
                : 'Restore or discard the recoverable Week draft before starting a new edit.');
            return;
        }
        $('#input-edit-section-index').val(index);
        $('#input-edit-section-title').val(draft ? draft.title || '' : sec.title || '');
        $('#input-edit-section-summary').val(draft ? draft.summary || '' : sec.summary || '');
        var objectives = state.coreContext && Array.isArray(state.coreContext.learning_objectives) ? state.coreContext.learning_objectives : [];
        var approvedOutcomes = state.coreContext && Array.isArray(state.coreContext.approved_learning_outcomes) ? state.coreContext.approved_learning_outcomes : [];
        var sourceOutcomes = state.coreContext && Array.isArray(state.coreContext.source_learning_outcomes) ? state.coreContext.source_learning_outcomes : [];
        populateAlignmentSelect('#input-edit-section-objectives', objectives, 'objective_id', 'source_text', sec.aligned_objective_ids || []);
        populateAlignmentSelect(
            '#input-edit-section-outcomes',
            approvedOutcomes.length ? approvedOutcomes : sourceOutcomes,
            approvedOutcomes.length ? 'outcome_id' : 'source_outcome_id',
            approvedOutcomes.length ? 'text' : 'source_text',
            draft && Array.isArray(draft.aligned_outcome_ids) ? draft.aligned_outcome_ids : (sec.aligned_outcome_ids || [])
        );
        if (draft && Array.isArray(draft.aligned_objective_ids)) {
            $('#input-edit-section-objectives').val(draft.aligned_objective_ids);
        }
        var structureDraftDirty = Boolean(draft);
        $('#modal-edit-section input, #modal-edit-section textarea, #modal-edit-section select')
            .off('.ticket05draft')
            .on('input.ticket05draft change.ticket05draft', function() {
                structureDraftDirty = true;
                persistStructureDraft(index);
            });
        setActiveDraftGuard({
            surface: 'structure-week',
            entityRef: sec.ref,
            isDirty: function() { return structureDraftDirty; },
            save: function() {
                if (!$('#input-edit-section-title').val().trim()) {
                    return Promise.reject(new Error('Section title cannot be empty.'));
                }
                return saveSection();
            },
            discard: function() {
                structureDraftDirty = false;
                $('#modal-edit-section').modal('hide');
            }
        });
        $('#modal-edit-section').modal('show');
    }

    function saveSection() {
        var index = parseInt($('#input-edit-section-index').val(), 10);
        var newTitle = $('#input-edit-section-title').val().trim();
        var newSummary = $('#input-edit-section-summary').val().trim();
        var newObjectiveIds = $('#input-edit-section-objectives').val() || [];
        var newOutcomeIds = $('#input-edit-section-outcomes').val() || [];

        if (!newTitle) {
            alert('Section title cannot be empty.');
            return null;
        }

        $('#modal-edit-section').modal('hide');

        var newEnvelope = JSON.parse(JSON.stringify(state.currentEnvelope));
        if (!newEnvelope.content.sections[index]) {
            return null;
        }
        newEnvelope.content.sections[index].title = newTitle;
        newEnvelope.content.sections[index].aligned_objective_ids = newObjectiveIds;
        newEnvelope.content.sections[index].aligned_outcome_ids = newOutcomeIds;
        contractHelpers.setOptionalString(newEnvelope.content.sections[index], 'summary', newSummary);

        if (state.stagedMode) {
            var structure = JSON.parse(JSON.stringify(state.currentStructure));
            structure.content.sections[index].title = newTitle;
            structure.content.sections[index].summary = newSummary;
            structure.content.sections[index].aligned_objective_ids = newObjectiveIds;
            structure.content.sections[index].aligned_outcome_ids = newOutcomeIds;
            structure.content.sections[index].alignment_status = 'CURRENT';
            return saveStructureRevision(structure).then(function(result) {
                clearRecoverySnapshotAfterSave('structure-week', newEnvelope.content.sections[index].ref);
                clearActiveDraftGuard('structure-week', newEnvelope.content.sections[index].ref);
                return result;
            }).catch(function(err) {
                showError('Failed to save revised course structure section: ' + err.message, err.details);
                throw err;
            });
        }

        return callBff('save_revision', {
            plan_id: state.planId,
            envelope: JSON.stringify(newEnvelope),
            summary: 'Updated section ' + (index + 1) + ' title'
        }).then(function(res) {
            clearRecoverySnapshotAfterSave('structure-week', newEnvelope.content.sections[index].ref);
            clearActiveDraftGuard('structure-week', newEnvelope.content.sections[index].ref);
            applyPlanRevision(res.plan, res.preview);
            return res;
        }).catch(function(err) {
            showError('Failed to save revised section: ' + err.message, err.details);
            throw err;
        });
    }

    function deleteSection(index) {
        var sections = state.currentEnvelope && state.currentEnvelope.content ? state.currentEnvelope.content.sections || [] : [];
        if (sections.length <= 1) {
            alert('At least one section must remain.');
            return;
        }
        var section = sections[index];
        if (!section || !window.confirm('Delete section "' + (section.title || ('Section ' + (index + 1))) + '"?')) {
            return;
        }

        var newEnvelope = contractHelpers.removeSection(state.currentEnvelope, index);
        if (!newEnvelope) {
            return;
        }

        if (state.stagedMode) {
            var structure = JSON.parse(JSON.stringify(state.currentStructure));
            structure.content.sections.splice(index, 1);
            contractHelpers.normalizeSectionPositions(structure.content.sections);
            saveStructureRevision(structure).catch(function(err) {
                showError('Failed to delete course structure section: ' + err.message, err.details);
            });
            return;
        }

        callBff('save_revision', {
            plan_id: state.planId,
            envelope: JSON.stringify(newEnvelope),
            summary: 'Deleted section ' + (index + 1)
        }).then(function(res) {
            applyPlanRevision(res.plan, res.preview);
        }).catch(function(err) {
            showError('Failed to delete section: ' + err.message, err.details);
        });
    }

    function deleteActivity(sectionIndex, activityIndex) {
        var sections = state.currentEnvelope && state.currentEnvelope.content ? state.currentEnvelope.content.sections || [] : [];
        var section = sections[sectionIndex];
        var activity = section && section.activities ? section.activities[activityIndex] : null;
        if (!activity || !window.confirm('Remove ' + (activity.type === 'quiz' ? 'quiz' : 'assignment') + ' "' + (activity.title || 'Untitled') + '"?')) {
            return;
        }

        var newEnvelope = contractHelpers.removeActivity(state.currentEnvelope, sectionIndex, activityIndex);
        if (!newEnvelope) {
            return;
        }

        callBff('save_revision', {
            plan_id: state.planId,
            envelope: JSON.stringify(newEnvelope),
            summary: 'Removed activity from section ' + (sectionIndex + 1)
        }).then(function(res) {
            applyPlanRevision(res.plan, res.preview);
        }).catch(function(err) {
            showError('Failed to remove activity: ' + err.message, err.details);
        });
    }

    function addSection() {
        var newEnvelope = JSON.parse(JSON.stringify(state.currentEnvelope));
        var sections = newEnvelope.content.sections || [];
        var descriptor = contractHelpers.nextSectionDescriptor(sections);
        newEnvelope.content.sections.push({
            ref: descriptor.ref,
            position: descriptor.position,
            title: 'New Section ' + descriptor.number,
            source_refs: [],
            activities: []
        });

        if (state.stagedMode) {
            var structure = JSON.parse(JSON.stringify(state.currentStructure));
            structure.content.sections.push({
                ref: descriptor.ref,
                position: descriptor.position,
                title: 'New Section ' + descriptor.number,
                summary: 'New section',
                source_refs: [],
                activity_intents: []
            });
            saveStructureRevision(structure).catch(function(err) {
                showError('Failed to add course structure section: ' + err.message, err.details);
            });
            return;
        }

        callBff('save_revision', {
            plan_id: state.planId,
            envelope: JSON.stringify(newEnvelope),
            summary: 'Added section ' + descriptor.number
        }).then(function(res) {
            applyPlanRevision(res.plan, res.preview);
        }).catch(function(err) {
            showError('Failed to add section: ' + err.message, err.details);
        });
    }

    function refreshCompetencyMappings($container, editable) {
        var runId = state.runId;
        $container.empty().append($('<h5></h5>').text('Competency mappings and evidence'));
        var $body = $('<div></div>');
        $container.append($('<p class="small text-muted"></p>').text('Outcome alignment proposes a mapping. Confirm the mapping first, then separately decide whether this Activity may serve as Competency Evidence.'));
        var $refresh = $('<button type="button" class="btn btn-sm btn-outline-secondary mb-2"></button>').text('Refresh mappings');
        $refresh.on('click', function() { refreshCompetencyMappings($container, editable); });
        $container.append($refresh).append($body);
        return callBff('get_competency_mappings', {run_id: runId}).then(function(review) {
            if (state.runId !== runId) return;
            $body.empty();
            if (!review.mappings.length) $body.append($('<p class="small"></p>').text('No mapping candidates yet. Generate an Activity and approve a Competency that shares its selected Outcome.'));
            review.mappings.forEach(function(pair) {
                var $row = $('<div class="border rounded p-2 mb-2 competency-mapping-pair"></div>');
                $row.append($('<div class="font-weight-bold"></div>').text(pair.activityTitle + ' → ' + pair.competencyTitle));
                $row.append($('<div class="small"></div>').text('Shared Outcomes: ' + pair.outcomes.map(function(o) { return o.text; }).join(' · ')));
                $row.append($('<div class="small mb-2"></div>').text('Mapping: ' + pair.mapping + ' · Evidence eligibility: ' + pair.evidence));
                if (pair.mapping === 'STALE') $row.append($('<p class="text-warning small"></p>').text('The Activity or Competency changed. Review and confirm the current mapping again; evidence requires a new decision.'));
                if (editable && pair.available) {
                    function action(label, kind, decision, disabled) {
                        var $button = $('<button type="button" class="btn btn-sm btn-outline-primary mr-2 mb-1"></button>').text(label).prop('disabled', Boolean(disabled));
                        $button.on('click', function() {
                            $row.find('button').prop('disabled', true);
                            callBff('decide_competency_mapping', {run_id: runId, activity_id: pair.activityId, competency_id: pair.competencyId,
                                kind: kind, decision: decision, confirmed: 1, expected_revision: review.revision
                            }).then(function() { refreshCompetencyMappings($container, editable); }).catch(function(err) {
                                showError('Mapping decision was not saved: ' + err.message, err.details);
                                refreshCompetencyMappings($container, editable);
                            });
                        });
                        $row.append($button);
                    }
                    action('Confirm mapping', 'mapping', 'CONFIRMED', pair.mapping === 'CONFIRMED');
                    action('Decline mapping', 'mapping', 'DECLINED', pair.mapping === 'DECLINED');
                    action('Confirm evidence eligibility', 'evidence', 'CONFIRMED', pair.mapping !== 'CONFIRMED' || pair.evidence === 'CONFIRMED');
                    action('Decline evidence eligibility', 'evidence', 'DECLINED', pair.mapping !== 'CONFIRMED' || pair.evidence === 'DECLINED');
                }
                $body.append($row);
            });
        }).catch(function(err) {
            $body.empty().append($('<div class="alert alert-warning"></div>').text('Could not load mapping review: ' + err.message));
        });
    }

    function populateApproveView() {
        var $mappingReview = $('#approve-competency-mapping-review');
        if (!$mappingReview.length) {
            $mappingReview = $('<div id="approve-competency-mapping-review" class="card card-body mb-3"></div>');
            $('#approve-activity-overview').after($mappingReview);
        }
        refreshCompetencyMappings($mappingReview, false);
        var course = state.currentEnvelope ? state.currentEnvelope.content.course : {};
        $('#approve-summary-title').text(course.title || $('#preview-course-title').text());

        var catName = $('#course-category-select option:selected').text();
        $('#approve-summary-category').text(catName);
        $('#approve-summary-format').text($('#course-format-select option:selected').text() || state.courseFormat || 'Unknown');
        $('#approve-summary-filename').text(state.selectedFile ? state.selectedFile.name : 'syllabus.txt');

        var sections = (state.currentEnvelope && state.currentEnvelope.content) ? state.currentEnvelope.content.sections : [];
        $('#approve-summary-sections').text(sections.length);

        var assignCount = 0;
        var quizCount = 0;
        var emptyCount = 0;
        var $overview = $('#approve-activity-overview');
        $overview.empty();

        sections.forEach(function(sec, index) {
            var activities = sec.activities || [];
            var labels = [];
            activities.forEach(function(act) {
                if (act.type === 'assignment') { assignCount++; labels.push('Assignment'); }
                if (act.type === 'quiz') { quizCount++; labels.push('Quiz'); }
            });
            if (!activities.length) emptyCount++;

            var weekLabel = sec.title || ('Week ' + (index + 1));
            var $row = $('<div class="d-flex justify-content-between align-items-center py-2"></div>');
            if (index > 0) $row.addClass('border-top');
            $row.append($('<div class="font-weight-bold small pr-3"></div>').text(weekLabel));
            var $activityLabels = $('<div class="text-right"></div>');
            if (!labels.length) {
                $activityLabels.append($('<span class="badge badge-light border"></span>').text('No Activity'));
            } else {
                labels.forEach(function(label) {
                    $activityLabels.append($('<span class="badge badge-primary ml-1"></span>').text(label));
                });
            }
            $row.append($activityLabels);
            $overview.append($row);
            (state.activityIntents[sec.ref] || []).forEach(function(intent) {
                if (intent.activity && intent.status === 'generated') {
                    var provenance = intent.content_provenance || 'AI_GENERATED';
                    var revisionText = Number(intent.activity_revision || 0) > 0 ? ' revision ' + intent.activity_revision : '';
                    var lineageText = provenance === 'TEACHER_EDITED'
                        ? 'Teacher Edited' + revisionText + ' · source AI revision ' + (intent.source_generation_revision || '?')
                        : 'AI Generated' + revisionText;
                    $overview.append($('<div class="small font-weight-bold ml-md-3 mb-1"></div>').text((intent.activity_type || 'Activity') + ' provenance: ' + lineageText));
                }
                if (!intent.quality_review) return;
                var review = intent.quality_review;
                var reviewLabel = provenance === 'TEACHER_EDITED'
                    ? (intent.activity_type || 'Activity') + ' source AI self-review (before Teacher edit): Outcome '
                    : (intent.activity_type || 'Activity') + ' AI self-review: Outcome ';
                var reviewText = reviewLabel + (review.outcome_alignment || '—') + ', Learner fit ' + (review.learner_level_fit || '—') + ', Scope ' + (review.scope_compliance || '—') + ', Purpose ' + (review.purpose_fit || '—');
                var $review = $('<div class="small text-muted ml-md-3 mb-1"></div>').text(reviewText);
                if (intent.selected_outcome_ids && intent.selected_outcome_ids.length) $review.append($('<div></div>').text('Targets: ' + intent.selected_outcome_ids.map(outcomeDisplayLabel).join(' | ')));
                if (review.warnings && review.warnings.length) $review.append($('<div class="text-warning"></div>').text('Warnings: ' + review.warnings.join(' · ')));
                $overview.append($review);
            });
        });

        $('#approve-summary-assignments').text(assignCount);
        $('#approve-summary-quizzes').text(quizCount);
        $('#approve-summary-empty-sections').text(emptyCount);
    }

    function startUploadAndPlan() {
        if (!state.selectedFile) {
            showError('Please select a syllabus file first.');
            return;
        }
        if (!state.courseFormat) {
            showError('Please select a Moodle Course Format before generating the course structure.');
            return;
        }
        var syllabusSizeError = fileSizeValidationError(state.selectedFile, MAX_SYLLABUS_FILE_BYTES, 'Syllabus');
        if (syllabusSizeError) {
            showError(syllabusSizeError);
            return;
        }

        clearError();
        $('#btn-generate-plan').prop('disabled', true);
        $('#upload-progress-area').removeClass('d-none');
        $('#upload-progress-status').text('Uploading syllabus file...');

        var formData = new FormData();
        formData.append('syllabus_file', state.selectedFile);
        formData.append('category_id', state.selectedCategoryId);
        formData.append('course_format', state.courseFormat);

        var notes = $('#optional-notes').val().trim();
        if (notes) {
            formData.append('notes', notes);
        }

        callBff('upload_and_create_run', formData, true).then(function(runData) {
            state.runId = runData.run_id;
            var resumeUrl = new URL(window.location.href);
            resumeUrl.searchParams.set("context_run_id", state.runId);
            window.history.replaceState(null, "", resumeUrl.toString());
            showCoreContext(runData.core_course_design_context);
            state.courseFormat = runData.course_format || state.courseFormat;
            $('#course-format-select').val(state.courseFormat).prop('disabled', true);
            state.stagedMode = true;
            state.teacherInstruction = notes;
            startProgressPolling();
            $('#upload-progress-status').text('Designing course structure with AI...');
            return callBff('generate_structure', {run_id: state.runId, teacher_instruction: state.teacherInstruction});
        }).then(function(structureResult) {
            stopProgressPolling();
            state.structureRevision = structureResult.structure_revision.revision;
            state.currentStructure = structureResult.structure_revision;
            state.outcomeProposals = structureResult.outcome_proposals || [];
            state.coreContextRevision = structureResult.core_context_revision || null;
            state.currentEnvelope = structurePreviewEnvelope(state.currentStructure);
            renderPreview(state.currentEnvelope, state.currentEnvelope);
            loadOutcomeReviews().catch(function(err) { showError('Could not load Outcome review state: ' + err.message, err.details); });
            $('#upload-progress-area').addClass('d-none');
            setStep(2);
        }).catch(function(err) {
            stopProgressPolling();
            $('#upload-progress-area').addClass('d-none');
            $('#btn-generate-plan').prop('disabled', false);
            showError('Course planning failed: ' + err.message, err.details);
        });
    }

    function activityCounts() {
        var selected = 0;
        var ready = 0;
        Object.keys(state.activityIntents).forEach(function(sectionRef) {
            (state.activityIntents[sectionRef] || []).forEach(function(intent) {
                if (intent.status === 'removed') return;
                selected++;
                if (intent.status === 'generated' || intent.status === 'shell') ready++;
            });
        });
        return {selected: selected, ready: ready, remaining: Math.max(0, selected - ready)};
    }

    function allActivitiesComplete() {
        if (state.activityLoadingCount > 0) return false;
        return activityCounts().remaining === 0;
    }

    function updateActivityFinalizeState() {
        var counts = activityCounts();
        $('#activity-summary-selected').text(counts.selected);
        $('#activity-summary-ready').text(counts.ready);
        $('#activity-summary-remaining').text(counts.remaining);

        var loading = state.activityLoadingCount > 0;
        var $button = $('#btn-activity-finalize');
        if (loading) {
            $('#activity-footer-status').text('Loading Activity Structure...');
            $button.prop('disabled', true).text('Loading...');
            return;
        }
        if (counts.selected === 0) {
            $('#activity-footer-status').text('No activities selected. All weeks will be created without Quiz or Assignment.');
            $button.prop('disabled', false).html('Continue without Activities <i class="fa fa-arrow-right ml-1"></i>');
            return;
        }
        $('#activity-footer-status').text(counts.ready + ' of ' + counts.selected + ' selected activities are ready. ' + counts.remaining + ' remaining.');
        $button.prop('disabled', counts.remaining > 0).html('Finalize Activity Structure <i class="fa fa-arrow-right ml-1"></i>');
    }

    function activityStatusPresentation(intent) {
        var status = intent ? intent.status : 'not_selected';
        if (status === 'generated') return {label: 'Generated', badge: 'badge-success', dot: 'ready'};
        if (status === 'shell') return {label: 'Empty Shell', badge: 'badge-success', dot: 'ready'};
        if (status === 'creating') return {label: 'Creating...', badge: 'badge-primary', dot: 'creating'};
        if (status === 'insufficient_evidence') return {label: 'Insufficient evidence', badge: 'badge-warning', dot: 'warning'};
        if (status === 'timed_out') return {label: 'Timed out', badge: 'badge-warning', dot: 'warning'};
        if (status === 'failed') return {label: 'Failed', badge: 'badge-warning', dot: 'warning'};
        if (status === 'retry_exhausted') return {label: 'Retry exhausted', badge: 'badge-danger', dot: 'warning'};
        if (status === 'stale') return {label: 'Stale - regenerate', badge: 'badge-warning', dot: 'warning'};
        if (status === 'selected') return {label: 'Not generated', badge: 'badge-secondary', dot: ''};
        return {label: 'Not selected', badge: 'badge-light', dot: ''};
    }

    function finalizeStagedCourse() {
        $('#btn-activity-finalize').prop('disabled', true).text('Building final CoursePlan...');
        callBff('finalize_course_plan', {run_id: state.runId}).then(function(result) {
            state.stagedMode = false;
            state.planId = result.plan.planId;
            state.revision = result.plan.revision;
            state.currentEnvelope = result.plan.rawEnvelope;
            state.requiresAiReview = (result.plan.reviewRequirements || []).some(function(item) { return item && item.code; });
            $('#ack-ai-expanded-content').prop('checked', false);
            $('#ai-review-ack-area').toggleClass('d-none', !state.requiresAiReview);
            $('#btn-approve-execute').prop('disabled', state.requiresAiReview);
            return callBff('get_preview', {plan_id: state.planId, revision: state.revision}).then(function(preview) {
                renderPreview(preview, state.currentEnvelope);
                populateApproveView();
                renderOfficialPreview(preview, state.currentEnvelope);
                setStep(4);
            });
        }).catch(function(err) {
            updateActivityFinalizeState();
            showError('Final CoursePlan is not ready: ' + err.message, err.details);
        });
    }

    function persistActivityDraft(activityRef, baseRevision, payload) {
        writeRecoverySnapshot('activity-content', activityRef, baseRevision, payload);
    }

    function activityWeekDisplayLabel(section) {
        var title = section.title || 'Untitled week';
        return /^week\s+\d+/i.test(title) ? title : ('Week ' + section.position + ' · ' + title);
    }

    function activityWeekStatusPresentation(intents) {
        var stale = intents.some(function(intent) { return intent.status === 'stale'; });
        var ready = intents.length && intents.every(function(intent) { return intent.status === 'generated' || intent.status === 'shell'; });
        var creating = intents.some(function(intent) { return intent.status === 'creating'; });
        var label = stale ? 'Stale' : ready ? 'Ready' : creating ? 'In progress' : 'Pending review';
        var badge = label === 'Ready' ? 'badge-success' : label === 'In progress' ? 'badge-primary' : label === 'Stale' ? 'badge-warning' : 'badge-secondary';
        return {label: label, badge: badge};
    }

    function updateActivityWeekNavStatus($rail, sectionRef, intents) {
        var presentation = activityWeekStatusPresentation(intents);
        $rail.find('.activity-week-nav-item').each(function(_index, element) {
            var $week = $(element);
            if ($week.attr('data-week-ref') !== sectionRef) return;
            $week.find('.badge').removeClass('badge-success badge-primary badge-warning badge-secondary')
                .addClass(presentation.badge).text(presentation.label);
        });
    }

    function renderActivityStructureStage() {
        var renderVersion = ++state.activityRenderVersion;
        var $container = $('#activity-structure-container');
        $container.empty();
        var sections = (state.currentStructure && state.currentStructure.content && state.currentStructure.content.sections) || [];
        if (!sections.length) return;
        if (!state.selectedActivityWeekRef || !sections.some(function(section) { return section.ref === state.selectedActivityWeekRef; })) {
            state.selectedActivityWeekRef = state.selectedWeekRef && sections.some(function(section) { return section.ref === state.selectedWeekRef; }) ? state.selectedWeekRef : sections[0].ref;
        }
        var $learnerContextFallback = renderLearnerContextAcknowledgmentControl(function() {
            renderActivityStructureStage();
        });
        if ($learnerContextFallback) $container.append($learnerContextFallback);
        var $layout = $('<div class="row activity-review-workbench"></div>');
        var $rail = $('<nav class="col-lg-3 mb-3 activity-week-rail" aria-label="Activity Week navigator"></nav>');
        var $workspace = $('<section class="col-lg-6 mb-3 activity-week-workspace" aria-live="polite"></section>');
        var $inspector = $('<aside class="col-lg-3 mb-3 activity-review-inspector"></aside>');
        var $activityInspector = $('<div class="card card-body mb-3 activity-context-inspector"></div>');
        var $mappingDetails = $('<details class="card card-body p-2 mb-3 activity-mapping-inspector"></details>');
        $mappingDetails.append($('<summary class="small font-weight-bold" style="cursor:pointer;"></summary>').text('Competency mapping & evidence'));
        var $mappingControls = $('<div class="mt-2" id="activity-competency-mappings"></div>');
        $mappingDetails.append($mappingControls);
        $inspector.append($activityInspector).append($mappingDetails);
        var selectedActivityWeek = sections.find(function(section) { return section.ref === state.selectedActivityWeekRef; });
        $rail.append($('<div class="week-rail-heading small text-uppercase text-muted font-weight-bold px-2 py-2"></div>').text('Course weeks'));
        if (selectedActivityWeek) {
            var selectedActivityWeekLabel = activityWeekDisplayLabel(selectedActivityWeek);
            $workspace.append($('<div class="activity-selected-week-context alert alert-primary py-2 px-3 mb-3"></div>')
                .append($('<div class="small text-uppercase font-weight-bold"></div>').text('Currently configuring'))
                .append($('<div class="font-weight-bold"></div>').text(selectedActivityWeekLabel)));
        }
        sections.forEach(function(section) {
            var intents = state.activityIntents[section.ref] || [];
            var statusPresentation = activityWeekStatusPresentation(intents);
            var label = activityWeekDisplayLabel(section);
            var $week = $('<button type="button" class="list-group-item list-group-item-action text-left activity-week-nav-item"></button>')
                .attr('data-week-ref', section.ref).attr('aria-current', section.ref === state.selectedActivityWeekRef ? 'true' : 'false')
                .attr('title', label)
                .toggleClass('active week-nav-current', section.ref === state.selectedActivityWeekRef)
                .append($('<span class="activity-week-nav-title font-weight-bold"></span>').text(label))
                .append($('<span class="badge mt-1"></span>').addClass(statusPresentation.badge).text(statusPresentation.label));
            $week.on('click', function() {
                guardedNavigate(function() {
                    state.selectedActivityWeekRef = section.ref;
                    var url = new URL(window.location.href);
                    url.searchParams.set('activity_week_ref', section.ref);
                    window.history.replaceState(null, '', url.toString());
                    renderActivityStructureStage();
                    $('#activity-structure-container').find('.activity-week-nav-item').each(function(_index, element) {
                        var $candidate = $(element);
                        if ($candidate.attr('aria-current') === 'true') $candidate.trigger('focus');
                    });
                });
            });
            $rail.append($week);
        });
        $layout.append($rail).append($workspace).append($inspector);
        $container.append($layout);
        refreshCompetencyMappings($mappingControls, true);
        state.activityLoadingCount = sections.length;
        updateActivityFinalizeState();
        sections.filter(function(section) { return section.ref !== state.selectedActivityWeekRef; }).forEach(function(backgroundSection) {
            callBff('get_activity_intents', {run_id: state.runId, section_ref: backgroundSection.ref}).then(function(result) {
                if (renderVersion !== state.activityRenderVersion) return;
                state.activityIntents[backgroundSection.ref] = result.intents || [];
                updateActivityWeekNavStatus($rail, backgroundSection.ref, state.activityIntents[backgroundSection.ref]);
            }).catch(function(err) {
                if (renderVersion === state.activityRenderVersion) showError('Failed to load Activity state for ' + (backgroundSection.title || backgroundSection.ref) + ': ' + err.message, err.details);
            }).finally(function() {
                if (renderVersion !== state.activityRenderVersion) return;
                state.activityLoadingCount = Math.max(0, state.activityLoadingCount - 1);
                updateActivityFinalizeState();
            });
        });

        sections.filter(function(section) { return section.ref === state.selectedActivityWeekRef; }).forEach(function(section) {
            var materialState = state.sectionMaterials[section.ref] || {status: 'fallback', error: null, snapshotId: null, revision: 0, filename: null, plannedResources: []};
            state.sectionMaterials[section.ref] = materialState;

            var weekTitle = /^week\s+\d+/i.test(section.title || '') ? section.title : ('Week ' + section.position + ' — ' + (section.title || 'Untitled week'));
            var $card = $('<div class="activity-week-card card mb-4"></div>');
            var $header = $('<div class="activity-week-header px-3 py-3"></div>');
            $header.append($('<div class="font-weight-bold h6 mb-1"></div>').text(weekTitle));
            if (section.summary) $header.append($('<div class="small text-muted"></div>').text(section.summary));
            $card.append($header);

            var $body = $('<div class="card-body p-3 p-md-4"></div>');
            var $selection = $('<div class="d-flex flex-wrap align-items-center mb-3"></div>');
            $selection.append($('<div class="font-weight-bold mr-4 mb-2 mb-md-0"></div>').text('Activities'));
            var quizId = 'activity-quiz-' + section.ref;
            var assignmentId = 'activity-assignment-' + section.ref;
            var $quiz = $('<input type="checkbox" class="mr-1">').attr('id', quizId);
            var $assignment = $('<input type="checkbox" class="mr-1">').attr('id', assignmentId);
            $selection.append($('<label class="mr-4 mb-0"></label>').append($quiz).append(' Quiz'));
            $selection.append($('<label class="mr-4 mb-0"></label>').append($assignment).append(' Assignment'));
            $selection.append($('<span class="small text-muted"></span>').text('Choose either, both, or none.'));
            $body.append($selection);

            var $material = $('<div class="activity-material-zone rounded p-3 mb-4"></div>');
            var $materialTop = $('<div class="d-flex flex-wrap justify-content-between align-items-center mb-2"></div>');
            $materialTop.append($('<div class="font-weight-bold"></div>').text('Learning Material (Optional)'));
            $materialTop.append($('<span class="badge badge-light border"></span>').text('Shared by Quiz + Assignment'));
            $material.append($materialTop);
            $material.append($('<div class="small text-muted mb-1"></div>').text('Upload one file set for this week. If omitted, selected activities use the syllabus fallback policy.'));
            $material.append($('<div class="small text-muted mb-2"></div>').html('<i class="fa fa-info-circle mr-1"></i>Supported: PDF, DOCX, PPTX, TXT, MD · Maximum file size <strong>30 MB</strong>.'));
            var $materialLabel = $('<div class="small mb-2"></div>');
            var $publishResource = $('<label class="custom-control custom-checkbox small mb-2 d-block"></label>');
            var $publishResourceInput = $('<input type="checkbox" class="custom-control-input" checked>');
            $publishResourceInput.attr('id', 'publish-resource-' + section.ref);
            $publishResource.append($publishResourceInput).append($('<span class="custom-control-label"></span>').text('Include this file as a Moodle File Resource in the course'));
            var $materialControls = $('<div class="d-flex flex-wrap align-items-center"></div>');
            var $file = $('<input type="file" class="form-control-file mr-2 mb-2" style="max-width: 360px;" accept=".txt,.md,.markdown,.docx,.pdf,.pptx">');
            var $upload = $('<button type="button" class="btn btn-outline-secondary btn-sm mb-2 d-none"></button>');
            $materialControls.append($file).append($upload)
                .append($('<span class="small text-muted mb-2"></span>').text('Selecting a file saves automatically.'));
            $material.append($materialLabel).append($publishResource).append($materialControls);

            var activeTab = state.selectedActivityTabByWeek[section.ref] || 'material';
            var $tabs = $('<div class="nav nav-tabs activity-review-tabs mb-3" role="tablist"></div>');
            var $materialTab = $('<button type="button" class="nav-link" role="tab"></button>').attr('data-activity-tab', 'material').text('Material');
            var $quizTab = $('<button type="button" class="nav-link" role="tab"></button>').attr('data-activity-tab', 'quiz').text('Quiz');
            var $assignmentTab = $('<button type="button" class="nav-link" role="tab"></button>').attr('data-activity-tab', 'assignment').text('Assignment');
            $tabs.append($materialTab).append($quizTab).append($assignmentTab);
            var $materialPane = $('<div class="activity-tab-pane" data-activity-pane="material"></div>').append($material);
            var $quizPane = $('<div class="activity-tab-pane" data-activity-pane="quiz"></div>');
            var $assignmentPane = $('<div class="activity-tab-pane" data-activity-pane="assignment"></div>');
            var $quizPanel = $('<div class="activity-type-panel p-3"></div>');
            var $assignmentPanel = $('<div class="activity-type-panel p-3"></div>');
            $quizPane.append($quizPanel);
            $assignmentPane.append($assignmentPanel);
            $body.append($tabs).append($materialPane).append($quizPane).append($assignmentPane);
            [$materialTab, $quizTab, $assignmentTab].forEach(function($tab) {
                $tab.on('click', function() {
                    guardedNavigate(function() {
                        state.selectedActivityTabByWeek[section.ref] = $tab.attr('data-activity-tab');
                        renderPanels();
                    });
                });
            });
            $card.append($body);
            $workspace.append($card);

            var $quizCount = $('<input type="number" min="1" class="form-control form-control-sm" value="5">');
            var $quizType = $('<select class="form-control form-control-sm"><option value="multichoice">Multiple Choice</option><option value="truefalse">True / False</option><option value="shortanswer">Short Answer</option><option value="essay">Essay</option></select>');
            var $quizChoices = $('<input type="number" min="2" class="form-control form-control-sm" value="4">');
            var $assignmentGrade = $('<input type="number" min="1" class="form-control form-control-sm" value="100">');
            var $quizPurpose = $('<select class="form-control form-control-sm"><option value="PRACTICE">PRACTICE · practice</option><option value="FORMATIVE">FORMATIVE · check learning</option><option value="SUMMATIVE">SUMMATIVE · final assessment</option></select>');
            var $assignmentPurpose = $('<select class="form-control form-control-sm"><option value="PRACTICE">PRACTICE · practice</option><option value="FORMATIVE">FORMATIVE · check learning</option><option value="SUMMATIVE">SUMMATIVE · final assessment</option></select>');
            $quizPurpose.attr('id', 'activity-quiz-purpose-' + section.ref);
            $assignmentPurpose.attr('id', 'activity-assignment-purpose-' + section.ref);
            var alignedObjectiveIds = Array.isArray(section.aligned_objective_ids) ? section.aligned_objective_ids : [];
            var alignedOutcomeIds = Array.isArray(section.aligned_outcome_ids) ? section.aligned_outcome_ids : [];
            var alignedOutcomeLookup = {};
            alignedOutcomeIds.forEach(function(id) { alignedOutcomeLookup[id] = true; });
            var objectiveOptions = alignedObjectiveIds.map(function(id) {
                return {id: id, label: objectiveDisplayLabel(id), title: id};
            });
            var approvedOutcomeItems = state.coreContext && Array.isArray(state.coreContext.approved_learning_outcomes) ? state.coreContext.approved_learning_outcomes : [];
            var outcomeOptions = approvedOutcomeItems.length
                ? approvedOutcomeItems.slice().sort(function(a, b) {
                    return Number(Boolean(alignedOutcomeLookup[b.outcome_id])) - Number(Boolean(alignedOutcomeLookup[a.outcome_id]));
                }).map(function(item) {
                    var outsideSection = !alignedOutcomeLookup[item.outcome_id];
                    return {
                        id: item.outcome_id,
                        label: outcomeDisplayLabel(item.outcome_id) + (outsideSection ? ' · outside this Section (override required)' : ''),
                        title: item.outcome_id,
                        outsideSection: outsideSection
                    };
                })
                : alignedOutcomeIds.map(function(id) { return {id: id, label: outcomeDisplayLabel(id), title: id, outsideSection: false}; });
            var $quizObjectives = $('<select class="form-control form-control-sm" multiple size="4"></select>');
            var $assignmentObjectives = $('<select class="form-control form-control-sm" multiple size="4"></select>');
            var $quizOutcomes = $('<select class="form-control form-control-sm" multiple size="4"></select>');
            var $assignmentOutcomes = $('<select class="form-control form-control-sm" multiple size="4"></select>');
            $quizObjectives.attr('id', 'activity-quiz-objectives-' + section.ref);
            $assignmentObjectives.attr('id', 'activity-assignment-objectives-' + section.ref);
            $quizOutcomes.attr('id', 'activity-quiz-outcomes-' + section.ref);
            $assignmentOutcomes.attr('id', 'activity-assignment-outcomes-' + section.ref);
            var $quizOverrideAck = $('<input type="checkbox" class="mr-1">');
            var $assignmentOverrideAck = $('<input type="checkbox" class="mr-1">');
            var $quizMissingAlignmentAck = $('<input type="checkbox" class="mr-1">');
            var $assignmentMissingAlignmentAck = $('<input type="checkbox" class="mr-1">');
            var $quizOverrideReason = $('<input type="text" class="form-control form-control-sm mt-1" placeholder="Reason for targeting an out-of-Section Outcome">');
            var $assignmentOverrideReason = $('<input type="text" class="form-control form-control-sm mt-1" placeholder="Reason for targeting an out-of-Section Outcome">');
            var $quizPrompt = null;
            var $assignmentPrompt = null;
            var pendingIntentSave = Promise.resolve({ok: true});

            function fillMultiSelect($select, items, selected) {
                $select.empty();
                (items || []).forEach(function(item) {
                    var $option = $('<option></option>').val(item.id).text(item.label).prop('selected', (selected || []).indexOf(item.id) !== -1);
                    if (item.title) $option.attr('title', item.title);
                    if (item.outsideSection) $option.attr('data-outside-section', '1').prop('disabled', true);
                    $select.append($option);
                });
            }

            function setOutcomeOverrideAvailability($select, $overrideAck, $overrideReason) {
                var overrideReady = $overrideAck.is(':checked') && $overrideReason.val().trim() !== '';
                $select.find('option[data-outside-section="1"]').each(function() {
                    var $option = $(this);
                    $option.prop('disabled', !overrideReady);
                    if (!overrideReady) $option.prop('selected', false);
                });
                return overrideReady;
            }
            fillMultiSelect($quizObjectives, objectiveOptions, alignedObjectiveIds.length ? [alignedObjectiveIds[0]] : []);
            fillMultiSelect($assignmentObjectives, objectiveOptions, []);
            fillMultiSelect($quizOutcomes, outcomeOptions, alignedOutcomeIds.length ? [alignedOutcomeIds[0]] : []);
            fillMultiSelect($assignmentOutcomes, outcomeOptions, alignedOutcomeIds.length ? [alignedOutcomeIds[0]] : []);

            function appendSemanticControls(type, intent, $panel) {
                var isQuiz = type === 'quiz';
                var $purpose = isQuiz ? $quizPurpose : $assignmentPurpose;
                var $objectives = isQuiz ? $quizObjectives : $assignmentObjectives;
                var $outcomes = isQuiz ? $quizOutcomes : $assignmentOutcomes;
                var $overrideAck = isQuiz ? $quizOverrideAck : $assignmentOverrideAck;
                var $overrideReason = isQuiz ? $quizOverrideReason : $assignmentOverrideReason;
                var $missingAlignmentAck = isQuiz ? $quizMissingAlignmentAck : $assignmentMissingAlignmentAck;
                if (intent) {
                    $purpose.val(intent.purpose || (isQuiz ? 'PRACTICE' : 'FORMATIVE'));
                    $objectives.val(intent.selected_objective_ids || []);
                    var missingAlignmentOverride = intent.alignment_override && intent.alignment_override.kind === 'MISSING_ALIGNMENT';
                    $overrideAck.prop('checked', Boolean(intent.alignment_override && intent.alignment_override.acknowledged && !missingAlignmentOverride));
                    $overrideReason.val(!missingAlignmentOverride && intent.alignment_override && intent.alignment_override.reason || '');
                    $missingAlignmentAck.prop('checked', Boolean(missingAlignmentOverride && intent.alignment_override.acknowledged));
                    setOutcomeOverrideAvailability($outcomes, $overrideAck, $overrideReason);
                    $outcomes.val(intent.selected_outcome_ids || []);
                }
                else {
                    $purpose.val(isQuiz ? 'PRACTICE' : 'FORMATIVE');
                    setOutcomeOverrideAvailability($outcomes, $overrideAck, $overrideReason);
                }
                var $alignment = $('<div class="border rounded bg-light p-2 mb-2"></div>');
                $alignment.append($('<label class="small font-weight-bold mb-1"></label>').text('Purpose'));
                $alignment.append($purpose);
                $alignment.append($('<label class="small font-weight-bold mt-2 mb-1"></label>').text('Section-aligned LO / Objectives'));
                $alignment.append($objectives);
                $alignment.append($('<label class="small font-weight-bold mt-2 mb-1"></label>').text('Target CLO / Outcomes'));
                $alignment.append($outcomes);
                $alignment.append($('<div class="small text-muted mt-1"></div>').text('Only CLOs aligned to this Section are selectable by default. PRACTICE needs an LO or CLO; FORMATIVE/SUMMATIVE need a CLO.'));
                var $missingAlignmentWarning = $('<div class="alert alert-warning py-2 px-2 mt-2 mb-0 activity-alignment-review-warning d-none"></div>');
                $missingAlignmentWarning.append($('<div class="small font-weight-bold mb-1"></div>').text('No required LO/CLO selected'));
                $missingAlignmentWarning.append($('<div class="small mb-1"></div>').text('You may still generate, but this Activity will be marked Teacher Review Required and alignment will not be inferred.'));
                $missingAlignmentWarning.append($('<label class="small d-block mb-0"></label>').append($missingAlignmentAck).append(' Generate without alignment and require Teacher review'));
                $alignment.append($missingAlignmentWarning);
                $alignment.append($('<label class="small d-block mt-2 mb-0"></label>').append($overrideAck).append(' Allow out-of-Section Outcome / CLO (Teacher override)'));
                $alignment.append($overrideReason);
                var terminal = intent && ['creating', 'retry_exhausted'].indexOf(intent.status) !== -1;
                $purpose.prop('disabled', terminal);
                $objectives.prop('disabled', terminal);
                $outcomes.prop('disabled', terminal);
                $overrideAck.prop('disabled', terminal);
                $overrideReason.prop('disabled', terminal);
                $missingAlignmentAck.prop('disabled', terminal);
                function alignmentMissing() {
                    var objectives = $objectives.val() || [];
                    var outcomes = $outcomes.val() || [];
                    return $purpose.val() === 'PRACTICE' ? objectives.length === 0 && outcomes.length === 0 : outcomes.length === 0;
                }
                function updateMissingAlignmentWarning() {
                    var missing = alignmentMissing();
                    $missingAlignmentWarning.toggleClass('d-none', !missing);
                    if (!missing) $missingAlignmentAck.prop('checked', false);
                    return missing;
                }
                $overrideAck.off('change.scopegate').on('change.scopegate', function() {
                    setOutcomeOverrideAvailability($outcomes, $overrideAck, $overrideReason);
                });
                $overrideReason.off('input.scopegate change.scopegate').on('input.scopegate change.scopegate', function() {
                    setOutcomeOverrideAvailability($outcomes, $overrideAck, $overrideReason);
                });
                [$purpose, $objectives, $outcomes].forEach(function($control) {
                    $control.off('change.intent20').on('change.intent20', function() {
                        updateMissingAlignmentWarning();
                        saveSelection();
                    });
                });
                $missingAlignmentAck.off('change.intent20').on('change.intent20', function() {
                    updateMissingAlignmentWarning();
                    saveSelection();
                });
                updateMissingAlignmentWarning();
                $panel.append($alignment);
            }

            function getIntent(type) {
                return (state.activityIntents[section.ref] || []).find(function(intent) { return intent.activity_type === type; }) || null;
            }

            function renderActivityInspector(type, intent) {
                $activityInspector.empty();
                var label = type === 'material' ? 'Material' : type === 'quiz' ? 'Quiz' : 'Assignment';
                $activityInspector.append($('<h6 class="font-weight-bold mb-2"></h6>').text(label + ' review context'));
                if (type === 'material') {
                    var materialPresentation = materialState.status === 'failed'
                        ? {label: 'Failed', badge: 'badge-danger'}
                        : materialState.snapshotId ? {label: 'Ready', badge: 'badge-success'} : {label: 'Syllabus fallback', badge: 'badge-light'};
                    $activityInspector.append($('<span class="badge mb-2"></span>').addClass(materialPresentation.badge).text(materialPresentation.label));
                    $activityInspector.append($('<div class="small mb-1"></div>').text(materialState.snapshotId ? 'Source: sealed MaterialSnapshot' + (materialState.filename ? ' · ' + materialState.filename : '') : 'Source: sealed syllabus fallback'));
                    $activityInspector.append($('<div class="small mb-1"></div>').text('Snapshot: ' + (materialState.snapshotId || 'No MaterialSnapshot') + (materialState.revision ? ' · revision ' + materialState.revision : '')));
                    if (materialState.error) {
                        $activityInspector.append($('<div class="alert alert-warning py-2 small mb-2"></div>').text((materialState.error.code || 'MATERIAL_OPERATION_FAILED') + ': ' + (materialState.error.message || 'Learning Material operation failed.')));
                    }
                    $activityInspector.append($('<div class="small text-muted"></div>').text("The same sealed grounding source is shared by this Week's Quiz and Assignment."));
                    return;
                }
                if (!intent) {
                    $activityInspector.append($('<div class="small text-muted"></div>').text('Select ' + label + ' for this Week to review its intent, grounding, alignment and provenance.'));
                    return;
                }
                var presentation = activityStatusPresentation(intent);
                $activityInspector.append($('<span class="badge mb-2"></span>').addClass(presentation.badge).text(presentation.label));
                $activityInspector.append($('<div class="small mb-1"></div>').text('Intent: ' + (intent.purpose || 'Unspecified') + ' · revision ' + (intent.intent_revision || '—')));
                $activityInspector.append($('<div class="small mb-1"></div>').text('Grounding: ' + (intent.grounding_mode || 'Pending') + (intent.material_snapshot_id ? ' · snapshot ' + intent.material_snapshot_id : '')));
                $activityInspector.append($('<div class="small mb-1"></div>').text('LO: ' + ((intent.selected_objective_ids || []).map(objectiveDisplayLabel).join(' | ') || 'None')));
                $activityInspector.append($('<div class="small mb-2"></div>').text('CLO: ' + ((intent.selected_outcome_ids || []).map(outcomeDisplayLabel).join(' | ') || 'None')));
                var provenance = intent.content_provenance || (intent.activity ? 'AI_GENERATED' : null);
                if (provenance) {
                    var revision = Number(intent.activity_revision || 0);
                    var sourceRevision = Number(intent.source_generation_revision || (provenance === 'AI_GENERATED' ? revision : 0));
                    $activityInspector.append($('<div class="border-top pt-2 small mb-1"></div>').text('Provenance: ' + (provenance === 'TEACHER_EDITED' ? 'Teacher Edited · Activity revision ' + revision + ' · source AI revision ' + sourceRevision : 'AI Generated · Activity revision ' + revision)));
                }
                if (intent.generation_metadata) {
                    $activityInspector.append($('<div class="small text-muted mb-2"></div>').text('Source: Intent revision ' + (intent.generation_metadata.activity_intent_revision || intent.intent_revision || '—') + ' · Context revision ' + (intent.generation_metadata.core_context_revision || '—')));
                }
                if (intent.quality_review) {
                    var review = intent.quality_review;
                    var $review = $('<details class="border rounded p-2 mb-2 activity-ai-review"></details>');
                    $review.append($('<summary class="small font-weight-bold" style="cursor:pointer;"></summary>').text('AI self-review'));
                    [['Outcome', review.outcome_alignment], ['Learner fit', review.learner_level_fit], ['Scope', review.scope_compliance], ['Purpose', review.purpose_fit]].forEach(function(check) {
                        $review.append($('<span class="badge mr-1 mt-2"></span>').addClass(check[1] === 'PASS' ? 'badge-success' : 'badge-warning').text(check[0] + ': ' + (check[1] || '—')));
                    });
                    if (provenance === 'TEACHER_EDITED') $review.append($('<div class="small text-muted mt-2"></div>').text('Current Teacher edit was revalidated deterministically. No additional AI self-review call was made.'));
                    if (Array.isArray(review.warnings) && review.warnings.length) $review.append($('<div class="small text-warning mt-2"></div>').text(review.warnings.join(' · ')));
                    $activityInspector.append($review);
                }
                var refs = intent.activity && Array.isArray(intent.activity.source_refs) ? intent.activity.source_refs : [];
                if (refs.length) {
                    var $sources = $('<details class="border rounded p-2 mb-2 activity-source-review"></details>');
                    $sources.append($('<summary class="small font-weight-bold" style="cursor:pointer;"></summary>').text('Source references (' + refs.length + ')'));
                    refs.forEach(function(ref) { $sources.append($('<div class="small mt-1"></div>').text([ref.source, ref.page ? 'page ' + ref.page : '', ref.section || ''].filter(Boolean).join(' · '))); });
                    $activityInspector.append($sources);
                }
                $activityInspector.append($('<div class="small text-muted"></div>').text('Competency mapping and evidence decisions remain in the collapsed panel below.'));
            }

            function applyActivityTab() {
                activeTab = state.selectedActivityTabByWeek[section.ref] || activeTab || 'material';
                [$materialTab, $quizTab, $assignmentTab].forEach(function($tab) {
                    var selected = $tab.attr('data-activity-tab') === activeTab;
                    $tab.toggleClass('active', selected).attr('aria-selected', selected ? 'true' : 'false');
                });
                [$materialPane, $quizPane, $assignmentPane].forEach(function($pane) {
                    $pane.toggleClass('d-none', $pane.attr('data-activity-pane') !== activeTab);
                });
                renderActivityInspector(activeTab, activeTab === 'quiz' ? getIntent('quiz') : activeTab === 'assignment' ? getIntent('assignment') : null);
            }

            function syncOptionInputs() {
                var quizIntent = getIntent('quiz');
                var assignmentIntent = getIntent('assignment');
                if (quizIntent && quizIntent.options) {
                    if (quizIntent.options.question_count) $quizCount.val(quizIntent.options.question_count);
                    if (quizIntent.options.question_type) $quizType.val(quizIntent.options.question_type);
                    if (quizIntent.options.choices_per_question) $quizChoices.val(quizIntent.options.choices_per_question);
                }
                if (assignmentIntent && assignmentIntent.options && assignmentIntent.options.grade) $assignmentGrade.val(assignmentIntent.options.grade);
                if (quizIntent) {
                    $quizPurpose.val(quizIntent.purpose || 'PRACTICE');
                    $quizObjectives.val(quizIntent.selected_objective_ids || []);
                    var quizMissingAlignment = quizIntent.alignment_override && quizIntent.alignment_override.kind === 'MISSING_ALIGNMENT';
                    $quizOverrideAck.prop('checked', Boolean(quizIntent.alignment_override && quizIntent.alignment_override.acknowledged && !quizMissingAlignment));
                    $quizOverrideReason.val(!quizMissingAlignment && quizIntent.alignment_override && quizIntent.alignment_override.reason || '');
                    $quizMissingAlignmentAck.prop('checked', Boolean(quizMissingAlignment && quizIntent.alignment_override.acknowledged));
                    setOutcomeOverrideAvailability($quizOutcomes, $quizOverrideAck, $quizOverrideReason);
                    $quizOutcomes.val(quizIntent.selected_outcome_ids || []);
                }
                if (assignmentIntent) {
                    $assignmentPurpose.val(assignmentIntent.purpose || 'FORMATIVE');
                    $assignmentObjectives.val(assignmentIntent.selected_objective_ids || []);
                    var assignmentMissingAlignment = assignmentIntent.alignment_override && assignmentIntent.alignment_override.kind === 'MISSING_ALIGNMENT';
                    $assignmentOverrideAck.prop('checked', Boolean(assignmentIntent.alignment_override && assignmentIntent.alignment_override.acknowledged && !assignmentMissingAlignment));
                    $assignmentOverrideReason.val(!assignmentMissingAlignment && assignmentIntent.alignment_override && assignmentIntent.alignment_override.reason || '');
                    $assignmentMissingAlignmentAck.prop('checked', Boolean(assignmentMissingAlignment && assignmentIntent.alignment_override.acknowledged));
                    setOutcomeOverrideAvailability($assignmentOutcomes, $assignmentOverrideAck, $assignmentOverrideReason);
                    $assignmentOutcomes.val(assignmentIntent.selected_outcome_ids || []);
                }
                $quizChoices.prop('disabled', $quizType.val() !== 'multichoice');
            }

            function quizOptions() {
                return {
                    question_count: parseInt($quizCount.val(), 10) || 5,
                    question_type: $quizType.val() || 'multichoice',
                    choices_per_question: parseInt($quizChoices.val(), 10) || 4
                };
            }

            function assignmentOptions() {
                return {grade: parseInt($assignmentGrade.val(), 10) || 100};
            }

            function updateMaterialView() {
                var creating = (state.activityIntents[section.ref] || []).some(function(intent) { return intent.status === 'creating'; });
                if (materialState.status === 'failed') {
                    $materialLabel.html('<i class="fa fa-exclamation-triangle text-danger mr-1"></i> Material operation failed');
                    if (materialState.snapshotId) $materialLabel.append($('<span class="small text-muted ml-2"></span>').text('Previous sealed revision remains available.'));
                    $upload.removeClass('d-none').text(materialState.snapshotId ? 'Retry Save / Replace Material' : 'Retry Save');
                } else if (materialState.filename) {
                    $upload.addClass('d-none');
                    $materialLabel.html('<i class="fa fa-file-text-o text-success mr-1"></i> Current Material: ').append($('<strong></strong>').text(materialState.filename));
                    if (materialState.plannedResources && materialState.plannedResources.length) {
                        $materialLabel.append($('<span class="badge badge-success ml-2"></span>').text('File Resource Ready'));
                        $materialLabel.append($('<div class="small text-success mt-1"></div>').text('Planned title: ' + materialState.plannedResources[0].title));
                    }
                    $upload.text('Replace Material');
                } else if (materialState.snapshotId) {
                    $upload.addClass('d-none');
                    $materialLabel.html('<i class="fa fa-file-text-o text-success mr-1"></i> Current sealed MaterialSnapshot: ').append($('<code></code>').text(materialState.snapshotId));
                    $upload.text('Replace Material');
                } else {
                    $upload.addClass('d-none');
                    $materialLabel.html('<i class="fa fa-info-circle text-muted mr-1"></i> No Material uploaded — syllabus fallback will be used.');
                    $upload.text('Save Material');
                }
                $publishResourceInput.prop('checked', materialState.includeResource !== false);
                $publishResourceInput.prop('disabled', !materialState.filename || creating);
                $upload.prop('disabled', creating);
            }

            function applyMaterialReadback(result) {
                result = result || {};
                var snapshot = result.snapshot || null;
                materialState.status = result.status || (snapshot ? 'ready' : 'fallback');
                materialState.error = result.error || null;
                if (snapshot) {
                    materialState.snapshotId = snapshot.persisted_id || snapshot.id || null;
                    materialState.revision = Number(snapshot.revision || 0);
                    materialState.filename = snapshot.files && snapshot.files[0] ? snapshot.files[0].filename || null : null;
                    materialState.plannedResources = result.planned_resources || [];
                } else {
                    materialState.snapshotId = null;
                    materialState.revision = 0;
                    materialState.filename = null;
                    materialState.plannedResources = [];
                }
            }

            function selectedQuestionIndex(intent) {
                var questions = intent && intent.activity && Array.isArray(intent.activity.questions) ? intent.activity.questions : [];
                var key = intent ? intent.activity_ref : '';
                var index = Number(state.selectedQuizQuestionByActivity[key] || 0);
                if (!Number.isSafeInteger(index) || index < 0 || index >= questions.length) index = 0;
                state.selectedQuizQuestionByActivity[key] = index;
                return index;
            }

            function appendQuestionNavigator(intent, $target) {
                var questions = intent && intent.activity && Array.isArray(intent.activity.questions) ? intent.activity.questions : [];
                if (!questions.length) return;
                var selected = selectedQuestionIndex(intent);
                var $nav = $('<div class="btn-group btn-group-sm mb-2 quiz-question-navigator" role="tablist" aria-label="Quiz questions"></div>');
                questions.forEach(function(_question, index) {
                    var $button = $('<button type="button" class="btn btn-outline-secondary quiz-question-nav-item" role="tab"></button>')
                        .text('Q' + (index + 1)).attr('aria-selected', index === selected ? 'true' : 'false').toggleClass('active', index === selected);
                    $button.on('click', function() {
                        guardedNavigate(function() {
                            state.selectedQuizQuestionByActivity[intent.activity_ref] = index;
                            renderPanels();
                            $quizPanel.find('.quiz-question-nav-item').each(function(_index, element) {
                                var $candidate = $(element);
                                if ($candidate.attr('aria-selected') === 'true') $candidate.trigger('focus');
                            });
                        });
                    });
                    $nav.append($button);
                });
                $target.append($nav);
            }

            function renderGeneratedPreview(intent, $panel) {
                if (!intent || !intent.activity) return;
                var $preview = $('<div class="bg-light border rounded p-2 mb-3 small"></div>');
                var activityRevision = Number(intent.activity_revision || 0);
                var $previewTitle = $('<div class="d-flex flex-wrap justify-content-between align-items-center mb-1"></div>');
                $previewTitle.append($('<div class="font-weight-bold"></div>').text(intent.status === 'shell' ? 'Empty Activity Shell Preview' : 'Generated Activity Preview'));
                $preview.append($previewTitle);
                if (intent.review_required) {
                    var missingAlignmentReview = intent.alignment_override && intent.alignment_override.kind === 'MISSING_ALIGNMENT';
                    $preview.append($('<div class="alert alert-warning py-1 px-2 mb-2"></div>').text(missingAlignmentReview ? 'Generated without selected LO/CLO alignment — Teacher review required before approval.' : 'AI-expanded source content — Teacher review required before approval.'));
                }
                if (intent.activity.type === 'assignment') {
                    if (intent.activity.description) $preview.append($('<div class="mb-1"></div>').text(intent.activity.description));
                    var instructions = intent.activity.instructions || [];
                    if (instructions.length) {
                        var $instructions = $('<ul class="mb-1 pl-4"></ul>');
                        instructions.forEach(function(item) { $instructions.append($('<li></li>').text(item)); });
                        $preview.append($instructions);
                    }
                } else if (intent.activity.type === 'quiz') {
                    var previewQuestions = intent.activity.questions || [];
                    appendQuestionNavigator(intent, $preview);
                    var previewIndex = selectedQuestionIndex(intent);
                    if (previewQuestions[previewIndex]) {
                        var $questionDetail = $('<div class="quiz-question-detail"></div>');
                        renderCanonicalQuestionPreview(previewQuestions[previewIndex], previewIndex, $questionDetail);
                        $preview.append($questionDetail);
                    }
                }

                if (intent.status === 'generated') {
                    var $editToggle = $('<button type="button" class="btn btn-sm btn-outline-secondary mt-2 mr-2"></button>').text('Edit Activity Content');
                    var $editor = $('<div class="border rounded bg-white p-2 mt-2 d-none activity-content-editor"></div>');
                    var $title = $('<input type="text" class="form-control form-control-sm mb-2">').val(intent.activity.title || '');
                    var $description = $('<textarea class="form-control form-control-sm mb-2" rows="2"></textarea>').val(intent.activity.description || '');
                    $editor.append($('<label class="small font-weight-bold mb-1"></label>').text('Title')).append($title);
                    $editor.append($('<label class="small font-weight-bold mb-1"></label>').text('Description')).append($description);
                    var assignmentInstructions = null;
                    var questionEditors = [];
                    if (intent.activity.type === 'assignment') {
                        assignmentInstructions = $('<textarea class="form-control form-control-sm mb-2" rows="5"></textarea>').val((intent.activity.instructions || []).join('\n'));
                        $editor.append($('<label class="small font-weight-bold mb-1"></label>').text('Instructions · one item per line')).append(assignmentInstructions);
                        $editor.append($('<div class="small text-muted mb-2"></div>').text('Learning Objectives, grade, source references, Purpose and target LO/CLO remain controlled by the current Activity Intent.'));
                    } else {
                        var editorSelectedIndex = selectedQuestionIndex(intent);
                        (intent.activity.questions || []).forEach(function(question, questionIndex) {
                            if (questionIndex !== editorSelectedIndex) return;
                            var $questionCard = $('<div class="border rounded p-2 mb-2 quiz-question-editor-detail"></div>');
                            $questionCard.append($('<div class="small font-weight-bold mb-1"></div>').text('Question ' + (questionIndex + 1) + ' · ' + question.type));
                            var $questionText = $('<textarea class="form-control form-control-sm mb-2" rows="2"></textarea>').val(question.question || '');
                            $questionCard.append($questionText);
                            var editor = {question: $questionText, feedback: null, choices: [], correct: null, accepted: null, grading: null};
                            if (question.type === 'multichoice') {
                                var $correct = $('<select class="form-control form-control-sm mb-2"></select>');
                                (question.choices || []).forEach(function(choice, choiceIndex) {
                                    var $choice = $('<input type="text" class="form-control form-control-sm mb-1">').val(choice.text || '');
                                    $questionCard.append($('<label class="small mb-0"></label>').text('Choice ' + (choiceIndex + 1))).append($choice);
                                    editor.choices.push({ref: choice.ref, input: $choice});
                                    $correct.append($('<option></option>').val(choice.ref).text('Correct: ' + (choiceIndex + 1) + ' · ' + (choice.text || '')).prop('selected', (question.correct_choice_refs || []).indexOf(choice.ref) !== -1));
                                });
                                editor.correct = $correct;
                                $questionCard.append($correct);
                            } else if (question.type === 'shortanswer') {
                                editor.accepted = $('<textarea class="form-control form-control-sm mb-2" rows="2"></textarea>').val((question.accepted_answers || []).join('\n'));
                                $questionCard.append($('<label class="small mb-0"></label>').text('Accepted answers · one per line')).append(editor.accepted);
                            } else if (question.type === 'essay') {
                                editor.grading = $('<textarea class="form-control form-control-sm mb-2" rows="3"></textarea>').val((question.grading_guidance || []).join('\n'));
                                $questionCard.append($('<label class="small mb-0"></label>').text('Grading guidance · one per line')).append(editor.grading);
                            }
                            if (question.type === 'multichoice' || question.type === 'truefalse') {
                                editor.feedback = $('<textarea class="form-control form-control-sm mb-2" rows="2"></textarea>').val(question.feedback || '');
                                $questionCard.append($('<label class="small mb-0"></label>').text('Feedback')).append(editor.feedback);
                            }
                            questionEditors[questionIndex] = editor;
                            $editor.append($questionCard);
                        });
                        $editor.append($('<div class="small text-muted mb-2"></div>').text('Question type/count, default marks, refs, source references, Purpose and target LO/CLO remain deterministic.'));
                    }
                    var $saveEdit = $('<button type="button" class="btn btn-sm btn-primary mr-2"></button>').text('Save Teacher Edit');
                    var $cancelEdit = $('<button type="button" class="btn btn-sm btn-outline-secondary"></button>').text('Cancel');
                    var activityDraftDirty = false;
                    var recoveredActivityDraft = null;

                    function collectEditedActivity() {
                        var edited = JSON.parse(JSON.stringify(recoveredActivityDraft || intent.activity));
                        edited.title = $title.val().trim();
                        edited.description = $description.val().trim();
                        if (edited.type === 'assignment') {
                            edited.instructions = assignmentInstructions.val().split(/\r?\n/).map(function(item) { return item.trim(); }).filter(Boolean);
                        } else {
                            (edited.questions || []).forEach(function(question, index) {
                                var editor = questionEditors[index];
                                if (!editor) return;
                                question.question = editor.question.val().trim();
                                if (question.type === 'multichoice') {
                                    (question.choices || []).forEach(function(choice, choiceIndex) {
                                        if (editor.choices[choiceIndex]) choice.text = editor.choices[choiceIndex].input.val().trim();
                                    });
                                    question.correct_choice_refs = [editor.correct.val()];
                                } else if (question.type === 'shortanswer') {
                                    question.accepted_answers = editor.accepted.val().split(/\r?\n/).map(function(item) { return item.trim(); }).filter(Boolean);
                                } else if (question.type === 'essay') {
                                    question.grading_guidance = editor.grading.val().split(/\r?\n/).map(function(item) { return item.trim(); }).filter(Boolean);
                                }
                                if (editor.feedback) question.feedback = editor.feedback.val();
                            });
                        }
                        return edited;
                    }

                    function applyActivityDraft(payload) {
                        if (!payload || payload.type !== intent.activity.type) return;
                        recoveredActivityDraft = JSON.parse(JSON.stringify(payload));
                        $title.val(payload.title || '');
                        $description.val(payload.description || '');
                        if (payload.type === 'assignment') {
                            assignmentInstructions.val((payload.instructions || []).join('\n'));
                        } else {
                            (payload.questions || []).forEach(function(question, index) {
                                var editor = questionEditors[index];
                                if (!editor) return;
                                editor.question.val(question.question || '');
                                if (question.type === 'multichoice') {
                                    (question.choices || []).forEach(function(choice, choiceIndex) {
                                        if (editor.choices[choiceIndex]) editor.choices[choiceIndex].input.val(choice.text || '');
                                    });
                                    if (editor.correct) editor.correct.val((question.correct_choice_refs || [])[0] || '');
                                } else if (question.type === 'shortanswer' && editor.accepted) {
                                    editor.accepted.val((question.accepted_answers || []).join('\n'));
                                } else if (question.type === 'essay' && editor.grading) {
                                    editor.grading.val((question.grading_guidance || []).join('\n'));
                                }
                                if (editor.feedback) editor.feedback.val(question.feedback || '');
                            });
                        }
                        activityDraftDirty = true;
                        $editor.removeClass('d-none');
                    }

                    function saveActivityDraft() {
                        var edited = collectEditedActivity();
                        $saveEdit.prop('disabled', true).text('Validating & Saving...');
                        return callBff('save_activity_edit', {
                            run_id: state.runId,
                            section_ref: section.ref,
                            activity_ref: intent.activity_ref,
                            activity: edited,
                            expected_activity_revision: activityRevision
                        }).then(function(result) {
                            clearRecoverySnapshotAfterSave('activity-content', intent.activity_ref);
                            clearActiveDraftGuard('activity-content', intent.activity_ref);
                            activityDraftDirty = false;
                            var list = state.activityIntents[section.ref] || [];
                            var index = list.findIndex(function(item) { return item.activity_ref === result.activity_ref; });
                            if (index >= 0) list[index] = result;
                            else list.push(result);
                            syncOptionInputs();
                            renderPanels();
                            return result;
                        }).catch(function(err) {
                            $saveEdit.prop('disabled', false).text('Save Teacher Edit');
                            showError('Teacher Activity edit was rejected: ' + err.message, err.details);
                            throw err;
                        });
                    }

                    $editor.append($saveEdit).append($cancelEdit);
                    $editToggle.on('click', function() {
                        guardedNavigate(function() {
                            var session = beginDraftSession('activity-content', intent.activity_ref, activityRevision, 'fresh');
                            if (!session.ok) {
                                showRecoveryBanner('activity-content', intent.activity_ref, activityRevision, applyActivityDraft);
                                showError(session.reason === 'conflict'
                                    ? 'Resolve the Draft conflict for this Activity before starting a new edit.'
                                    : 'Restore or discard the recoverable Activity draft before starting a new edit.');
                                return;
                            }
                            $editor.toggleClass('d-none');
                        });
                    });
                    $cancelEdit.on('click', function() { $editor.addClass('d-none'); });
                    $editor.find('input, textarea, select').on('input.ticket05draft change.ticket05draft', function() {
                        activityDraftDirty = true;
                        persistActivityDraft(intent.activity_ref, activityRevision, collectEditedActivity());
                        setActiveDraftGuard({
                            surface: 'activity-content',
                            entityRef: intent.activity_ref,
                            isDirty: function() { return activityDraftDirty; },
                            save: saveActivityDraft,
                            discard: function() {
                                activityDraftDirty = false;
                                $editor.addClass('d-none');
                            }
                        });
                    });
                    $saveEdit.on('click', saveActivityDraft);
                    showRecoveryBanner('activity-content', intent.activity_ref, activityRevision, function(payload) {
                        applyActivityDraft(payload);
                        setActiveDraftGuard({
                            surface: 'activity-content',
                            entityRef: intent.activity_ref,
                            isDirty: function() { return activityDraftDirty; },
                            save: saveActivityDraft,
                            discard: function() {
                                activityDraftDirty = false;
                                $editor.addClass('d-none');
                            }
                        });
                    });
                    $preview.append($editToggle).append($editor);
                }
                $panel.append($preview);
            }

            function persistSelection(instructions) {
                var quizOverride = $quizOverrideAck.is(':checked') && $quizOverrideReason.val().trim() ? {kind: 'OUT_OF_SECTION', acknowledged: true, reason: $quizOverrideReason.val().trim()} : null;
                var assignmentOverride = $assignmentOverrideAck.is(':checked') && $assignmentOverrideReason.val().trim() ? {kind: 'OUT_OF_SECTION', acknowledged: true, reason: $assignmentOverrideReason.val().trim()} : null;
                var quizSelectedOutcomes = $quizOutcomes.val() || [];
                var assignmentSelectedOutcomes = $assignmentOutcomes.val() || [];
                var quizMissingAlignment = $quizPurpose.val() === 'PRACTICE' ? ($quizObjectives.val() || []).length === 0 && quizSelectedOutcomes.length === 0 : quizSelectedOutcomes.length === 0;
                var assignmentMissingAlignment = $assignmentPurpose.val() === 'PRACTICE' ? ($assignmentObjectives.val() || []).length === 0 && assignmentSelectedOutcomes.length === 0 : assignmentSelectedOutcomes.length === 0;
                var quizOutsideSelected = quizSelectedOutcomes.some(function(id) { return !alignedOutcomeLookup[id]; });
                var assignmentOutsideSelected = assignmentSelectedOutcomes.some(function(id) { return !alignedOutcomeLookup[id]; });
                if (quizOutsideSelected && !quizOverride) return Promise.reject(new Error('Select Teacher override and enter a reason before targeting an out-of-Section CLO.'));
                if (assignmentOutsideSelected && !assignmentOverride) return Promise.reject(new Error('Select Teacher override and enter a reason before targeting an out-of-Section CLO.'));
                if ($quiz.is(':checked') && quizMissingAlignment) {
                    if ($quizMissingAlignmentAck.is(':checked')) quizOverride = {kind: 'MISSING_ALIGNMENT', acknowledged: true, reason: 'Teacher confirmed generation without selected LO/CLO alignment.'};
                }
                if ($assignment.is(':checked') && assignmentMissingAlignment) {
                    if ($assignmentMissingAlignmentAck.is(':checked')) assignmentOverride = {kind: 'MISSING_ALIGNMENT', acknowledged: true, reason: 'Teacher confirmed generation without selected LO/CLO alignment.'};
                }
                $quiz.prop('disabled', true);
                $assignment.prop('disabled', true);
                var payload = {
                    run_id: state.runId,
                    section_ref: section.ref,
                    quiz: $quiz.is(':checked') ? 1 : 0,
                    assignment: $assignment.is(':checked') ? 1 : 0,
                    quiz_options: quizOptions(),
                    assignment_options: assignmentOptions(),
                    quiz_purpose: $quizPurpose.val(),
                    assignment_purpose: $assignmentPurpose.val(),
                    quiz_selected_objective_ids: $quizObjectives.val() || [],
                    assignment_selected_objective_ids: $assignmentObjectives.val() || [],
                    quiz_selected_outcome_ids: quizSelectedOutcomes,
                    assignment_selected_outcome_ids: assignmentSelectedOutcomes,
                    quiz_learner_context_revision: state.coreContext && state.coreContext.learner_context ? state.coreContext.learner_context.revision : undefined,
                    assignment_learner_context_revision: state.coreContext && state.coreContext.learner_context ? state.coreContext.learner_context.revision : undefined
                };
                payload.quiz_alignment_override = quizOverride || {};
                payload.assignment_alignment_override = assignmentOverride || {};
                if (instructions && Object.prototype.hasOwnProperty.call(instructions, 'quiz')) payload.quiz_generation_instruction = instructions.quiz;
                if (instructions && Object.prototype.hasOwnProperty.call(instructions, 'assignment')) payload.assignment_generation_instruction = instructions.assignment;
                return callBff('set_activity_intents', payload).then(function(result) {
                    state.activityIntents[section.ref] = result.intents || [];
                    syncOptionInputs();
                    return result;
                }).finally(function() {
                    $quiz.prop('disabled', false);
                    $assignment.prop('disabled', false);
                });
            }

            function replaceActivityFromReadback(activity) {
                if (!activity || !activity.activity_ref) return;
                var list = state.activityIntents[section.ref] || [];
                var index = list.findIndex(function(item) { return item.activity_ref === activity.activity_ref; });
                if (index >= 0) list[index] = activity;
                else list.push(activity);
            }

            function readBackActivity(activityRef) {
                return callBff('get_activity_status', {
                    run_id: state.runId,
                    section_ref: section.ref,
                    activity_ref: activityRef
                }).then(function(result) {
                    replaceActivityFromReadback(result);
                    syncOptionInputs();
                    renderPanels();
                    return result;
                });
            }

            function generateSelectedActivity(type, instruction, $button) {
                if (learnerContextNeedsAcknowledgment()) {
                    showError('Acknowledge the shared Learner Context: UNSPECIFIED control before generating any Activity.');
                    var $learnerAck = $('#activity-structure-container .learner-context-shared-ack').first();
                    if ($learnerAck[0] && typeof $learnerAck[0].scrollIntoView === 'function') $learnerAck[0].scrollIntoView({block: 'center'});
                    $learnerAck.trigger('focus');
                    return Promise.resolve();
                }
                var selectedOutcomes = (type === 'quiz' ? $quizOutcomes : $assignmentOutcomes).val() || [];
                var selectedObjectives = (type === 'quiz' ? $quizObjectives : $assignmentObjectives).val() || [];
                var purpose = (type === 'quiz' ? $quizPurpose : $assignmentPurpose).val();
                var alignmentMissing = purpose === 'PRACTICE' ? selectedObjectives.length === 0 && selectedOutcomes.length === 0 : selectedOutcomes.length === 0;
                var missingAlignmentAcknowledged = (type === 'quiz' ? $quizMissingAlignmentAck : $assignmentMissingAlignmentAck).is(':checked');
                if (alignmentMissing && !missingAlignmentAcknowledged) {
                    showError('Confirm Teacher Review Required before generating ' + (type === 'quiz' ? 'Quiz' : 'Assignment') + ' without a required LO/CLO.');
                    return Promise.resolve();
                }
                $button.prop('disabled', true).html('<i class="fa fa-spinner fa-spin mr-1"></i> Creating...');
                $('#btn-activity-finalize').prop('disabled', true);
                var current = getIntent(type);
                if (!current) return Promise.reject(new Error(type + ' is no longer selected.'));
                var recovery = ['failed', 'timed_out', 'stale', 'insufficient_evidence'].indexOf(current.status) !== -1;
                var prepare = recovery
                    ? pendingIntentSave.then(function(saveResult) {
                        if (saveResult && saveResult.ok === false) throw saveResult.error || new Error('The latest Activity Intent could not be saved.');
                        var prepared = getIntent(type);
                        if (!prepared) throw new Error(type + ' is no longer selected.');
                        return prepared;
                    })
                    : persistSelection(type === 'quiz' ? {quiz: instruction} : {assignment: instruction}).then(function() {
                        var prepared = getIntent(type);
                        if (!prepared) throw new Error(type + ' is no longer selected.');
                        return prepared;
                    });
                var targetRef = current.activity_ref;
                return prepare.then(function(prepared) {
                    targetRef = prepared.activity_ref;
                    return callBff('generate_activity', {
                        run_id: state.runId,
                        section_ref: section.ref,
                        activity_ref: prepared.activity_ref,
                        generation_instruction: instruction
                    });
                }).then(function() {
                    return readBackActivity(targetRef).catch(function(err) {
                        showError((type === 'quiz' ? 'Quiz' : 'Assignment') + ' generation completed, but authoritative status read-back failed: ' + err.message, err.details);
                        renderPanels();
                    });
                }).catch(function(err) {
                    showError((type === 'quiz' ? 'Quiz' : 'Assignment') + ' generation failed: ' + err.message, err.details);
                    return readBackActivity(targetRef).catch(function() {
                        renderPanels();
                    });
                });
            }

            function renderPanel(type, $panel) {
                var isQuiz = type === 'quiz';
                var label = isQuiz ? 'Quiz' : 'Assignment';
                var intent = getIntent(type);
                var selected = Boolean(intent);
                var status = activityStatusPresentation(intent);
                $panel.empty().toggleClass('inactive', !selected);

                var $title = $('<div class="activity-panel-title d-flex justify-content-between align-items-start mb-2"></div>');
                var $label = $('<div class="font-weight-bold"></div>');
                $label.append($('<i class="fa mr-2"></i>').addClass(isQuiz ? 'fa-question-circle text-info' : 'fa-file-text text-success'));
                $label.append(document.createTextNode(label));
                var $badge = $('<span class="badge"></span>').addClass(status.badge).text(status.label);
                $title.append($label).append($badge);
                $panel.append($title);

                if (!selected) {
                    $panel.append($('<div class="small text-muted py-3"></div>').text('Select ' + label + ' above to configure and generate it for this week.'));
                    return;
                }

                appendSemanticControls(type, intent, $panel);
                if (!materialState.snapshotId) {
                    $panel.append($('<div class="alert alert-info py-2 px-2 mb-2 activity-syllabus-fallback-callout"></div>')
                        .text('Source: Syllabus fallback. If syllabus evidence requires AI expansion, AI expansion remains Teacher Review Required. Learner-context acknowledgment is separate and explicit.'));
                }
                if (intent.grounding_mode) {
                    var grounding = 'Grounding: ' + intent.grounding_mode;
                    if (intent.review_required) grounding += ' • Teacher review required';
                    $panel.append($('<div class="small text-muted mb-2"></div>').text(grounding));
                }
                if (intent.intent_revision) $panel.append($('<div class="small text-muted mb-1"></div>').text('Intent revision ' + intent.intent_revision));
                if (intent.error) {
                    $panel.append($('<div class="alert alert-warning py-2 small mb-2"></div>').text(intent.error));
                }

                var $promptLabel = $('<label class="small font-weight-bold mb-1"></label>').text(label + ' Prompt (Optional)');
                var persistedInstruction = String(intent.generation_instruction || '').trim();
                var $prompt = $('<textarea class="form-control form-control-sm mb-2 activity-generation-prompt" rows="3"></textarea>').attr('placeholder', isQuiz ? 'e.g., Focus on concepts from this week and keep questions beginner-friendly...' : "e.g., Ask students to build a small class that applies this week's concepts...");
                if (isQuiz) $quizPrompt = $prompt; else $assignmentPrompt = $prompt;
                if (intent.generation_instruction) $prompt.val(intent.generation_instruction);
                var terminal = intent.status === 'generated' || intent.status === 'shell' || intent.status === 'creating' || intent.status === 'retry_exhausted';
                var $generationSettings = $('<div class="border rounded bg-light p-2 mb-3 activity-generation-settings"></div>');
                $generationSettings.append($('<div class="small font-weight-bold mb-2"></div>').text('Generation Settings'));
                if (isQuiz) {
                    var $row = $('<div class="form-row"></div>');
                    var $countGroup = $('<div class="form-group col-4 mb-1"></div>').append('<label class="small mb-1">Questions</label>').append($quizCount);
                    var $typeGroup = $('<div class="form-group col-5 mb-1"></div>').append('<label class="small mb-1">Type</label>').append($quizType);
                    var $choiceGroup = $('<div class="form-group col-3 mb-1"></div>').append('<label class="small mb-1">Choices</label>').append($quizChoices);
                    $row.append($countGroup).append($typeGroup).append($choiceGroup);
                    $generationSettings.append($row);
                    $quizCount.prop('disabled', terminal);
                    $quizType.prop('disabled', terminal);
                    $quizChoices.prop('disabled', terminal || $quizType.val() !== 'multichoice');
                } else {
                    $generationSettings.append($('<div class="form-group mb-1"></div>').append('<label class="small mb-1">Grade</label>').append($assignmentGrade));
                    $assignmentGrade.prop('disabled', terminal);
                }
                $panel.append($generationSettings);
                $panel.append($promptLabel).append($prompt);
                var $promptStatus = $('<div class="activity-intent-save-status small mb-2"></div>');
                function setPromptSaveStatus(className, iconClass, text) {
                    $promptStatus.removeClass('text-success text-warning text-muted').addClass(className).empty();
                    $promptStatus.append($('<i class="fa mr-1" aria-hidden="true"></i>').addClass(iconClass));
                    $promptStatus.append(document.createTextNode(text));
                }
                function updatePromptSaveStatus() {
                    var currentInstruction = String($prompt.val() || '').trim();
                    if (currentInstruction !== persistedInstruction) {
                        setPromptSaveStatus('text-warning', 'fa-exclamation-circle', 'Unsaved changes · Generate will save first');
                    } else if (persistedInstruction) {
                        setPromptSaveStatus('text-success', 'fa-check-circle', 'Saved and ready to generate');
                    } else {
                        setPromptSaveStatus('text-muted', 'fa-info-circle', 'No prompt saved · deterministic defaults will apply');
                    }
                }
                $prompt.on('input', updatePromptSaveStatus);
                updatePromptSaveStatus();
                $panel.append($promptStatus);
                var $saveIntent = $('<button type="button" class="btn btn-sm btn-outline-secondary mb-2"></button>').text('Save Intent');
                $saveIntent.on('click', function() {
                    var instructions = {}; instructions[type] = $prompt.val().trim();
                    $saveIntent.prop('disabled', true).text('Saving Intent...');
                    persistSelection(instructions).then(function() { renderPanels(); }).catch(function(err) { $saveIntent.prop('disabled', false).text('Save Intent'); showError('Failed to save Activity Intent: ' + err.message, err.details); });
                });
                $panel.append($saveIntent);

                renderGeneratedPreview(intent, $panel);

                var $actions = $('<div class="d-flex flex-wrap align-items-center"></div>');
                var canGenerate = ['selected', 'failed', 'timed_out', 'insufficient_evidence', 'stale'].indexOf(intent.status) !== -1 && intent.attempt_count < intent.max_attempts;
                var $generate = $('<button type="button" class="btn btn-outline-primary btn-sm mr-2"></button>');
                $generate.text(intent.status === 'stale' ? 'Regenerate Activity' : intent.attempt_count > 0 ? 'Retry Generate' : ('Generate ' + label)).prop('disabled', !canGenerate);
                if (intent.status === 'generated') $generate.text('Generated').removeClass('btn-outline-primary').addClass('btn-success');
                if (intent.status === 'shell') $generate.text('Empty Shell').removeClass('btn-outline-primary').addClass('btn-success');
                if (intent.status === 'creating') $generate.html('<i class="fa fa-spinner fa-spin mr-1"></i> Creating...').prop('disabled', true);
                if (intent.status === 'retry_exhausted') $generate.text('Retry exhausted').removeClass('btn-outline-primary').addClass('btn-danger').prop('disabled', true);
                $generate.on('click', function() { generateSelectedActivity(type, $prompt.val().trim(), $generate); });
                $actions.append($generate);

                if (intent.status === 'insufficient_evidence') {
                    var $shell = $('<button type="button" class="btn btn-outline-warning btn-sm mr-2"></button>').text('Create Empty Shell');
                    $shell.on('click', function() {
                        if (!window.confirm('Evidence is insufficient. Create an empty ' + label + ' shell for the teacher to complete later?')) return;
                        callBff('confirm_activity_shell', {run_id: state.runId, section_ref: section.ref, activity_ref: intent.activity_ref}).then(function(result) {
                            var list = state.activityIntents[section.ref] || [];
                            var index = list.findIndex(function(item) { return item.activity_ref === result.activity_ref; });
                            if (index >= 0) list[index] = result;
                            else list.push(result);
                            renderPanels();
                        }).catch(function(err) { showError('Empty shell failed: ' + err.message, err.details); });
                    });
                    $actions.append($shell);
                }
                if (intent.status === 'retry_exhausted') {
                    $actions.append($('<span class="small text-danger"></span>').text('Untick ' + label + ' to remove it and continue.'));
                }
                $panel.append($actions);
            }

            function renderPanels() {
                var intents = state.activityIntents[section.ref] || [];
                activeTab = state.selectedActivityTabByWeek[section.ref] || activeTab || 'material';
                var quizIntent = getIntent('quiz');
                var assignmentIntent = getIntent('assignment');
                $quiz.prop('checked', Boolean(quizIntent));
                $assignment.prop('checked', Boolean(assignmentIntent));
                $quiz.prop('disabled', Boolean(quizIntent && quizIntent.status === 'creating'));
                $assignment.prop('disabled', Boolean(assignmentIntent && assignmentIntent.status === 'creating'));
                updateMaterialView();
                var materialPresentation = materialState.status === 'failed'
                    ? {label: 'Failed', badge: 'badge-danger'}
                    : materialState.snapshotId ? {label: 'Ready', badge: 'badge-success'} : {label: 'Syllabus fallback', badge: 'badge-light'};
                var quizPresentation = activityStatusPresentation(quizIntent);
                var assignmentPresentation = activityStatusPresentation(assignmentIntent);
                $materialTab.empty().append(document.createTextNode('Material ')).append($('<span class="badge ml-1"></span>').addClass(materialPresentation.badge).text(materialPresentation.label));
                $quizTab.empty().append(document.createTextNode('Quiz ')).append($('<span class="badge ml-1"></span>').addClass(quizPresentation.badge).text(quizPresentation.label));
                $assignmentTab.empty().append(document.createTextNode('Assignment ')).append($('<span class="badge ml-1"></span>').addClass(assignmentPresentation.badge).text(assignmentPresentation.label));
                renderPanel('quiz', $quizPanel);
                renderPanel('assignment', $assignmentPanel);
                if (!intents.length) {
                    $material.addClass('text-muted');
                } else {
                    $material.removeClass('text-muted');
                }
                applyActivityTab();
                var weekStale = intents.some(function(item) { return item.status === 'stale'; });
                var weekReady = intents.length && intents.every(function(item) { return item.status === 'generated' || item.status === 'shell'; });
                var weekCreating = intents.some(function(item) { return item.status === 'creating'; });
                var weekStatus = weekStale ? 'Stale' : weekReady ? 'Ready' : weekCreating ? 'In progress' : 'Pending review';
                var $weekBadge = $rail.find('[data-week-ref="' + section.ref + '"] .badge');
                $weekBadge.removeClass('badge-success badge-primary badge-warning badge-secondary')
                    .addClass(weekStatus === 'Ready' ? 'badge-success' : weekStatus === 'In progress' ? 'badge-primary' : weekStatus === 'Stale' ? 'badge-warning' : 'badge-secondary')
                    .text(weekStatus);
                updateActivityFinalizeState();
            }

            $quizType.on('change', function() {
                $quizChoices.prop('disabled', $quizType.val() !== 'multichoice');
            });

            function saveSelection() {
                var operation = persistSelection().then(function() {
                    renderPanels();
                    return {ok: true};
                }).catch(function(err) {
                    showError('Failed to update Activity selection: ' + err.message, err.details);
                    return callBff('get_activity_intents', {run_id: state.runId, section_ref: section.ref}).then(function(result) {
                        state.activityIntents[section.ref] = result.intents || [];
                        syncOptionInputs();
                        renderPanels();
                        return {ok: false, error: err};
                    }).catch(function() {
                        return {ok: false, error: err};
                    });
                });
                pendingIntentSave = operation;
                return operation;
            }

            $quiz.on('change', saveSelection);
            $assignment.on('change', saveSelection);

            $publishResourceInput.on('change', function() {
                var publish = $publishResourceInput.is(':checked');
                materialState.includeResource = publish;
                $publishResourceInput.prop('disabled', true);
                callBff('set_resource_publication', {
                    run_id: state.runId,
                    section_ref: section.ref,
                    publish: publish ? 1 : 0
                }).catch(function(err) {
                    materialState.includeResource = !publish;
                    $publishResourceInput.prop('checked', !publish);
                    showError('Failed to update File Resource selection: ' + err.message, err.details);
                }).finally(function() {
                    updateMaterialView();
                });
            });

            function saveSelectedMaterial(file) {
                if (!file) {
                    showError('Choose a Learning Material file for ' + weekTitle + '.');
                    return Promise.resolve();
                }
                var materialSizeError = fileSizeValidationError(file, MAX_MATERIAL_FILE_BYTES, 'Learning Material');
                if (materialSizeError) {
                    showError(materialSizeError);
                    updateMaterialView();
                    return Promise.resolve();
                }
                clearError();
                $upload.prop('disabled', true).removeClass('d-none').html('<i class="fa fa-spinner fa-spin mr-1"></i> Saving...');
                var formData = new FormData();
                formData.append('material_file', file);
                formData.append('run_id', state.runId);
                formData.append('section_ref', section.ref);
                formData.append('structure_revision', state.structureRevision);
                return callBff('upload_section_material', formData, true).then(function() {
                    return callBff('seal_section_material', {run_id: state.runId, section_ref: section.ref, structure_revision: state.structureRevision});
                }).then(function(result) {
                    materialState.status = result.status || 'ready';
                    materialState.error = null;
                    materialState.snapshotId = (result.snapshot && (result.snapshot.persisted_id || result.snapshot.id)) || result.id;
                    materialState.revision = Number(result.snapshot && result.snapshot.revision || materialState.revision || 0);
                    materialState.filename = file.name;
                    materialState.plannedResources = result.planned_resources || [];
                    renderPanels();
                    return callBff('get_activity_intents', {run_id: state.runId, section_ref: section.ref}).then(function(activityResult) {
                        state.activityIntents[section.ref] = activityResult.intents || [];
                        syncOptionInputs();
                        renderPanels();
                    }).catch(function(err) {
                        showError('Learning Material saved, but Activity status refresh failed: ' + err.message, err.details);
                        renderPanels();
                    });
                }).catch(function(err) {
                    showError('Learning Material save failed: ' + err.message, err.details);
                    return callBff('get_section_material_snapshot', {run_id: state.runId, section_ref: section.ref}).then(function(result) {
                        applyMaterialReadback(result);
                        renderPanels();
                    }).catch(function() {
                        updateMaterialView();
                    });
                });
            }

            $file.on('change', function() {
                var file = this.files && this.files[0];
                if (!file) return;
                var sizeError = fileSizeValidationError(file, MAX_MATERIAL_FILE_BYTES, 'Learning Material');
                if (sizeError) {
                    this.value = '';
                    showError(sizeError);
                    updateMaterialView();
                    return;
                }
                saveSelectedMaterial(file);
            });

            $upload.on('click', function() {
                var file = $file[0].files && $file[0].files[0];
                saveSelectedMaterial(file);
            });

            applyActivityTab();

            var activityRead = callBff('get_activity_intents', {run_id: state.runId, section_ref: section.ref}).then(function(result) {
                if (renderVersion !== state.activityRenderVersion) return;
                state.activityIntents[section.ref] = result.intents || [];
                updateActivityWeekNavStatus($rail, section.ref, state.activityIntents[section.ref]);
                syncOptionInputs();
                renderPanels();
            }).catch(function(err) {
                if (renderVersion === state.activityRenderVersion) showError('Failed to load Quiz/Assignment state: ' + err.message, err.details);
            });
            var materialRead = callBff('get_section_material_snapshot', {run_id: state.runId, section_ref: section.ref}).then(function(result) {
                if (renderVersion !== state.activityRenderVersion) return;
                applyMaterialReadback(result);
                renderPanels();
            }).catch(function(err) {
                if (renderVersion === state.activityRenderVersion) showError('Failed to load Material state: ' + err.message, err.details);
            });
            Promise.allSettled([activityRead, materialRead]).then(function() {
                if (renderVersion !== state.activityRenderVersion) return;
                state.activityLoadingCount = Math.max(0, state.activityLoadingCount - 1);
                syncOptionInputs();
                renderPanels();
            });
        });
    }

    function confirmStructureAndShowActivities() {
        if (!state.stagedMode) { setStep(3); return; }
        if ((state.outcomeReviews || []).some(function(item) { return item.status === 'NEEDS_REVISION'; })) {
            showError('Resolve every Outcome marked Needs revision before confirming the Course Structure.');
            updateStructureContinueState();
            return;
        }
        if ((state.outcomeReviews || []).some(function(item) { return item.item_type === 'LO' && item.status === 'PENDING_REVIEW'; })) {
            showError('Review every Learning Objective before confirming the Course Structure.');
            updateStructureContinueState();
            return;
        }
        if (unapprovedSourceOutcomes().length > 0) {
            showError('Approve every source Learning Outcome before confirming the Course Structure.');
            updateStructureContinueState();
            return;
        }
        if (currentAlignmentIsStale()) {
            showError('Revalidate Outcome alignment before confirming the Course Structure.');
            renderAlignmentReview(state.currentStructure);
            return;
        }
        if ((state.currentStructure.content.sections || []).some(function(section) { return weekReviewStatus(section) !== 'Ready to configure'; })) {
            showError('Mark every current Week reviewed before confirming the Course Structure.');
            updateStructureContinueState();
            return;
        }
        $('#btn-review-continue').prop('disabled', true).text('Confirming structure...');
        callBff('seal_structure', {run_id: state.runId, revision: state.structureRevision}).then(function(result) {
            state.currentStructure = result.structure_revision;
            state.structureRevision = result.structure_revision.revision;
            state.sectionMaterials = {};
            $('#btn-review-continue').text('Structure confirmed');
            setStep(3);
            renderActivityStructureStage();
        }).catch(function(err) {
            updateStructureContinueState();
            showError('Failed to confirm course structure: ' + err.message, err.details);
        });
    }

    function approveAndExecute() {
        clearError();
        if (state.requiresAiReview && !$('#ack-ai-expanded-content').is(':checked')) {
            showError('Teacher review is required before approval. Review every flagged Activity in this Plan revision and confirm the acknowledgment.');
            return;
        }
        $('#btn-approve-execute').prop('disabled', true);
        setStep(5);

        // Step 1: Approve
        $('#exec-step-approval').html('<i class="fa fa-spinner fa-spin text-primary mr-2"></i> Approving plan revision ' + state.revision + '...');

        callBff('approve_plan', {
            run_id: state.runId,
            plan_id: state.planId,
            revision: state.revision,
            acknowledge_ai_expanded_content: $('#ack-ai-expanded-content').is(':checked') ? 1 : 0
        }).then(function(approvedData) {
            state.approvedRevision = state.revision;
            $('#exec-step-approval').html('<i class="fa fa-check-circle text-success mr-2"></i> Approval checked (Revision ' + state.revision + ')');

            // Step 2: Validate execution
            $('#exec-step-validate').html('<i class="fa fa-spinner fa-spin text-primary mr-2"></i> Validating execution target...');
            return callBff('validate_execution', {
                plan_id: state.planId,
                revision: state.revision,
                category_id: state.selectedCategoryId
            });
        }).then(function(valResult) {
            $('#exec-step-validate').html('<i class="fa fa-check-circle text-success mr-2"></i> Plan validated');

            // Step 3: Execute run
            $('#exec-step-create').html('<i class="fa fa-spinner fa-spin text-primary mr-2"></i> Creating course in Moodle...');
            return callBff('execute_run', {
                run_id: state.runId,
                plan_id: state.planId,
                revision: state.revision,
                category_id: state.selectedCategoryId
            });
        }).then(function(execResult) {
            state.executionResult = execResult;
            $('#exec-step-create').html('<i class="fa fa-check-circle text-success mr-2"></i> Moodle course created');

            // Step 4: Verify run
            $('#exec-step-verify').html('<i class="fa fa-spinner fa-spin text-primary mr-2"></i> Verifying course result...');
            return callBff('verify_run', {
                run_id: state.runId,
                plan_id: state.planId,
                revision: state.revision
            });
        }).then(function(verifyResult) {
            $('#exec-step-verify').html('<i class="fa fa-check-circle text-success mr-2"></i> Result verified');

            // Complete!
            $('#success-course-title').text(state.executionResult.course_shortname || 'Created Course');
            var entities = state.executionResult.created_entities || {};
            $('#success-sections-count').text(entities.sections || 0);
            $('#success-assignments-count').text(entities.assignments || 0);
            $('#success-quizzes-count').text(entities.quizzes || 0);

            var courseUrl = state.executionResult.course_url || (M.cfg.wwwroot + '/course/view.php?id=' + state.executionResult.course_id);
            $('#btn-open-course').attr('href', courseUrl);

            setStep(6);
        }).catch(function(err) {
            $('#btn-approve-execute').prop('disabled', state.requiresAiReview && !$('#ack-ai-expanded-content').is(':checked'));
            setStep(4);
            showError('Execution failed: ' + err.message, err.details);
        });
    }

    return {
        init: function(config) {
            state.sesskey = config.sesskey;
            state.ajaxurl = config.ajaxurl;
            state.categories = config.categories || [];
            state.selectedCategoryId = $('#course-category-select').val();
            state.courseFormat = $('#course-format-select').val() || null;

            function updateGenerateButton() {
                $('#btn-generate-plan').prop('disabled', !state.selectedFile || !state.courseFormat);
            }

            // Course format is a teacher choice, never an LLM-generated field.
            $('#course-format-select').on('change', function() {
                state.courseFormat = $(this).val() || null;
                updateGenerateButton();
            });

            // Category select change
            $('#course-category-select').on('change', function() {
                state.selectedCategoryId = $(this).val();
            });

            // File selection
            $('#btn-choose-file, #syllabus-dropzone').on('click', function(e) {
                if (e.target.id !== 'syllabus-file-input') {
                    $('#syllabus-file-input').trigger('click');
                }
            });

            $('#syllabus-file-input').on('change', function() {
                var file = this.files[0];
                if (file) {
                    var sizeError = fileSizeValidationError(file, MAX_SYLLABUS_FILE_BYTES, 'Syllabus');
                    if (sizeError) {
                        state.selectedFile = null;
                        this.value = '';
                        $('#selected-file-info').addClass('d-none');
                        showError(sizeError);
                        updateGenerateButton();
                        return;
                    }
                    clearError();
                    state.selectedFile = file;
                    $('#selected-file-name').text(file.name + ' (' + Math.round(file.size / 1024) + ' KB)');
                    $('#selected-file-info').removeClass('d-none');
                    updateGenerateButton();
                }
            });

            // Drag and drop
            var $dropzone = $('#syllabus-dropzone');
            $dropzone.on('dragover dragenter', function(e) {
                e.preventDefault();
                e.stopPropagation();
                $dropzone.addClass('border-primary bg-white');
            });

            $dropzone.on('dragleave dragend drop', function(e) {
                e.preventDefault();
                e.stopPropagation();
                $dropzone.removeClass('border-primary bg-white');
            });

            $dropzone.on('drop', function(e) {
                var files = e.originalEvent.dataTransfer.files;
                if (files && files.length > 0) {
                    var file = files[0];
                    var sizeError = fileSizeValidationError(file, MAX_SYLLABUS_FILE_BYTES, 'Syllabus');
                    if (sizeError) {
                        state.selectedFile = null;
                        $('#selected-file-info').addClass('d-none');
                        showError(sizeError);
                        updateGenerateButton();
                        return;
                    }
                    clearError();
                    state.selectedFile = file;
                    $('#selected-file-name').text(file.name + ' (' + Math.round(file.size / 1024) + ' KB)');
                    $('#selected-file-info').removeClass('d-none');
                    updateGenerateButton();
                }
            });

            // Generate Plan
            $('#btn-generate-plan').on('click', startUploadAndPlan);

            // Review View Navigation & Actions
            $('#btn-review-back').on('click', function() {
                guardedNavigate(function() { setStep(1); });
            });

            $('#btn-review-regenerate').on('click', function() {
                if (confirm('Regenerate course plan?')) {
                    guardedNavigate(startUploadAndPlan);
                }
            });

            $('#btn-review-continue').on('click', function() { guardedNavigate(confirmStructureAndShowActivities); });
            $('#btn-activity-back').on('click', function() { guardedNavigate(function() { setStep(2); }); });
            $('#btn-activity-finalize').on('click', function() { guardedNavigate(finalizeStagedCourse); });

            // Editing modals
            $('#btn-edit-course-title').on('click', function() { guardedNavigate(openEditCourseTitleModal); });
            $('#btn-save-course-title').on('click', saveCourseTitle);
            $('#btn-save-section').on('click', saveSection);
            $('#btn-add-section').on('click', addSection);
            bindModalDismiss('#modal-edit-title');
            bindModalDismiss('#modal-edit-section');

            // Approve View Actions
            $('#btn-approve-back').on('click', function() {
                guardedNavigate(function() {
                    setStep(3);
                    renderActivityStructureStage();
                });
            });

            $('#ack-ai-expanded-content').on('change', function() {
                $('#btn-approve-execute').prop('disabled', state.requiresAiReview && !$(this).is(':checked'));
            });
            $('#btn-approve-execute').on('click', approveAndExecute);

            // Success View Actions
            $('#btn-create-another').on('click', function() {
                window.location.reload();
            });

            // Retry Button
            $('#btn-error-retry').on('click', function() {
                clearError();
            });

            if (!window.ticket05DraftUnloadBound && typeof window.addEventListener === 'function') {
                window.ticket05DraftUnloadBound = true;
                window.addEventListener('beforeunload', function(event) {
                    if (state.activeDraftGuard && state.activeDraftGuard.isDirty && state.activeDraftGuard.isDirty()) {
                        event.preventDefault();
                        event.returnValue = '';
                    }
                });
            }

            // A reload restores semantic state from the server; the URL carries only its run identifier.
            var contextRunId = new URL(window.location.href).searchParams.get('context_run_id');
            if (contextRunId) {
                state.runId = contextRunId;
                callBff('get_instructional_design', {run_id: contextRunId}).then(function(result) {
                    showCoreContext(result.core_context);
                    state.coreContextRevision = result.core_context.revision;
                    state.outcomeProposals = result.outcome_proposals || [];                    state.competencyCandidates = result.competency_candidates || [];
                    callBff('get_competency_candidates', {run_id: contextRunId}).then(function(candidateResult) { state.competencyCandidates = candidateResult.candidates || []; if (state.currentStructure) renderAlignmentReview(state.currentStructure); }).catch(function() {});
                    state.outcomeCoverage = result.coverage || [];
                    var restored = result.structure_revision;
                    if (restored) {
                        state.stagedMode = true;
                        state.structureRevision = restored.revision;
                        state.currentStructure = restored;
                        state.currentEnvelope = structurePreviewEnvelope(restored);
                        renderPreview(state.currentEnvelope, state.currentEnvelope);
                        loadOutcomeReviews().catch(function(reviewErr) { showError('Could not reload Outcome review state: ' + reviewErr.message, reviewErr.details); });
                        setStep(2);
                    }
                }).catch(function(err) { showError('Could not reload Course design state: ' + err.message); });
            }
            // Initial view
            setStep(1);
        }
    };
});
