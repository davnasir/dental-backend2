import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { config } from './config/index.js';
import { isAllowedOrigin } from './middleware/originGuard.js';

let wss = null;

const clients = new Set();

export const initRealtime = (server) => {
  wss = new WebSocketServer({ server, path: '/realtime' });

  wss.on('connection', (socket, req) => {
    // Only the frontend origin may open realtime connections (browsers always
    // send Origin on the WS handshake). Servers/tools without an Origin header
    // still need a valid JWT below, so they are not locked out.
    if (req.headers.origin && !isAllowedOrigin(req.headers.origin)) {
      socket.close(4001, 'Unauthorized');
      return;
    }

    let authed = false;
    try {
      const params = new URL(req.url, 'http://localhost').searchParams;
      const token = params.get('token');
      if (token) {
        const decoded = jwt.verify(token, config.jwt.accessSecret);
        socket.userId = decoded.id;
        socket.role = decoded.role;
        authed = true;
      }
    } catch (err) {
      authed = false;
    }

    if (!authed) {
      socket.close(4001, 'Unauthorized');
      return;
    }

    clients.add(socket);
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });
    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));
  });

  const heartbeat = setInterval(() => {
    clients.forEach((socket) => {
      if (socket.isAlive === false) {
        clients.delete(socket);
        socket.terminate();
        return;
      }
      socket.isAlive = false;
      socket.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(heartbeat));
};

export const broadcastRealtime = (payload) => {
  if (!wss) return 0;
  const message = JSON.stringify({ type: 'notification', data: payload });
  let count = 0;
  clients.forEach((socket) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(message);
      count += 1;
    }
  });
  return count;
};

export const realtimeUrl = () => {
  const proto = config.nodeEnv === 'production' ? 'wss' : 'ws';
  const host = process.env.REALTIME_HOST || 'localhost';
  const port = process.env.REALTIME_PORT || config.port;
  return `${proto}://${host}:${port}/realtime`;
};