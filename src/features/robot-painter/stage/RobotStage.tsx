import { useState } from 'react';
import type { KitClock } from '../../../core/activityKit/scheduler.ts';
import type { Scope } from '../../../core/activityKit/scope.ts';
import robotArt from '../../../../assets/art/activities/robot-painter/robot.svg';
import { emojiUrl } from '../../../registry/emoji.ts';
import { ColorShape, penColorCss } from '../blocks/BlockPicture.tsx';
import type { Canvas, Point, Segment } from '../engine/geometry.ts';
import type { RobotState } from '../engine/interpreter.ts';
import type { Hint } from '../engine/puzzle.ts';
import { useGlide } from './useGlide.ts';

/**
 * The robot's paper: a dot for every whole step, the target picture faint underneath, the lines
 * the robot drew, and the robot with its pen. Drawn in SVG in canvas units, scaled to fit.
 *
 * The robot glides to each new place over `tweenMs`, and the newest line draws itself over the
 * same time. Reduced motion sets `--wk-motion-scale` to 0, so both jump straight to the step.
 */

export interface StageBump {
  /** Changes with each bump, so the same bump twice still shows twice. */
  readonly key: number;
  /** Where the robot stood. */
  readonly at: Point;
  /** Where the move would have gone, off the paper. */
  readonly blocked: Point;
}

export interface RobotStageProps {
  readonly canvas: Canvas;
  readonly robot: RobotState;
  readonly drawing: readonly Segment[];
  /** The puzzle's picture, shown faintly underneath. Null in free play. */
  readonly target: readonly Segment[] | null;
  /** A flower to reach, or null. */
  readonly finish: Point | null;
  /** Hints to show on the paper after a few runs, or null. */
  readonly hints: readonly Hint[] | null;
  readonly bump: StageBump | null;
  readonly tweenMs: number;
  /** The kit's frames and clock, which the robot glides by. */
  readonly scope: Pick<Scope, 'requestFrame'>;
  readonly clock: KitClock;
}

/** How far the robot's pen sits from the top of its picture, as a share of its height. */
const PEN_FROM_TOP = 0.58;

/** Sizes in canvas units, so a small paper gets a robot that fits a step, a big one a visible robot. */
function sizes(canvas: Canvas) {
  const robot = Math.max(0.84, canvas.width / 9);
  const line = Math.max(0.1, canvas.width / 110);
  return { robot, line, margin: robot * 0.62, flower: Math.max(0.8, canvas.width / 12) };
}

/**
 * The robot's turn in degrees, kept continuous, so a turn from 270 to 0 goes a quarter turn
 * forward instead of three quarters back.
 */
function useContinuousHeading(heading: number): number {
  const [state, setState] = useState({ heading, angle: heading });
  if (state.heading === heading) return state.angle;
  const delta = ((((heading - state.heading) % 360) + 540) % 360) - 180;
  const angle = state.angle + delta;
  setState({ heading, angle });
  return angle;
}

function midpoint(segment: Segment): Point {
  return { x: (segment.from.x + segment.to.x) / 2, y: (segment.from.y + segment.to.y) / 2 };
}

/** The point a share of the way along a line, eased like the robot's glide. */
function along(segment: Segment, progress: number): Point {
  const t = 1 - (1 - progress) * (1 - progress);
  return {
    x: segment.from.x + (segment.to.x - segment.from.x) * t,
    y: segment.from.y + (segment.to.y - segment.from.y) * t,
  };
}

/** One line per color, the longest, for a single shape mark each: enough to tell colors apart. */
function longestPerColor(segments: readonly Segment[]): Segment[] {
  const longest = new Map<string, { segment: Segment; length: number }>();
  for (const segment of segments) {
    const length = Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y);
    const known = longest.get(segment.color);
    if (known === undefined || length > known.length) longest.set(segment.color, { segment, length });
  }
  return [...longest.values()].map((entry) => entry.segment);
}

function clampTo(point: Point, canvas: Canvas): Point {
  return {
    x: Math.min(canvas.width, Math.max(0, point.x)),
    y: Math.min(canvas.height, Math.max(0, point.y)),
  };
}

function Line({
  segment,
  width,
  className,
  color,
  dash,
}: {
  segment: Segment;
  width: number;
  className?: string;
  color?: string;
  /** Dashes in canvas units, so they look the same on a short line and a long one. */
  dash?: readonly [number, number];
}) {
  return (
    <line
      className={className}
      x1={segment.from.x}
      y1={segment.from.y}
      x2={segment.to.x}
      y2={segment.to.y}
      style={{
        stroke: color ?? penColorCss(segment.color),
        strokeWidth: width,
        strokeDasharray: dash === undefined ? undefined : `${String(dash[0])} ${String(dash[1])}`,
      }}
    />
  );
}

/** A shape cue at the middle of a line, so the target's colors are not told by hue alone. */
function ShapeMark({ segment, size }: { segment: Segment; size: number }) {
  const at = midpoint(segment);
  const scale = size / 48;
  return (
    <g
      className='rp-shape-mark'
      transform={`translate(${String(at.x)} ${String(at.y)}) scale(${String(scale)}) translate(-24 -24)`}
      style={{ color: penColorCss(segment.color) }}
    >
      <circle cx='24' cy='24' r='20' className='rp-shape-mark-back' />
      <ColorShape color={segment.color} />
    </g>
  );
}

function HintMarks({ hints, line, canvas }: { hints: readonly Hint[]; line: number; canvas: Canvas }) {
  const cross = line * 2.2;
  return (
    <g className='rp-hints' data-hints={hints.map((hint) => hint.kind).join(' ')}>
      {hints.map((hint, index) => {
        switch (hint.kind) {
          case 'missing-line':
            return hint.segments.map((segment, i) => (
              <Line
                key={`${String(index)}-${String(i)}`}
                segment={segment}
                width={line * 1.6}
                className='rp-hint-missing'
                color='var(--wk-color-focus)'
                dash={[line * 0.6, line * 2.6]}
              />
            ));
          case 'extra-line':
            return hint.segments.map((segment, i) => {
              const at = midpoint(segment);
              return (
                <g key={`${String(index)}-${String(i)}`}>
                  <Line
                    segment={segment}
                    width={line * 1.2}
                    className='rp-hint-extra'
                    dash={[line * 0.6, line * 2.6]}
                    color='var(--wk-color-text-muted)'
                  />
                  <path
                    className='rp-hint-cross'
                    d={`M${String(at.x - cross)} ${String(at.y - cross)}l${String(cross * 2)} ${String(cross * 2)}m0 ${String(-cross * 2)}l${String(-cross * 2)} ${String(cross * 2)}`}
                    style={{ strokeWidth: line * 0.9 }}
                  />
                </g>
              );
            });
          case 'wrong-color':
            return hint.stretches.map((stretch, i) => (
              <g key={`${String(index)}-${String(i)}`}>
                <Line
                  segment={stretch.segment}
                  width={line * 1.6}
                  className='rp-hint-recolor'
                  dash={[line * 2, line * 1.4]}
                  color={penColorCss(stretch.expected)}
                />
                <ShapeMark segment={{ ...stretch.segment, color: stretch.expected }} size={line * 7} />
              </g>
            ));
          case 'not-there-yet':
          case 'wrong-end': {
            const goal = clampTo(hint.goal, canvas);
            return (
              <circle
                key={index}
                className='rp-hint-goal'
                cx={goal.x}
                cy={goal.y}
                r={line * 5}
                style={{ strokeWidth: line * 0.9 }}
              />
            );
          }
          default:
            return null;
        }
      })}
    </g>
  );
}

export function RobotStage(props: RobotStageProps) {
  const { canvas, robot, drawing, target, finish, hints, bump, tweenMs } = props;
  const size = sizes(canvas);
  const angle = useContinuousHeading(robot.heading);
  const { pose, progress } = useGlide(props.scope, props.clock, { x: robot.x, y: robot.y, angle }, tweenMs);
  const newest = drawing.at(-1);
  const { margin } = size;
  const viewBox = `${String(-margin)} ${String(-margin)} ${String(canvas.width + margin * 2)} ${String(canvas.height + margin * 2)}`;
  const dots: Point[] = [];
  for (let x = 0; x <= canvas.width; x++) for (let y = 0; y <= canvas.height; y++) dots.push({ x, y });
  const targetColors = new Set(target?.map((segment) => segment.color));
  const bumpAt =
    bump === null ? null : clampTo(midpoint({ from: bump.at, to: bump.blocked, color: robot.color }), canvas);

  return (
    <svg
      className='rp-paper'
      viewBox={viewBox}
      preserveAspectRatio='xMidYMid meet'
      aria-hidden='true'
      data-robot-x={robot.x.toFixed(3)}
      data-robot-y={robot.y.toFixed(3)}
      data-robot-heading={robot.heading}
      data-pen={robot.penDown ? 'down' : 'up'}
      data-lines={drawing.length}
    >
      <rect className='rp-paper-sheet' x={0} y={0} width={canvas.width} height={canvas.height} />
      <g className='rp-dots'>
        {dots.map((dot) => (
          <circle key={`${String(dot.x)}-${String(dot.y)}`} cx={dot.x} cy={dot.y} r={size.line * 0.38} />
        ))}
      </g>
      {target !== null && (
        <g className='rp-target' data-target-lines={target.length}>
          {target.map((segment, index) => (
            <Line key={index} segment={segment} width={size.line * 2.4} />
          ))}
          {targetColors.size > 1 &&
            longestPerColor(target).map((segment) => (
              <ShapeMark key={segment.color} segment={segment} size={size.line * 6} />
            ))}
        </g>
      )}
      {finish !== null && (
        <image
          className='rp-finish'
          href={emojiUrl('sunflower')}
          x={finish.x - size.flower / 2}
          y={finish.y - size.flower / 2}
          width={size.flower}
          height={size.flower}
        />
      )}
      <g className='rp-drawing'>
        {drawing.map((segment, index) =>
          // The newest line draws itself behind the robot as it glides.
          segment === newest && progress < 1 ? (
            <Line
              key={index}
              segment={{ ...segment, to: along(segment, progress) }}
              width={size.line}
              className='rp-line'
            />
          ) : (
            <Line key={index} segment={segment} width={size.line} className='rp-line' />
          ),
        )}
      </g>
      {hints !== null && <HintMarks hints={hints} line={size.line} canvas={canvas} />}
      {bump !== null && bumpAt !== null && (
        <circle
          key={bump.key}
          className='rp-bump'
          cx={bumpAt.x}
          cy={bumpAt.y}
          r={size.robot * 0.35}
          style={{ strokeWidth: size.line }}
        />
      )}
      <g className='rp-robot' transform={`translate(${String(pose.x)} ${String(pose.y)})`}>
        <g transform={`rotate(${String(pose.angle)})`}>
          <image
            href={robotArt}
            x={-size.robot / 2}
            y={-size.robot * PEN_FROM_TOP}
            width={size.robot}
            height={size.robot}
          />
        </g>
        <circle
          className='rp-pen'
          r={size.robot * 0.075}
          style={
            robot.penDown
              ? { fill: penColorCss(robot.color), stroke: 'none' }
              : { stroke: penColorCss(robot.color), strokeWidth: size.robot * 0.03 }
          }
        />
      </g>
    </svg>
  );
}
