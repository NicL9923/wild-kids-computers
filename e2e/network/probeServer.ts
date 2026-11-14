import dgram from 'node:dgram';
import http from 'node:http';

/**
 * A local HTTP server and UDP socket on free ports that count everything that reaches them.
 * The server counts TCP connections, not just HTTP requests, so a WebSocket handshake, a TURN
 * connection, or a preconnect also counts.
 */
export interface ProbeServer {
  port: number;
  udpPort: number;
  /** Every TCP connection and UDP packet that arrived, labelled by kind. */
  seen: () => string[];
  close: () => Promise<void>;
}

export async function startProbeServer(): Promise<ProbeServer> {
  const seen: string[] = [];
  const server = http.createServer((request, response) => {
    seen.push(`http ${request.method ?? ''} ${request.url ?? ''}`);
    response.writeHead(200, { 'access-control-allow-origin': '*', 'content-type': 'text/plain' });
    response.end('reached');
  });
  server.on('connection', () => seen.push('tcp connection'));
  server.on('upgrade', (request, socket) => {
    seen.push(`upgrade ${request.url ?? ''}`);
    socket.destroy();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const udp = dgram.createSocket('udp4');
  udp.on('message', () => seen.push('udp packet'));
  await new Promise<void>((resolve) => udp.bind(0, '127.0.0.1', resolve));

  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('The probe server has no TCP port.');
  return {
    port: address.port,
    udpPort: udp.address().port,
    seen: () => [...seen],
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await new Promise<void>((resolve) => udp.close(() => resolve()));
    },
  };
}
