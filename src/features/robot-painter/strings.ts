import { defineStrings } from '../../core/strings/defineStrings.ts';

/**
 * The words every robot painter screen shares: block names, controls, the neutral hints, and the
 * instruction for each kind of puzzle. Each activity's own title, goal, and main instruction live
 * in its strings.ts.
 */
export const strings = defineStrings('robot-painter', {
  // Block names, spoken on hover and focus. Numbers and colors come from the shared clip sets.
  up: { text: 'up arrow' },
  down: { text: 'down arrow' },
  left: { text: 'left arrow' },
  right: { text: 'right arrow' },
  repeat: { text: 'repeat' },
  penUp: { text: 'pen up' },
  penDown: { text: 'pen down' },
  forward: { text: 'forward' },
  turnLeft: { text: 'turn left' },
  turnRight: { text: 'turn right' },
  newBlock: { text: 'make a new block' },
  petal: { text: 'petal' },
  // Turn angles. The shared number clips stop at 100, so each angle is its own clip.
  angle30: { text: '30 degrees' },
  angle45: { text: '45 degrees' },
  angle60: { text: '60 degrees' },
  angle72: { text: '72 degrees' },
  angle90: { text: '90 degrees' },
  angle120: { text: '120 degrees' },
  angle135: { text: '135 degrees' },
  angle144: { text: '144 degrees' },
  angle150: { text: '150 degrees' },
  angle180: { text: '180 degrees' },
  // Controls.
  go: { text: 'Go' },
  stepOnce: { text: 'One step' },
  robotToStart: { text: 'Robot back to the start' },
  startOver: { text: 'Start over' },
  undo: { text: 'Undo' },
  takeOut: { text: 'Take the block out' },
  putHere: { text: 'Put blocks here' },
  more: { text: 'more' },
  fewer: { text: 'fewer' },
  removeDefinition: { text: 'Take this block away' },
  paintIt: { text: 'Paint it' },
  nextPicture: { text: 'Next picture' },
  stayHere: { text: 'Stay here' },
  choose: { text: 'Go on to the next picture, or stay here.' },
  pickName: { text: 'Pick a picture for your new block.' },
  boardFull: { text: 'There is no more room for blocks.' },
  // Group names a screen reader reads. The pictures inside are spoken one by one.
  blocks: { text: 'Blocks', silent: 'decorative' },
  program: { text: 'Program', silent: 'decorative' },
  myBlocks: { text: 'My blocks', silent: 'decorative' },
  arrows: { text: 'Arrows', silent: 'decorative' },
  pens: { text: 'Pen colors', silent: 'decorative' },
  controls: { text: 'Robot controls', silent: 'decorative' },
  drawing: { text: 'The robot and its drawing', silent: 'decorative' },
  // The hints, one for each kind the engine gives. Each says what is different, never that the
  // child did badly.
  hintStepLimit: { text: 'The robot stopped to rest.' },
  hintBumped: { text: 'The robot bumped into the edge.' },
  hintNotThereYet: { text: 'The flower is still a little way off.' },
  hintNothingDrawn: { text: 'Add some blocks, then press go.' },
  hintWrongColor: { text: 'One line wants another color.' },
  hintMissingLine: { text: 'One line is missing.' },
  hintExtraLine: { text: 'There is an extra line.' },
  hintWrongEnd: { text: 'The picture is ready. Now end on the flower.' },
  // The instruction for each kind of puzzle and play.
  doDirect: { text: 'Press an arrow to take the robot to the flower.' },
  doPlan: { text: 'Press the arrows to make a plan. Then press go.' },
  doBuild: { text: 'Put blocks in the program to draw the picture. Then press go.' },
  doFix: { text: 'One block is not right. Find it and change it. Then press go.' },
  doDefine: { text: 'Teach the robot a new block. Put blocks inside it. Then press go.' },
  doFreeDirect: { text: 'Press the arrows and the colors. The robot draws.' },
  doFreeBuild: { text: 'Build any program and press go. Press paint it to keep painting.' },
});
