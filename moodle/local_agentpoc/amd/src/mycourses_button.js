/**
 * AI Course Builder My Courses Button Injection AMD Module.
 *
 * @module     local_agentpoc/mycourses_button
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define(['jquery'], function($) {
    'use strict';

    return {
        init: function(config) {
            config = config || {};
            if (typeof config === 'string') {
                config = { createurl: config };
            }
            if (!config.createurl || !config.label) {
                var $action = $('#local-agentpoc-mycourses-action');
                if ($action.length > 0) {
                    config.createurl = config.createurl || $action.data('createurl');
                    config.label = config.label || $action.data('label');
                }
            }
            config.label = config.label || 'Create course with AI';

            function inject() {
                if ($('#btn-create-course-with-ai').length > 0) {
                    return;
                }

                // Verify we are strictly on My courses page
                var isMyCourses = $('body').hasClass('page-mycourses') ||
                                  window.location.pathname.indexOf('/my/courses.php') !== -1;
                if (!isMyCourses) {
                    return;
                }

                var $btn = $('<a/>', {
                    id: 'btn-create-course-with-ai',
                    href: config.createurl,
                    class: 'btn btn-primary d-inline-flex align-items-center me-2 ms-2 my-1 shadow-sm',
                    html: '<i class="fa fa-magic mr-2 me-2" aria-hidden="true"></i><span>' + config.label + '</span>'
                });

                // Target 1: .header-actions-container inside #page-header
                var $headerActions = $('#page-header .header-actions-container');
                if ($headerActions.length > 0) {
                    $headerActions.prepend($btn);
                    return;
                }

                // Target 2: Header flex row
                var $headerFlex = $('#page-header .d-flex.align-items-center');
                if ($headerFlex.length > 0) {
                    var $wrap = $('<div class="header-actions-container ms-auto d-flex align-items-center"></div>');
                    $wrap.append($btn);
                    $headerFlex.append($wrap);
                    return;
                }

                // Target 3: Adjacent to page header headings
                var $headings = $('#page-header .page-context-header');
                if ($headings.length > 0) {
                    $headings.after($btn);
                    return;
                }

                // Fallback
                $('#page-header').append($btn);
            }

            if (document.readyState === 'loading') {
                $(document).ready(inject);
            } else {
                inject();
            }
        }
    };
});
