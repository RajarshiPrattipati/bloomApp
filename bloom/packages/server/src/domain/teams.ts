// Team Projects (GDD §10): everyone contributes coins toward a shared goal;
// crossing a milestone % grants rewards. Pure functions over a TeamProject.

import { BALANCE } from '@bloom/shared';

export interface TeamProject {
  kind: string;
  target: number;
  progress: number;
  milestonesHit: number[];
}

export function newProject(kind = 'Festival Tower'): TeamProject {
  return { kind, target: BALANCE.teams.projectTargetCoins, progress: 0, milestonesHit: [] };
}

export function projectPct(p: TeamProject): number {
  return Math.min(100, Math.floor((p.progress / p.target) * 100));
}

/** Apply a contribution; returns the milestone %s newly crossed (for rewards). */
export function applyContribution(p: TeamProject, amount: number): number[] {
  const before = projectPct(p);
  p.progress = Math.min(p.target, p.progress + amount);
  const after = projectPct(p);
  const crossed: number[] = [];
  for (const m of BALANCE.teams.projectMilestonePcts) {
    if (before < m && after >= m && !p.milestonesHit.includes(m)) {
      p.milestonesHit.push(m);
      crossed.push(m);
    }
  }
  return crossed;
}
