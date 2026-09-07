import type { McpClientManager } from "@moodle-agent-poc/agent-runtime";
import { type CategoryItem, CourseExecutionError } from "./types.js";

/**
 * Lists accessible Moodle course categories via MCP tool moodle_list_course_categories (T1101).
 */
export async function listCourseCategories(
  mcpClientManager: McpClientManager
): Promise<CategoryItem[]> {
  const result = await mcpClientManager.callTool("moodle_list_course_categories", {});

  if (result.status === "error") {
    throw new CourseExecutionError(
      result.code || "CATEGORY_LISTING_FAILED",
      `Failed to list course categories: ${result.message}`
    );
  }

  if (!Array.isArray(result.data)) {
    throw new CourseExecutionError(
      "INVALID_CATEGORY_DATA",
      "Expected array of categories from moodle_list_course_categories tool"
    );
  }

  return (result.data as Array<Record<string, unknown>>).map((item) => ({
    id: Number(item.id),
    name: String(item.name || ""),
    ...(item.idnumber !== undefined ? { idnumber: String(item.idnumber) } : {}),
    ...(item.description !== undefined ? { description: String(item.description) } : {}),
    ...(item.parent !== undefined ? { parent: Number(item.parent) } : {}),
    ...(item.coursecount !== undefined ? { coursecount: Number(item.coursecount) } : {}),
    ...(item.visible !== undefined ? { visible: Number(item.visible) } : {}),
  }));
}
