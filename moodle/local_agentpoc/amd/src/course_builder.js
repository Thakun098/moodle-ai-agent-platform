/**
 * AI Course Builder AMD Module.
 *
 * @module     local_agentpoc/course_builder
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define(['jquery', 'local_agentpoc/contract_helpers'], function($, contractHelpers) {
    'use strict';

    var state = {
        sesskey: '',
        ajaxurl: '',
        categories: [],
        selectedCategoryId: null,
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
        activityLoadingCount: 0
    };

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
                        activities: []
                    };
                })
            }
        };
    }

    function saveStructureRevision(structure) {
        return callBff('save_structure_revision', {
            run_id: state.runId,
            structure: JSON.stringify(structure)
        }).then(function(result) {
            state.structureRevision = result.structure_revision.revision;
            state.currentStructure = result.structure_revision;
            state.sectionMaterials = {};
            $('#material-generation-stage').remove();
            $('#btn-review-continue').prop('disabled', false).text('Confirm structure');
            var envelope = structurePreviewEnvelope(result.structure_revision);
            state.currentEnvelope = envelope;
            renderPreview(envelope, envelope);
            return result;
        });
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

        sections.forEach(function(sec, idx) {
            var secNum = idx + 1;
            var $secCard = $('<div class="card mb-3 border-light bg-light"></div>');
            var $secHeader = $('<div class="card-header bg-white d-flex justify-content-between align-items-center py-2"></div>');
            $secHeader.append($('<span class="font-weight-bold"></span>').text(secNum + '. ' + (sec.title || 'Section ' + secNum)));

            var $editBtn = $('<button type="button" class="btn btn-sm btn-link text-secondary p-0"><i class="fa fa-pencil mr-1"></i>Edit</button>');
            $editBtn.on('click', function() {
                openEditSectionModal(idx);
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
                }
            }

            $secCard.append($secBody);
            $container.append($secCard);
        });

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

    function openEditCourseTitleModal() {
        var course = state.currentEnvelope ? state.currentEnvelope.content.course : {};
        $('#input-edit-course-title').val(course.title || $('#preview-course-title').text());
        $('#input-edit-course-summary').val(course.summary || $('#preview-course-summary').text());
        $('#modal-edit-title').modal('show');
    }

    function saveCourseTitle() {
        var newTitle = $('#input-edit-course-title').val().trim();
        var newSummary = $('#input-edit-course-summary').val().trim();

        if (!newTitle) {
            alert('Course title cannot be empty.');
            return;
        }

        $('#modal-edit-title').modal('hide');

        // Clone envelope and update title
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
            saveStructureRevision(structure).catch(function(err) {
                showError('Failed to save revised course structure: ' + err.message, err.details);
            });
            return;
        }

        // Post to save_revision -> creates Revision N+1
        callBff('save_revision', {
            plan_id: state.planId,
            envelope: JSON.stringify(newEnvelope),
            summary: 'Updated course title and summary'
        }).then(function(res) {
            state.revision = res.plan.revision;
            state.currentEnvelope = res.plan.rawEnvelope;
            renderPreview(res.preview, res.plan.rawEnvelope);
        }).catch(function(err) {
            showError('Failed to save revised course title: ' + err.message, err.details);
        });
    }

    function openEditSectionModal(index) {
        var sections = state.currentEnvelope.content.sections || [];
        var sec = sections[index] || {};
        $('#input-edit-section-index').val(index);
        $('#input-edit-section-title').val(sec.title || '');
        $('#input-edit-section-summary').val(sec.summary || '');
        $('#modal-edit-section').modal('show');
    }

    function saveSection() {
        var index = parseInt($('#input-edit-section-index').val(), 10);
        var newTitle = $('#input-edit-section-title').val().trim();
        var newSummary = $('#input-edit-section-summary').val().trim();

        if (!newTitle) {
            alert('Section title cannot be empty.');
            return;
        }

        $('#modal-edit-section').modal('hide');

        var newEnvelope = JSON.parse(JSON.stringify(state.currentEnvelope));
        if (!newEnvelope.content.sections[index]) {
            return;
        }
        newEnvelope.content.sections[index].title = newTitle;
        contractHelpers.setOptionalString(newEnvelope.content.sections[index], 'summary', newSummary);

        if (state.stagedMode) {
            var structure = JSON.parse(JSON.stringify(state.currentStructure));
            structure.content.sections[index].title = newTitle;
            structure.content.sections[index].summary = newSummary;
            saveStructureRevision(structure).catch(function(err) {
                showError('Failed to save revised course structure section: ' + err.message, err.details);
            });
            return;
        }

        callBff('save_revision', {
            plan_id: state.planId,
            envelope: JSON.stringify(newEnvelope),
            summary: 'Updated section ' + (index + 1) + ' title'
        }).then(function(res) {
            state.revision = res.plan.revision;
            state.currentEnvelope = res.plan.rawEnvelope;
            renderPreview(res.preview, res.plan.rawEnvelope);
        }).catch(function(err) {
            showError('Failed to save revised section: ' + err.message, err.details);
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
            state.revision = res.plan.revision;
            state.currentEnvelope = res.plan.rawEnvelope;
            renderPreview(res.preview, res.plan.rawEnvelope);
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
            state.revision = res.plan.revision;
            state.currentEnvelope = res.plan.rawEnvelope;
            renderPreview(res.preview, res.plan.rawEnvelope);
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
            state.revision = res.plan.revision;
            state.currentEnvelope = res.plan.rawEnvelope;
            renderPreview(res.preview, res.plan.rawEnvelope);
        }).catch(function(err) {
            showError('Failed to add section: ' + err.message, err.details);
        });
    }

    function populateApproveView() {
        var course = state.currentEnvelope ? state.currentEnvelope.content.course : {};
        $('#approve-summary-title').text(course.title || $('#preview-course-title').text());

        var catName = $('#course-category-select option:selected').text();
        $('#approve-summary-category').text(catName);
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

        clearError();
        $('#btn-generate-plan').prop('disabled', true);
        $('#upload-progress-area').removeClass('d-none');
        $('#upload-progress-status').text('Uploading syllabus file...');

        var formData = new FormData();
        formData.append('syllabus_file', state.selectedFile);
        formData.append('category_id', state.selectedCategoryId);

        var notes = $('#optional-notes').val().trim();
        if (notes) {
            formData.append('notes', notes);
        }

        callBff('upload_and_create_run', formData, true).then(function(runData) {
            state.runId = runData.run_id;
            state.stagedMode = true;
            state.teacherInstruction = notes;
            startProgressPolling();
            $('#upload-progress-status').text('Designing course structure with AI...');
            return callBff('generate_structure', {run_id: state.runId, teacher_instruction: state.teacherInstruction});
        }).then(function(structureResult) {
            stopProgressPolling();
            state.structureRevision = structureResult.structure_revision.revision;
            state.currentStructure = structureResult.structure_revision;
            state.currentEnvelope = structurePreviewEnvelope(state.currentStructure);
            renderPreview(state.currentEnvelope, state.currentEnvelope);
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
            state.requiresAiReview = (result.plan.reviewRequirements || []).some(function(item) { return item && item.code === 'AI_EXPANDED_CONTENT'; });
            $('#ack-ai-expanded-content').prop('checked', false);
            $('#ai-review-ack-area').toggleClass('d-none', !state.requiresAiReview);
            $('#btn-approve-execute').prop('disabled', state.requiresAiReview);
            return callBff('get_preview', {plan_id: state.planId, revision: state.revision}).then(function(preview) {
                renderPreview(preview, state.currentEnvelope);
                populateApproveView();
                setStep(4);
            });
        }).catch(function(err) {
            updateActivityFinalizeState();
            showError('Final CoursePlan is not ready: ' + err.message, err.details);
        });
    }

    function renderActivityStructureStage() {
        var $container = $('#activity-structure-container');
        $container.empty();
        state.activityIntents = {};
        var sections = (state.currentStructure && state.currentStructure.content && state.currentStructure.content.sections) || [];
        state.activityLoadingCount = sections.length;
        updateActivityFinalizeState();

        sections.forEach(function(section) {
            var materialState = state.sectionMaterials[section.ref] || {snapshotId: null, filename: null};
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
            $material.append($('<div class="small text-muted mb-2"></div>').text('Upload one file set for this week. If omitted, selected activities use the syllabus fallback policy.'));
            var $materialLabel = $('<div class="small mb-2"></div>');
            var $materialControls = $('<div class="d-flex flex-wrap align-items-center"></div>');
            var $file = $('<input type="file" class="form-control-file mr-2 mb-2" style="max-width: 360px;" accept=".txt,.md,.markdown,.docx,.pdf,.pptx">');
            var $upload = $('<button type="button" class="btn btn-outline-secondary btn-sm mb-2"></button>');
            $materialControls.append($file).append($upload);
            $material.append($materialLabel).append($materialControls);
            $body.append($material);

            var $panelsRow = $('<div class="row"></div>');
            var $quizCol = $('<div class="col-lg-6 mb-3"></div>');
            var $assignmentCol = $('<div class="col-lg-6 mb-3"></div>');
            var $quizPanel = $('<div class="activity-type-panel p-3"></div>');
            var $assignmentPanel = $('<div class="activity-type-panel p-3"></div>');
            $quizCol.append($quizPanel);
            $assignmentCol.append($assignmentPanel);
            $panelsRow.append($quizCol).append($assignmentCol);
            $body.append($panelsRow);
            $card.append($body);
            $container.append($card);

            var $quizCount = $('<input type="number" min="1" class="form-control form-control-sm" value="5">');
            var $quizType = $('<select class="form-control form-control-sm"><option value="multichoice">Multiple Choice</option><option value="truefalse">True / False</option><option value="shortanswer">Short Answer</option><option value="essay">Essay</option></select>');
            var $quizChoices = $('<input type="number" min="2" class="form-control form-control-sm" value="4">');
            var $assignmentGrade = $('<input type="number" min="1" class="form-control form-control-sm" value="100">');

            function getIntent(type) {
                return (state.activityIntents[section.ref] || []).find(function(intent) { return intent.activity_type === type; }) || null;
            }

            function syncOptionInputs() {
                var quizIntent = getIntent('quiz');
                var assignmentIntent = getIntent('assignment');
                if (quizIntent && quizIntent.options) {
                    if (quizIntent.options.question_count) $quizCount.val(quizIntent.options.question_count);
                    if (quizIntent.options.question_type) $quizType.val(quizIntent.options.question_type);
                    if (quizIntent.options.choices_per_question) $quizChoices.val(quizIntent.options.choices_per_question);
                }
                if (assignmentIntent && assignmentIntent.options && assignmentIntent.options.grade) {
                    $assignmentGrade.val(assignmentIntent.options.grade);
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
                if (materialState.filename) {
                    $materialLabel.html('<i class="fa fa-file-text-o text-success mr-1"></i> Current Material: ').append($('<strong></strong>').text(materialState.filename));
                    $upload.text('Replace Material');
                } else {
                    $materialLabel.html('<i class="fa fa-info-circle text-muted mr-1"></i> No Material uploaded — syllabus fallback will be used.');
                    $upload.text('Upload Material');
                }
                var creating = (state.activityIntents[section.ref] || []).some(function(intent) { return intent.status === 'creating'; });
                $upload.prop('disabled', creating);
            }

            function renderGeneratedPreview(intent, $panel) {
                if (!intent || !intent.activity) return;
                var $preview = $('<div class="bg-light border rounded p-2 mb-3 small"></div>');
                $preview.append($('<div class="font-weight-bold mb-1"></div>').text(intent.status === 'shell' ? 'Empty Activity Shell Preview' : 'Generated Activity Preview'));
                if (intent.review_required) {
                    $preview.append($('<div class="alert alert-warning py-1 px-2 mb-2"></div>').text('AI-expanded content based on syllabus scope — Teacher review required.'));
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
                    var questions = intent.activity.questions || [];
                    if (!questions.length) $preview.append($('<div class="text-muted"></div>').text('No questions yet.'));
                    questions.forEach(function(question, index) {
                        var text = question.question_text || question.text || question.name || ('Question ' + (index + 1));
                        $preview.append($('<div class="mb-1"></div>').text((index + 1) + '. ' + text));
                    });
                }
                $panel.append($preview);
            }

            function persistSelection() {
                $quiz.prop('disabled', true);
                $assignment.prop('disabled', true);
                return callBff('set_activity_intents', {
                    run_id: state.runId,
                    section_ref: section.ref,
                    quiz: $quiz.is(':checked') ? 1 : 0,
                    assignment: $assignment.is(':checked') ? 1 : 0,
                    quiz_options: quizOptions(),
                    assignment_options: assignmentOptions()
                }).then(function(result) {
                    state.activityIntents[section.ref] = result.intents || [];
                    syncOptionInputs();
                    return result;
                }).finally(function() {
                    $quiz.prop('disabled', false);
                    $assignment.prop('disabled', false);
                });
            }

            function generateSelectedActivity(type, instruction, $button) {
                $button.prop('disabled', true).html('<i class="fa fa-spinner fa-spin mr-1"></i> Creating...');
                $('#btn-activity-finalize').prop('disabled', true);
                return persistSelection().then(function() {
                    var current = getIntent(type);
                    if (!current) throw new Error(type + ' is no longer selected.');
                    return callBff('generate_activity', {
                        run_id: state.runId,
                        section_ref: section.ref,
                        activity_ref: current.activity_ref,
                        generation_instruction: instruction
                    });
                }).then(function(result) {
                    var list = state.activityIntents[section.ref] || [];
                    var index = list.findIndex(function(item) { return item.activity_ref === result.activity_ref; });
                    if (index >= 0) list[index] = result;
                    else list.push(result);
                    syncOptionInputs();
                    renderPanels();
                }).catch(function(err) {
                    showError((type === 'quiz' ? 'Quiz' : 'Assignment') + ' generation failed: ' + err.message, err.details);
                    return callBff('get_activity_intents', {run_id: state.runId, section_ref: section.ref}).then(function(result) {
                        state.activityIntents[section.ref] = result.intents || [];
                        syncOptionInputs();
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

                if (intent.grounding_mode) {
                    var grounding = 'Grounding: ' + intent.grounding_mode;
                    if (intent.review_required) grounding += ' • Teacher review required';
                    $panel.append($('<div class="small text-muted mb-2"></div>').text(grounding));
                }
                if (intent.error) {
                    $panel.append($('<div class="alert alert-warning py-2 small mb-2"></div>').text(intent.error));
                }

                var $promptLabel = $('<label class="small font-weight-bold mb-1"></label>').text(label + ' Prompt (Optional)');
                var $prompt = $('<textarea class="form-control form-control-sm mb-2" rows="3"></textarea>').attr('placeholder', isQuiz ? 'e.g., Focus on concepts from this week and keep questions beginner-friendly...' : "e.g., Ask students to build a small class that applies this week's concepts...");
                if (intent.generation_instruction) $prompt.val(intent.generation_instruction);
                $panel.append($promptLabel).append($prompt);

                var terminal = intent.status === 'generated' || intent.status === 'shell' || intent.status === 'creating' || intent.status === 'retry_exhausted';
                var $advanced = $('<details class="mb-3"></details>');
                $advanced.append($('<summary class="small font-weight-bold text-secondary" style="cursor:pointer;">Advanced Settings</summary>'));
                var $advancedBody = $('<div class="border rounded bg-light p-2 mt-2"></div>');
                if (isQuiz) {
                    var $row = $('<div class="form-row"></div>');
                    var $countGroup = $('<div class="form-group col-4 mb-1"></div>').append('<label class="small mb-1">Questions</label>').append($quizCount);
                    var $typeGroup = $('<div class="form-group col-5 mb-1"></div>').append('<label class="small mb-1">Type</label>').append($quizType);
                    var $choiceGroup = $('<div class="form-group col-3 mb-1"></div>').append('<label class="small mb-1">Choices</label>').append($quizChoices);
                    $row.append($countGroup).append($typeGroup).append($choiceGroup);
                    $advancedBody.append($row);
                    $quizCount.prop('disabled', terminal);
                    $quizType.prop('disabled', terminal);
                    $quizChoices.prop('disabled', terminal || $quizType.val() !== 'multichoice');
                } else {
                    $advancedBody.append($('<div class="form-group mb-1"></div>').append('<label class="small mb-1">Grade</label>').append($assignmentGrade));
                    $assignmentGrade.prop('disabled', terminal);
                }
                $advanced.append($advancedBody);
                $panel.append($advanced);

                renderGeneratedPreview(intent, $panel);

                var $actions = $('<div class="d-flex flex-wrap align-items-center"></div>');
                var canGenerate = ['selected', 'failed', 'timed_out', 'insufficient_evidence', 'stale'].indexOf(intent.status) !== -1 && intent.attempt_count < intent.max_attempts;
                var $generate = $('<button type="button" class="btn btn-outline-primary btn-sm mr-2"></button>');
                $generate.text(intent.attempt_count > 0 ? 'Retry Generate' : ('Generate ' + label)).prop('disabled', !canGenerate);
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
                var quizIntent = getIntent('quiz');
                var assignmentIntent = getIntent('assignment');
                $quiz.prop('checked', Boolean(quizIntent));
                $assignment.prop('checked', Boolean(assignmentIntent));
                $quiz.prop('disabled', Boolean(quizIntent && quizIntent.status === 'creating'));
                $assignment.prop('disabled', Boolean(assignmentIntent && assignmentIntent.status === 'creating'));
                updateMaterialView();
                renderPanel('quiz', $quizPanel);
                renderPanel('assignment', $assignmentPanel);
                if (!intents.length) {
                    $material.addClass('text-muted');
                } else {
                    $material.removeClass('text-muted');
                }
                updateActivityFinalizeState();
            }

            $quizType.on('change', function() {
                $quizChoices.prop('disabled', $quizType.val() !== 'multichoice');
            });

            function saveSelection() {
                persistSelection().then(function() {
                    renderPanels();
                }).catch(function(err) {
                    showError('Failed to update Activity selection: ' + err.message, err.details);
                    return callBff('get_activity_intents', {run_id: state.runId, section_ref: section.ref}).then(function(result) {
                        state.activityIntents[section.ref] = result.intents || [];
                        syncOptionInputs();
                        renderPanels();
                    });
                });
            }

            $quiz.on('change', saveSelection);
            $assignment.on('change', saveSelection);

            $upload.on('click', function() {
                var file = $file[0].files && $file[0].files[0];
                if (!file) {
                    showError('Choose a Learning Material file for ' + weekTitle + '.');
                    return;
                }
                $upload.prop('disabled', true).html('<i class="fa fa-spinner fa-spin mr-1"></i> Uploading...');
                var formData = new FormData();
                formData.append('material_file', file);
                formData.append('run_id', state.runId);
                formData.append('section_ref', section.ref);
                formData.append('structure_revision', state.structureRevision);
                callBff('upload_section_material', formData, true).then(function() {
                    return callBff('seal_section_material', {run_id: state.runId, section_ref: section.ref, structure_revision: state.structureRevision});
                }).then(function(result) {
                    materialState.snapshotId = (result.snapshot && (result.snapshot.persisted_id || result.snapshot.id)) || result.id;
                    materialState.filename = file.name;
                    return callBff('get_activity_intents', {run_id: state.runId, section_ref: section.ref});
                }).then(function(result) {
                    state.activityIntents[section.ref] = result.intents || [];
                    syncOptionInputs();
                    renderPanels();
                }).catch(function(err) {
                    updateMaterialView();
                    showError('Learning Material upload failed: ' + err.message, err.details);
                });
            });

            callBff('get_activity_intents', {run_id: state.runId, section_ref: section.ref}).then(function(result) {
                state.activityIntents[section.ref] = result.intents || [];
                state.activityLoadingCount = Math.max(0, state.activityLoadingCount - 1);
                syncOptionInputs();
                renderPanels();
            }).catch(function(err) {
                state.activityLoadingCount = Math.max(0, state.activityLoadingCount - 1);
                renderPanels();
                showError('Failed to load Activity Structure: ' + err.message, err.details);
            });
        });
    }

    function confirmStructureAndShowActivities() {
        if (!state.stagedMode) { setStep(3); return; }
        $('#btn-review-continue').prop('disabled', true).text('Confirming structure...');
        callBff('seal_structure', {run_id: state.runId, revision: state.structureRevision}).then(function(result) {
            state.currentStructure = result.structure_revision;
            state.structureRevision = result.structure_revision.revision;
            state.sectionMaterials = {};
            $('#btn-review-continue').text('Structure confirmed');
            setStep(3);
            renderActivityStructureStage();
        }).catch(function(err) {
            $('#btn-review-continue').prop('disabled', false).text('Continue to Activity Structure');
            showError('Failed to confirm course structure: ' + err.message, err.details);
        });
    }

    function approveAndExecute() {
        clearError();
        if (state.requiresAiReview && !$('#ack-ai-expanded-content').is(':checked')) {
            showError('Teacher review is required before approval. Review the AI-expanded activities and confirm the acknowledgment.');
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
                    state.selectedFile = file;
                    $('#selected-file-name').text(file.name + ' (' + Math.round(file.size / 1024) + ' KB)');
                    $('#selected-file-info').removeClass('d-none');
                    $('#btn-generate-plan').prop('disabled', false);
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
                    state.selectedFile = file;
                    $('#selected-file-name').text(file.name + ' (' + Math.round(file.size / 1024) + ' KB)');
                    $('#selected-file-info').removeClass('d-none');
                    $('#btn-generate-plan').prop('disabled', false);
                }
            });

            // Generate Plan
            $('#btn-generate-plan').on('click', startUploadAndPlan);

            // Review View Navigation & Actions
            $('#btn-review-back').on('click', function() {
                setStep(1);
            });

            $('#btn-review-regenerate').on('click', function() {
                if (confirm('Regenerate course plan? Any unsaved edits will be discarded.')) {
                    startUploadAndPlan();
                }
            });

            $('#btn-review-continue').on('click', confirmStructureAndShowActivities);
            $('#btn-activity-back').on('click', function() { setStep(2); });
            $('#btn-activity-finalize').on('click', finalizeStagedCourse);

            // Editing modals
            $('#btn-edit-course-title').on('click', openEditCourseTitleModal);
            $('#btn-save-course-title').on('click', saveCourseTitle);
            $('#btn-save-section').on('click', saveSection);
            $('#btn-add-section').on('click', addSection);
            bindModalDismiss('#modal-edit-title');
            bindModalDismiss('#modal-edit-section');

            // Approve View Actions
            $('#btn-approve-back').on('click', function() {
                setStep(3);
                renderActivityStructureStage();
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

            // Initial view
            setStep(1);
        }
    };
});
