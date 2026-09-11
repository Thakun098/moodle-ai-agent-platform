import type { CoordinatedRiskRefreshResult, RiskRefreshChangeOriginHint } from './risk-refresh-types.js';
import { CourseRefreshCoordinator } from './course-refresh-coordinator.js';

export class ManualRiskRefreshAdapter {
  constructor(private readonly coordinator: CourseRefreshCoordinator) {}

  refreshCourse(courseId: number, changeOriginHint?: RiskRefreshChangeOriginHint): Promise<CoordinatedRiskRefreshResult> {
    return this.coordinator.refreshCourse(courseId, 'MANUAL', changeOriginHint);
  }
}

export class NightlyRiskRefreshAdapter {
  constructor(private readonly coordinator: CourseRefreshCoordinator) {}

  refreshCourse(courseId: number): Promise<CoordinatedRiskRefreshResult> {
    return this.coordinator.refreshCourse(courseId, 'NIGHTLY');
  }
}
