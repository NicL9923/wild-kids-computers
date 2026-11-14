import type { ReactNode } from 'react';
import type { Home } from './homes.ts';

/**
 * Original pictures of each home as a small scene, 160 by 120 units, in one flat style.
 * Decorative: the element around the picture names the home.
 */

const INK = '#2b2420';

const SCENES: Readonly<Record<Home, () => ReactNode>> = {
  nest: () => (
    <>
      <rect width='160' height='120' fill='#cfe9f6' />
      <path d='M0 70c40-6 90-4 160 8v10C100 78 50 78 0 82z' fill='#7a5230' />
      <ellipse cx='80' cy='70' rx='46' ry='22' fill='#a87742' stroke={INK} strokeWidth='3' />
      <ellipse cx='68' cy='58' rx='10' ry='12' fill='#e7f2fb' stroke={INK} strokeWidth='2' />
      <ellipse cx='88' cy='57' rx='10' ry='12' fill='#e7f2fb' stroke={INK} strokeWidth='2' />
      <path
        d='M38 66c14 6 28 8 42 8s30-2 42-8M40 76c14 6 26 8 40 8s28-2 40-8'
        fill='none'
        stroke='#6e4a26'
        strokeWidth='3'
      />
    </>
  ),
  hive: () => (
    <>
      <rect width='160' height='120' fill='#e8f3d9' />
      <path d='M20 14h120' stroke='#7a5230' strokeWidth='8' strokeLinecap='round' />
      <path d='M80 14v8' stroke={INK} strokeWidth='3' />
      <ellipse cx='80' cy='32' rx='22' ry='11' fill='#f2b632' stroke={INK} strokeWidth='3' />
      <ellipse cx='80' cy='50' rx='32' ry='13' fill='#f2b632' stroke={INK} strokeWidth='3' />
      <ellipse cx='80' cy='70' rx='38' ry='14' fill='#f2b632' stroke={INK} strokeWidth='3' />
      <ellipse cx='80' cy='90' rx='32' ry='13' fill='#f2b632' stroke={INK} strokeWidth='3' />
      <ellipse cx='80' cy='104' rx='18' ry='8' fill='#f2b632' stroke={INK} strokeWidth='3' />
      <ellipse cx='80' cy='78' rx='9' ry='7' fill={INK} />
    </>
  ),
  web: () => (
    <>
      <rect width='160' height='120' fill='#3d4a5c' />
      <g fill='none' stroke='#eef2f6' strokeWidth='2'>
        <path d='M80 60L0 0M80 60L80 0M80 60L160 0M80 60L160 60M80 60L160 120M80 60L80 120M80 60L0 120M80 60L0 60' />
        <path d='M80 44l11 5 5 11-5 11-11 5-11-5-5-11 5-11z' />
        <path d='M80 28l23 9 9 23-9 23-23 9-23-9-9-23 9-23z' />
        <path d='M80 12l34 14 14 34-14 34-34 14-34-14-14-34 14-34z' />
      </g>
    </>
  ),
  pond: () => (
    <>
      <rect width='160' height='120' fill='#9ccf72' />
      <ellipse cx='80' cy='68' rx='66' ry='38' fill='#4f9fd6' stroke='#2f6e9c' strokeWidth='4' />
      <path d='M40 72a14 9 0 1 0 14-8l-8 6z' fill='#3f9a4c' stroke={INK} strokeWidth='2' />
      <path d='M98 56a15 10 0 1 0 15-9l-9 7z' fill='#3f9a4c' stroke={INK} strokeWidth='2' />
      <circle cx='104' cy='52' r='5' fill='#ef7fb2' />
      <path d='M20 34v-18M26 36v-22M134 34v-18' stroke='#3f7a2c' strokeWidth='4' strokeLinecap='round' />
    </>
  ),
  ocean: () => (
    <>
      <rect width='160' height='120' fill='#cfe9f6' />
      <rect y='40' width='160' height='80' fill='#2f6cd0' />
      <path d='M0 40c13-8 27-8 40 0s27 8 40 0 27-8 40 0 27 8 40 0v10H0z' fill='#5d95e6' />
      <path
        d='M10 72c10-6 20-6 30 0M60 92c10-6 20-6 30 0M110 70c10-6 20-6 30 0M30 108c10-6 20-6 30 0'
        fill='none'
        stroke='#a9c9f5'
        strokeWidth='3'
        strokeLinecap='round'
      />
    </>
  ),
  cave: () => (
    <>
      <rect width='160' height='120' fill='#cfe9f6' />
      <rect y='100' width='160' height='20' fill='#8cc372' />
      <path d='M4 104C10 40 50 12 84 14s66 30 72 90z' fill='#8d8f95' stroke={INK} strokeWidth='3' />
      <path d='M50 104c0-28 14-48 32-48s32 20 32 48z' fill='#22252b' />
      <path d='M30 50l12 6M120 42l-10 8M128 76l-12 2' stroke='#6c6e74' strokeWidth='3' strokeLinecap='round' />
    </>
  ),
  burrow: () => (
    <>
      <rect width='160' height='40' fill='#cfe9f6' />
      <rect y='34' width='160' height='86' fill='#8a5a2e' />
      <path d='M0 34h160v10H0z' fill='#7cbf5e' />
      <path d='M0 34c6-8 10-8 14 0M30 34c6-8 10-8 14 0M120 34c6-8 10-8 14 0' fill='#7cbf5e' />
      <ellipse cx='70' cy='66' rx='30' ry='20' fill='#2e1d0f' />
      <path d='M92 76c18 8 34 18 44 32' fill='none' stroke='#2e1d0f' strokeWidth='16' strokeLinecap='round' />
      <circle cx='30' cy='96' r='4' fill='#6b4422' />
      <circle cx='130' cy='58' r='3' fill='#6b4422' />
    </>
  ),
  barn: () => (
    <>
      <rect width='160' height='120' fill='#cfe9f6' />
      <rect y='104' width='160' height='16' fill='#8cc372' />
      <path d='M30 52L80 18l50 34v54H30z' fill='#c8402f' stroke={INK} strokeWidth='3' strokeLinejoin='round' />
      <path d='M22 56L80 14l58 42' fill='none' stroke='#f4f1ea' strokeWidth='6' strokeLinejoin='round' />
      <rect x='60' y='66' width='40' height='40' fill='#9c2f22' stroke='#f4f1ea' strokeWidth='4' />
      <path d='M60 66l40 40M100 66l-40 40' stroke='#f4f1ea' strokeWidth='4' />
      <rect x='70' y='34' width='20' height='16' fill='#f4f1ea' stroke={INK} strokeWidth='2' />
    </>
  ),
  ice: () => (
    <>
      <rect width='160' height='120' fill='#dff1fa' />
      <rect y='74' width='160' height='46' fill='#3f78c9' />
      <path
        d='M14 78l14-26h70l22 12 26 14v8H14z'
        fill='#ffffff'
        stroke='#7fb0dc'
        strokeWidth='3'
        strokeLinejoin='round'
      />
      <path d='M14 86h132v8H14z' fill='#b9daf2' />
      <path d='M60 22l4 4M64 22l-4 4M120 30l4 4M124 30l-4 4M30 30l4 4M34 30l-4 4' stroke='#8fb6d8' strokeWidth='2' />
    </>
  ),
  desert: () => (
    <>
      <rect width='160' height='120' fill='#fbe7b0' />
      <circle cx='128' cy='26' r='14' fill='#f6c445' />
      <path d='M0 82c30-18 60-18 90 0s50 10 70 0v38H0z' fill='#e2b264' />
      <path d='M0 100c40-14 80-14 160 0v20H0z' fill='#d39c4a' />
      <path d='M44 92V50a8 8 0 0 1 16 0v42' fill='#3f9a4c' stroke={INK} strokeWidth='3' />
      <path
        d='M44 70h-8a6 6 0 0 1-6-6v-8M60 64h8a6 6 0 0 0 6-6v-6'
        fill='none'
        stroke='#3f9a4c'
        strokeWidth='7'
        strokeLinecap='round'
      />
    </>
  ),
  tree: () => (
    <>
      <rect width='160' height='120' fill='#d6efd0' />
      <rect y='108' width='160' height='12' fill='#8cc372' />
      <path d='M72 110V60h16v50z' fill='#7a5230' stroke={INK} strokeWidth='3' />
      <path d='M88 78l20-14M72 84L54 72' stroke='#7a5230' strokeWidth='6' strokeLinecap='round' />
      <circle cx='80' cy='40' r='30' fill='#3f8a3c' stroke={INK} strokeWidth='3' />
      <circle cx='50' cy='56' r='20' fill='#4f9a4a' stroke={INK} strokeWidth='3' />
      <circle cx='112' cy='54' r='22' fill='#4f9a4a' stroke={INK} strokeWidth='3' />
      <path
        d='M40 70c2 12 0 20-4 26M120 70c-2 10 0 18 4 24'
        fill='none'
        stroke='#3f7a2c'
        strokeWidth='3'
        strokeLinecap='round'
      />
    </>
  ),
};

export function HomeArt({ home }: { home: Home }) {
  return (
    <svg
      className='ah-home-art'
      viewBox='0 0 160 120'
      preserveAspectRatio='xMidYMid slice'
      aria-hidden='true'
      focusable='false'
    >
      {SCENES[home]()}
    </svg>
  );
}
