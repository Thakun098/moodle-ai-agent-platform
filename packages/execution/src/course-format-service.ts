import type { McpClientManager } from "@moodle-agent-poc/agent-runtime";
import { CourseExecutionError } from "./types.js";

export interface CourseFormatItem {
  value: string;
  name: string;
}

/** Lists the course formats currently enabled by the target Moodle site. */
export async function listCourseFormats(
  mcpClientManager: McpClientManager
): Promise<CourseFormatItem[]> {
  const result = await mcpClientManager.callTool("moodle_list_course_formats", {});

  if (result.status === "error") {
    throw new CourseExecutionError(
      result.code || "COURSE_FORMAT_LISTING_FAILED",
      `Failed to list Moodle course formats: ${result.message}`
    );
  }

  if (!Array.isArray(result.data)) {
    throw new CourseExecutionError(
      "INVALID_COURSE_FORMAT_DATA",
      "Expected an array from moodle_list_course_formats"
    );
  }

  return (result.data as Array<Record<string, unknown>>).map((item) => ({
    value: String(item.value || ""),
    name: String(item.name || ""),
  }));
}
