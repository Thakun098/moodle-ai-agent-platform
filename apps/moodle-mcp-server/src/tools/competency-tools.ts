import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MoodleClient } from '@moodle-agent-poc/moodle-client';
import { formatMcpError, formatMcpSuccess } from '../errors.js';
import {
  AddCompetencyToActivityInputSchema,
  AddCompetencyToActivityOutputSchema,
  AddCompetencyToCourseInputSchema,
  AddCompetencyToCourseOutputSchema,
  CreateCompetencyInputSchema,
  CreateCompetencyOutputSchema,
  GetCourseCompetenciesInputSchema,
  GetCourseCompetenciesOutputSchema,
  ListCompetencyFrameworksInputSchema,
  ListCompetencyFrameworksOutputSchema,
} from '../schemas/index.js';

export function registerCompetencyTools(server: McpServer, moodleClient: MoodleClient): void {
  server.registerTool('moodle_list_competency_frameworks', {
    description: 'List visible Moodle Competency Frameworks and whether the caller can manage each framework.',
    inputSchema: ListCompetencyFrameworksInputSchema,
    outputSchema: ListCompetencyFrameworksOutputSchema,
  }, async (raw) => {
    try {
      ListCompetencyFrameworksInputSchema.parse(raw);
      const frameworks = await moodleClient.listCompetencyFrameworks();
      return formatMcpSuccess({ frameworks: frameworks.map((f) => ({ framework_id: f.frameworkId, shortname: f.shortname, idnumber: f.idnumber, visible: f.visible, can_manage: f.canManage })) }, `Retrieved ${frameworks.length} visible Competency Framework(s)`);
    } catch (error) { return formatMcpError(error); }
  });

  server.registerTool('moodle_create_competency', {
    description: 'Create or reconcile one approved Competency in an explicitly selected Moodle Competency Framework.',
    inputSchema: CreateCompetencyInputSchema,
    outputSchema: CreateCompetencyOutputSchema,
  }, async (raw) => {
    try {
      const a = CreateCompetencyInputSchema.parse(raw);
      const r = await moodleClient.createCompetency({ frameworkId: a.framework_id, idnumber: a.idnumber, shortname: a.shortname, description: a.description });
      return formatMcpSuccess({ competency_id: r.competencyId, framework_id: r.frameworkId, idnumber: r.idnumber, shortname: r.shortname, created: r.created }, `Competency ${r.idnumber} reconciled as Moodle ID ${r.competencyId}`);
    } catch (error) { return formatMcpError(error); }
  });

  server.registerTool('moodle_add_competency_to_course', {
    description: 'Attach a native Moodle Competency to a Course.', inputSchema: AddCompetencyToCourseInputSchema, outputSchema: AddCompetencyToCourseOutputSchema,
  }, async (raw) => {
    try { const a = AddCompetencyToCourseInputSchema.parse(raw); const r = await moodleClient.addCompetencyToCourse({ courseId: a.course_id, competencyId: a.competency_id }); return formatMcpSuccess({ course_id: r.courseId, competency_id: r.competencyId, linked: r.linked }, `Competency ${r.competencyId} linked to Course ${r.courseId}`); }
    catch (error) { return formatMcpError(error); }
  });

  server.registerTool('moodle_add_competency_to_activity', {
    description: 'Attach a Course Competency to an Activity and explicitly set no-evidence or evidence rule behavior.', inputSchema: AddCompetencyToActivityInputSchema, outputSchema: AddCompetencyToActivityOutputSchema,
  }, async (raw) => {
    try { const a = AddCompetencyToActivityInputSchema.parse(raw); const r = await moodleClient.addCompetencyToActivity({ activityId: a.activity_id, competencyId: a.competency_id, ruleOutcome: a.rule_outcome }); return formatMcpSuccess({ link_id: r.linkId, activity_id: r.activityId, competency_id: r.competencyId, rule_outcome: r.ruleOutcome }, `Competency ${r.competencyId} linked to Activity ${r.activityId}`); }
    catch (error) { return formatMcpError(error); }
  });

  server.registerTool('moodle_get_course_competencies', {
    description: 'Read Moodle-native Course Competencies and Activity↔Competency link rule outcomes.', inputSchema: GetCourseCompetenciesInputSchema, outputSchema: GetCourseCompetenciesOutputSchema,
  }, async (raw) => {
    try { const a = GetCourseCompetenciesInputSchema.parse(raw); const r = await moodleClient.getCourseCompetencies(a.course_id); return formatMcpSuccess({ course_id: r.courseId, course_competencies: r.courseCompetencies.map((c) => ({ course_link_id: c.courseLinkId, competency_id: c.competencyId, framework_id: c.frameworkId, idnumber: c.idnumber, shortname: c.shortname, description: c.description })), activity_links: r.activityLinks.map((l) => ({ link_id: l.linkId, activity_id: l.activityId, competency_id: l.competencyId, rule_outcome: l.ruleOutcome })) }, `Read ${r.courseCompetencies.length} Course Competency(ies) and ${r.activityLinks.length} Activity link(s)`); }
    catch (error) { return formatMcpError(error); }
  });
}
