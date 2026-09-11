import type { RiskRefreshOrigin } from '@moodle-agent-poc/agent-runtime';
import type { CoordinatedRiskRefreshResult, RiskRefreshChangeOriginHint, RiskRefreshResult } from './risk-refresh-types.js';

export interface CourseRefreshUseCase {
  refreshCourse(courseId: number, origin: RiskRefreshOrigin, changeOriginHint?: RiskRefreshChangeOriginHint): Promise<RiskRefreshResult>;
}

/** In-process per-course single-flight. Different courses remain concurrent. */
export class CourseRefreshCoordinator {
  private readonly inFlight = new Map<number, Promise<RiskRefreshResult>>();

  constructor(private readonly refreshService: CourseRefreshUseCase) {}

  refreshCourse(courseId: number, origin: RiskRefreshOrigin, changeOriginHint?: RiskRefreshChangeOriginHint): Promise<CoordinatedRiskRefreshResult> {
    const existing = this.inFlight.get(courseId);
    if (existing) {
      return existing.then((result) => ({ ...result, joined_existing_refresh: true }));
    }

    const underlying = this.refreshService.refreshCourse(courseId, origin, changeOriginHint);
    this.inFlight.set(courseId, underlying);
    void underlying.finally(() => {
      if (this.inFlight.get(courseId) === underlying) this.inFlight.delete(courseId);
    }).catch(() => undefined);

    return underlying.then((result) => ({ ...result, joined_existing_refresh: false }));
  }

  hasInFlight(courseId: number): boolean {
    return this.inFlight.has(courseId);
  }
}
