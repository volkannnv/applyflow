import { labels, stages } from '../Interfaces/application.ts';
import type { Application, Stage } from '../Interfaces/application.ts';

export const sankeyColors: Record<Stage, string> = {
  saved: '#8b9e94',
  applied: '#6f98c5',
  interview: '#a286c2',
  offer: '#5b9d79',
  rejected: '#ce8880',
};

export function buildSankey(applications: Application[]) {
  const total = applications.length;
  const counts = stages.map((stage) => ({
    stage,
    label: labels[stage],
    count: applications.filter((a) => a.stage === stage).length,
    color: sankeyColors[stage],
  }));
  const present = counts.filter((item) => item.count > 0);
  const flowHeight = 260;
  const gap = 38;
  const height = 480;
  const sourceY = (height - flowHeight) / 2;
  let sourceOffset = sourceY;
  let targetOffset = (height - flowHeight - Math.max(0, present.length - 1) * gap) / 2;
  const flows = present.map((item) => {
    const thickness = (item.count / total) * flowHeight;
    const flow = {
      ...item,
      thickness,
      sourceY: sourceOffset,
      targetY: targetOffset,
      percent: (item.count / total) * 100,
    };
    sourceOffset += thickness;
    targetOffset += thickness + gap;
    return flow;
  });
  return { total, counts, flows, sourceY, flowHeight };
}

export function ribbonPath(sourceY: number, targetY: number, thickness: number) {
  const x1 = 50,
    x2 = 574,
    curve = 312;
  return `M ${x1} ${sourceY} C ${curve} ${sourceY}, ${curve} ${targetY}, ${x2} ${targetY} L ${x2} ${targetY + thickness} C ${curve} ${targetY + thickness}, ${curve} ${sourceY + thickness}, ${x1} ${sourceY + thickness} Z`;
}
