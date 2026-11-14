import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from '../support/launchApp.ts';
import { startProbeServer, type ProbeServer } from './probeServer.ts';

// Hard rule 1. Every request type in "Network block" in docs/architecture.md goes from the
// renderer to a local server on a free port. Each must fail, and the server must see nothing.

let launched: LaunchedApp;
let probe: ProbeServer;

test.beforeEach(async () => {
  probe = await startProbeServer();
  launched = await launchApp();
});

test.afterEach(async () => {
  await launched.close();
  await probe.close();
});

test('no request of any kind leaves the renderer', async () => {
  const { page } = launched;
  const target = `http://127.0.0.1:${probe.port}`;

  const outcomes = await page.evaluate(
    async ({ base, wsBase, udpPort, tcpPort, timeoutMs }) => {
      // Resolves with the first outcome an attempt reports, or "timed out". A timeout is not a
      // success: the server count at the end decides whether anything got through.
      const settle = (attempt: (done: (outcome: string) => void) => void) =>
        new Promise<string>((resolve) => {
          const timer = setTimeout(() => resolve('timed out'), timeoutMs);
          const done = (outcome: string) => {
            clearTimeout(timer);
            resolve(outcome);
          };
          try {
            attempt(done);
          } catch (error) {
            done(`threw ${error instanceof Error ? error.name : String(error)}`);
          }
        });
      const fetchOutcome = (async () => {
        try {
          return `reached ${(await fetch(`${base}/fetch`)).status}`;
        } catch {
          return 'failed';
        }
      })();

      const xhrOutcome = settle((done) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', `${base}/xhr`);
        xhr.addEventListener('load', () => done(`reached ${xhr.status}`));
        xhr.addEventListener('error', () => done('failed'));
        xhr.send();
      });

      const webSocketOutcome = settle((done) => {
        const socket = new WebSocket(`${wsBase}/socket`);
        socket.addEventListener('open', () => done('reached'));
        socket.addEventListener('error', () => done('failed'));
      });

      const eventSourceOutcome = settle((done) => {
        const source = new EventSource(`${base}/events`);
        source.addEventListener('open', () => done('reached'));
        source.addEventListener('error', () => {
          source.close();
          done('failed');
        });
      });

      // sendBeacon only queues. The server count below is the real check.
      const beaconQueued = navigator.sendBeacon(`${base}/beacon`, 'x');

      const imageOutcome = settle((done) => {
        const image = new Image();
        image.addEventListener('load', () => done('reached'));
        image.addEventListener('error', () => done('failed'));
        image.src = `${base}/image.png`;
      });

      for (const rel of ['dns-prefetch', 'preconnect', 'prefetch']) {
        const link = document.createElement('link');
        link.rel = rel;
        link.href = `${base}/${rel}`;
        document.head.append(link);
      }

      const workerOutcome = settle((done) => {
        const source = `fetch(${JSON.stringify(`${base}/worker`)}).then(() => postMessage('reached'), () => postMessage('failed'));`;
        const worker = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
        worker.addEventListener('message', (event) => done(String(event.data)));
        worker.addEventListener('error', () => done('worker blocked'));
      });

      // WebRTC gathers candidates on its own. Every one would mean a socket or a packet.
      const webRtcOutcome = (async () => {
        const connection = new RTCPeerConnection({
          iceServers: [
            { urls: `stun:127.0.0.1:${udpPort}` },
            { urls: `turn:127.0.0.1:${tcpPort}?transport=tcp`, username: 'u', credential: 'c' },
          ],
        });
        const candidates: string[] = [];
        connection.addEventListener('icecandidate', (event) => {
          if (event.candidate !== null && event.candidate.candidate !== '') candidates.push(event.candidate.candidate);
        });
        connection.createDataChannel('probe');
        await connection.setLocalDescription(await connection.createOffer());
        await new Promise((resolve) => setTimeout(resolve, timeoutMs));
        connection.close();
        return candidates.length === 0 ? 'no candidates' : `candidates: ${candidates.join(' | ')}`;
      })();

      const opened = window.open(`${base}/window-open`);

      return {
        fetch: await fetchOutcome,
        xhr: await xhrOutcome,
        webSocket: await webSocketOutcome,
        eventSource: await eventSourceOutcome,
        beaconQueued,
        image: await imageOutcome,
        worker: await workerOutcome,
        webRtc: await webRtcOutcome,
        windowOpen: opened === null ? 'denied' : 'opened',
      };
    },
    {
      base: target,
      wsBase: `ws://127.0.0.1:${probe.port}`,
      udpPort: probe.udpPort,
      tcpPort: probe.port,
      timeoutMs: 3_000,
    },
  );

  expect(outcomes).toMatchObject({
    fetch: 'failed',
    xhr: 'failed',
    webSocket: 'failed',
    eventSource: 'failed',
    image: 'failed',
    worker: 'failed',
    webRtc: 'no candidates',
    windowOpen: 'denied',
  });

  // A navigation of the page itself is cancelled and the app stays on its bundle.
  await page.evaluate((url) => window.location.assign(url), `${target}/navigate`);
  await page.waitForTimeout(1_000);
  expect(page.url()).toMatch(/^app:\/\/bundle\/index\.html/);
  expect(launched.app.windows()).toHaveLength(1);

  // Give anything still in flight time to arrive.
  await page.waitForTimeout(1_500);
  expect(probe.seen(), `beacon queued: ${String(outcomes.beaconQueued)}`).toEqual([]);
});

// A file leaves the app only through the bridge's export, which checks the bytes and sits behind
// the parent gate. Chromium's own downloads would skip both. The test adds a main-process
// listener that saves any download it is offered into an empty folder, as an adult clicking
// Save in a download dialog would, so a download that got through leaves a file there.
test('no link or navigation in the page writes a file', async () => {
  const { app, page } = launched;
  const folder = await mkdtemp(path.join(os.tmpdir(), 'wkc-downloads-'));
  try {
    await app.evaluate(({ session }, into) => {
      session.defaultSession.on('will-download', (event, item) => {
        if (!event.defaultPrevented) item.setSavePath(`${into}/${item.getFilename() || 'download'}`);
      });
    }, folder);
    const startUrl = page.url();

    await page.evaluate(() => {
      for (const [href, name] of [
        [URL.createObjectURL(new Blob(['from a blob'], { type: 'text/plain' })), 'blob.txt'],
        ['data:text/plain,from%20a%20data%20link', 'data.txt'],
      ] as const) {
        const link = document.createElement('a');
        link.href = href;
        link.download = name;
        document.body.append(link);
        link.click();
        link.remove();
      }
      const frame = document.createElement('iframe');
      frame.src = URL.createObjectURL(new Blob(['in a frame'], { type: 'application/octet-stream' }));
      document.body.append(frame);
    });
    for (const href of [
      'data:application/octet-stream,navigated',
      await page.evaluate(() => URL.createObjectURL(new Blob(['navigated'], { type: 'application/octet-stream' }))),
    ]) {
      await page.evaluate((target) => {
        window.location.href = target;
      }, href);
    }
    // A download that got through takes a few frames to reach the disk.
    await page.waitForTimeout(1_500);
    expect(await readdir(folder)).toEqual([]);
    expect(page.url()).toBe(startUrl);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
