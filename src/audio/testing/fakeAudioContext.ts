/**
 * A stand-in for the Web Audio API at the I/O edge, for unit tests. It records the graph the code
 * builds and lets a test end a clip by hand. `asAudioContext()` throws on any member it does not
 * implement, so code that starts using a new part of the API fails loudly in tests.
 */

class FakeParam {
  value: number;
  readonly events: Array<[string, number, number]> = [];
  constructor(value: number) {
    this.value = value;
  }
  setValueAtTime(value: number, time: number) {
    this.events.push(['set', value, time]);
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.events.push(['linear', value, time]);
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    if (value <= 0) throw new RangeError('An exponential ramp cannot reach zero.');
    this.events.push(['exponential', value, time]);
    return this;
  }
  setTargetAtTime(value: number, time: number) {
    this.events.push(['target', value, time]);
    return this;
  }
}

class FakeNode {
  output: FakeNode | undefined;
  connect(node: FakeNode) {
    this.output = node;
    return node;
  }
  disconnect() {
    this.output = undefined;
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);
}

class FakeBiquad extends FakeNode {
  type = 'lowpass';
  readonly frequency = new FakeParam(350);
  readonly Q = new FakeParam(1);
}

class FakeScheduled extends FakeNode {
  started = false;
  stopped = false;
  private readonly listeners: Array<() => void> = [];
  start() {
    if (this.started) throw new Error('A source node can start only once.');
    this.started = true;
  }
  stop() {
    if (!this.started) throw new Error('Stopped a source that never started.');
    this.stopped = true;
  }
  addEventListener(type: string, listener: () => void) {
    if (type !== 'ended') throw new Error(`Unexpected event ${type}.`);
    this.listeners.push(listener);
  }
  /** Ends playback as the audio thread would. */
  end() {
    this.stopped = true;
    for (const listener of this.listeners.splice(0)) listener();
  }
}

class FakeOscillator extends FakeScheduled {
  type = 'sine';
  readonly frequency = new FakeParam(440);
}

class FakeAudioBuffer {
  readonly channels: Float32Array[] = [];
  readonly label: string;
  readonly length: number;
  constructor(label: string, length = 0) {
    this.label = label;
    this.length = length;
  }
  copyToChannel(samples: Float32Array, channel: number) {
    this.channels[channel] = samples;
  }
}

export class FakeBufferSource extends FakeScheduled {
  buffer: FakeAudioBuffer | null = null;
  loop = false;
  /** What the source plays: the URL a clip was decoded from, or "noise". */
  get bufferLabel(): string {
    return this.buffer?.label ?? '';
  }
}

export class FakeAudioContext {
  state: 'running' | 'suspended' | 'closed' = 'running';
  currentTime = 0;
  readonly sampleRate = 48_000;
  readonly destination = new FakeNode();
  readonly gains: FakeGain[] = [];
  readonly oscillators: FakeOscillator[] = [];
  readonly sources: FakeBufferSource[] = [];
  readonly filters: FakeBiquad[] = [];
  decodeCalls = 0;
  closed = false;

  createGain() {
    const node = new FakeGain();
    this.gains.push(node);
    return node;
  }
  createOscillator() {
    const node = new FakeOscillator();
    this.oscillators.push(node);
    return node;
  }
  createBiquadFilter() {
    const node = new FakeBiquad();
    this.filters.push(node);
    return node;
  }
  createBufferSource() {
    const node = new FakeBufferSource();
    this.sources.push(node);
    return node;
  }
  createBuffer(_channels: number, length: number) {
    return new FakeAudioBuffer('noise', length);
  }
  /** Decodes to a buffer labelled with the bytes as text, so a test can tell clips apart. */
  decodeAudioData(bytes: ArrayBuffer) {
    this.decodeCalls += 1;
    return Promise.resolve(new FakeAudioBuffer(new TextDecoder().decode(bytes)));
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
    this.closed = true;
    return Promise.resolve();
  }

  /** This fake typed as an AudioContext. Reading a member the fake lacks throws. */
  asAudioContext(): AudioContext {
    const proxy = new Proxy(this, {
      get(target, property, receiver) {
        if (property === 'then') return undefined;
        if (!Reflect.has(target, property)) {
          throw new Error(`FakeAudioContext does not implement ${String(property)}.`);
        }
        const value: unknown = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    // The proxy implements the members this code uses and throws on the rest, which is the
    // contract a test fake needs. TypeScript cannot check a proxy against the full interface.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return proxy as unknown as AudioContext;
  }
}
