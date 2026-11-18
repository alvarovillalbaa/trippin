import fs from 'node:fs/promises';
import https from 'node:https';
import next from 'next';
import { closeTransport } from './consumer-auth-transport.mjs';
const app = next({ dev: false, hostname: 'localhost', port: 3443 });
await app.prepare();
const handler = app.getRequestHandler();
const server = https.createServer({ key: await fs.readFile(process.env.TRIPPIN_TLS_KEY), cert: await fs.readFile(process.env.TRIPPIN_TLS_CERT) }, (req, res) => {
  req.headers['x-forwarded-proto'] = 'https';
  req.headers['x-forwarded-host'] = 'localhost:3443';
  return handler(req, res);
});
server.listen(3443, '127.0.0.1', () => console.log('TRIPPIN_NATIVE_SERVER_READY'));
let closing = false;
process.on('SIGTERM', async () => {
  if (closing) return; closing = true;
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  await app.close(); await closeTransport();
  console.log('TRIPPIN_NATIVE_SERVER_CLOSED');
});
