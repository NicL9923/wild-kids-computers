/**
 * Original art for the parts of a computer: plain, friendly shapes with a thick outline, each
 * drawn to fill its own box in the scene. Nothing here copies a real product's look.
 */
import type { ReactElement } from 'react';
import { BOARD, LAYOUT, type PartId } from './level.ts';

const INK = '#1f2b3a';
const LINE = 6;

/** The wall and the desk behind every part. */
export function DeskArt() {
  return (
    <svg
      className='poc-desk'
      viewBox={`0 0 ${String(BOARD.width)} ${String(BOARD.height)}`}
      preserveAspectRatio='none'
      aria-hidden='true'
    >
      <rect width={BOARD.width} height='400' fill='#e8f0f6' />
      <rect y='392' width={BOARD.width} height='208' rx='0' fill='#d9b48a' />
      <rect y='392' width={BOARD.width} height='18' fill='#c49a6c' />
    </svg>
  );
}

function Screen() {
  const { width, height } = LAYOUT.screen;
  return (
    <svg viewBox={`0 0 ${String(width)} ${String(height)}`} aria-hidden='true'>
      {/* Neck and foot */}
      <rect x='175' y='220' width='50' height='40' fill='#5b6878' stroke={INK} strokeWidth={LINE} />
      <rect x='120' y='254' width='160' height='20' rx='10' fill='#5b6878' stroke={INK} strokeWidth={LINE} />
      {/* Frame and glass with a sunny hill on it */}
      <rect x='8' y='6' width='384' height='220' rx='18' fill='#38424f' stroke={INK} strokeWidth={LINE} />
      <rect x='28' y='24' width='344' height='184' rx='8' fill='#9fd3f5' />
      <path d='M28 170 Q130 110 230 160 T372 150 V208 H28 Z' fill='#7cc46e' />
      <circle cx='300' cy='72' r='26' fill='#ffd54a' />
    </svg>
  );
}

function Keyboard() {
  const { width, height } = LAYOUT.keyboard;
  const keys = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 12; col += 1) {
      keys.push(
        <rect
          key={`${String(row)}-${String(col)}`}
          x={22 + col * 35}
          y={18 + row * 28}
          width='28'
          height='22'
          rx='5'
          fill='#fbfcfd'
          stroke='#7a8796'
          strokeWidth='2'
        />,
      );
    }
  }
  return (
    <svg viewBox={`0 0 ${String(width)} ${String(height)}`} aria-hidden='true'>
      <rect x='6' y='6' width='448' height='112' rx='16' fill='#c9d2dc' stroke={INK} strokeWidth={LINE} />
      {keys}
      {/* The long space bar */}
      <rect x='127' y='100' width='206' height='10' rx='4' fill='#fbfcfd' stroke='#7a8796' strokeWidth='2' />
    </svg>
  );
}

function Mouse() {
  const { width, height } = LAYOUT.mouse;
  return (
    <svg viewBox={`0 0 ${String(width)} ${String(height)}`} aria-hidden='true'>
      <path
        d='M60 8 C98 8 112 44 112 84 C112 124 92 144 60 144 C28 144 8 124 8 84 C8 44 22 8 60 8 Z'
        fill='#f2f5f8'
        stroke={INK}
        strokeWidth={LINE}
      />
      <path d='M8 66 H112 M60 8 V66' stroke={INK} strokeWidth='4' />
      <rect x='52' y='26' width='16' height='28' rx='8' fill='#5b6878' stroke={INK} strokeWidth='3' />
    </svg>
  );
}

function Trackpad() {
  const { width, height } = LAYOUT.trackpad;
  return (
    <svg viewBox={`0 0 ${String(width)} ${String(height)}`} aria-hidden='true'>
      <rect x='8' y='14' width='154' height='122' rx='18' fill='#b8c3cf' stroke={INK} strokeWidth={LINE} />
      <rect x='22' y='28' width='126' height='94' rx='10' fill='#d3dbe3' />
    </svg>
  );
}

function Speaker() {
  const { width, height } = LAYOUT.speaker;
  return (
    <svg viewBox={`0 0 ${String(width)} ${String(height)}`} aria-hidden='true'>
      <rect x='10' y='8' width='130' height='234' rx='18' fill='#4a5666' stroke={INK} strokeWidth={LINE} />
      <circle cx='75' cy='68' r='26' fill='#2a333e' stroke='#9aa7b6' strokeWidth='4' />
      <circle cx='75' cy='68' r='9' fill='#9aa7b6' />
      <circle cx='75' cy='164' r='46' fill='#2a333e' stroke='#9aa7b6' strokeWidth='5' />
      <circle cx='75' cy='164' r='16' fill='#9aa7b6' />
    </svg>
  );
}

function Camera() {
  const { width, height } = LAYOUT.camera;
  return (
    <svg viewBox={`0 0 ${String(width)} ${String(height)}`} aria-hidden='true'>
      {/* A clip that holds it on top of the screen */}
      <rect x='52' y='60' width='36' height='24' rx='4' fill='#5b6878' stroke={INK} strokeWidth='4' />
      <rect x='10' y='8' width='120' height='58' rx='29' fill='#38424f' stroke={INK} strokeWidth={LINE} />
      <circle cx='70' cy='37' r='20' fill='#16202b' stroke='#9aa7b6' strokeWidth='5' />
      <circle cx='64' cy='31' r='6' fill='#cfe8ff' />
      <circle cx='112' cy='24' r='5' fill='#7cc46e' />
    </svg>
  );
}

const ART: Readonly<Record<PartId, () => ReactElement>> = {
  screen: Screen,
  keyboard: Keyboard,
  mouse: Mouse,
  trackpad: Trackpad,
  speaker: Speaker,
  camera: Camera,
};

export function PartArt({ part }: { readonly part: PartId }) {
  const Art = ART[part];
  return <Art />;
}
