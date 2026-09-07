/** Structure notes never authorize Activity existence (ADR-0002). */
export function interpretStructureInstruction(instruction?: string): { originalInstruction: string; warnings: string[] } {
  const originalInstruction = instruction?.trim() ?? "";
  const activityRequest = /\bquiz\b|\bassignment\b|แบบทดสอบ|ควิซ|งานมอบหมาย|การบ้าน/iu.test(originalInstruction);
  return { originalInstruction, warnings: activityRequest ? ["Quiz/Assignment requests in Structure Instruction do not select activities. Select them explicitly in the Activity Creation Step."] : [] };
}
