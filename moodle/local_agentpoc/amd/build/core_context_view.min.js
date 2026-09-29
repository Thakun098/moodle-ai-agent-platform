/** Read-only rendering of the server-owned instructional context. */
define([], function() {
    'use strict';
    function escape(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function(c) {
            return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c];
        });
    }
    function sources(refs) {
        return (refs || []).map(function(ref) {
            return '<small class="d-block text-muted">Source line ' + escape(ref.start_line) + ': ' + escape(ref.text) + '</small>';
        }).join('');
    }
    function list(title, facts) {
        return '<h4 class="h6 mt-3">' + escape(title) + '</h4><ul>' + ((facts || []).map(function(f) {
            return '<li>' + escape(f.source_text || f.text) + sources(f.source_refs) + '</li>';
        }).join('') || '<li>Not specified in syllabus</li>') + '</ul>';
    }
    function render(context) {
        if (!context) return '';
        var learner = context.learner_context;
        var language = context.primary_output_language || {};
        var languageLabel = language.code === 'th' ? 'Thai' : language.code === 'en' ? 'English' : 'Unknown';
        var html = '<h3 class="h5">Course design context</h3><p>Source: ' + escape(context.source_syllabus.filename) +
            ' · Revision ' + escape(context.revision) + '</p>';
        html += '<div class="alert alert-info py-2 primary-output-language"><strong>Primary Output Language:</strong> ' +
            escape(languageLabel) + (language.code ? ' (' + escape(language.code) + ')' : '') +
            (language.derived_from ? ' · Derived from ' + escape(String(language.derived_from).replace(/_/g, ' ').toLowerCase()) : '') +
            '</div>';
        html += list('Learning Objectives', context.learning_objectives);
        html += list('Source Learning Outcomes — awaiting Teacher review', context.source_learning_outcomes);
        html += '<h4 class="h6">Learner context: ' + escape(learner.status) + '</h4>';
        ['target_learners', 'education_level', 'year_level', 'prerequisites', 'prior_knowledge'].forEach(function(key) {
            html += list(key.replace(/_/g, ' '), learner[key]);
        });
        ['duration', 'learning_hours', 'delivery_mode'].forEach(function(key) { html += list(key.replace(/_/g, ' '), context.course[key]); });
        html += list('Assessment requirements', context.assessment_requirements);
        html += list('Grading policy', context.grading_policy);
        html += list('Constraints', context.constraints);
        html += '<h4 class="h6">Information requiring review</h4><ul>';
        context.missing_information.forEach(function(item) {
            html += '<li><strong>' + escape(item.severity) + '</strong> · ' + escape(item.applies_to_stage.join(', ')) + ': ' + escape(item.message) + '</li>';
        });
        return html + '</ul>';
    }
    return {render: render};
});
