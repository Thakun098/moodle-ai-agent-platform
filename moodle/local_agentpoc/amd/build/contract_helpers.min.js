/**
 * Helpers for keeping direct Preview edits within the frozen planning shape.
 *
 * @module     local_agentpoc/contract_helpers
 */
define([], function() {
    'use strict';

    function setOptionalString(target, property, value) {
        var normalized = typeof value === 'string' ? value.trim() : '';
        if (normalized) {
            target[property] = normalized;
        } else {
            delete target[property];
        }
    }

    function nextSectionDescriptor(sections) {
        var refs = {};
        var maxRefNumber = 0;
        var maxPosition = 0;

        (sections || []).forEach(function(section) {
            var ref = section && typeof section.ref === 'string' ? section.ref : '';
            refs[ref] = true;
            var refMatch = /^section-(\d+)$/.exec(ref);
            if (refMatch) {
                maxRefNumber = Math.max(maxRefNumber, parseInt(refMatch[1], 10));
            }

            var position = section ? Number(section.position) : 0;
            if (Number.isFinite(position)) {
                maxPosition = Math.max(maxPosition, position);
            }
        });

        var refNumber = maxRefNumber + 1;
        var ref = 'section-' + (refNumber < 10 ? '0' : '') + refNumber;
        while (refs[ref]) {
            refNumber++;
            ref = 'section-' + (refNumber < 10 ? '0' : '') + refNumber;
        }

        return {
            ref: ref,
            position: Math.floor(maxPosition) + 1,
            number: refNumber
        };
    }

    function normalizeSectionPositions(sections) {
        (sections || []).forEach(function(section, index) {
            section.position = index + 1;
        });
    }

    function removeSection(envelope, index) {
        var clone = JSON.parse(JSON.stringify(envelope));
        var sections = clone.content && clone.content.sections ? clone.content.sections : [];
        if (sections.length <= 1 || !sections[index]) {
            return null;
        }
        sections.splice(index, 1);
        normalizeSectionPositions(sections);
        return clone;
    }

    function removeActivity(envelope, sectionIndex, activityIndex) {
        var clone = JSON.parse(JSON.stringify(envelope));
        var section = clone.content && clone.content.sections ? clone.content.sections[sectionIndex] : null;
        if (!section || !section.activities || !section.activities[activityIndex]) {
            return null;
        }
        section.activities.splice(activityIndex, 1);
        return clone;
    }

    return {
        setOptionalString: setOptionalString,
        nextSectionDescriptor: nextSectionDescriptor,
        normalizeSectionPositions: normalizeSectionPositions,
        removeSection: removeSection,
        removeActivity: removeActivity
    };
});
