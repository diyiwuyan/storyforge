// Wait for Vite dev server to be ready, then launch Electron
const http = require('http');
const { spawn } = require('child_process');

const PORT = 5173;
const INTERVAL = 1000;

console.log(`[wait-and-launch] Waiting for Vite on port ${PORT}...`);

const timer = setInterval(() => {
  const req = http.get(`http://localhost:${PORT}`, () => {
    clearInterval(timer);
    req.destroy();
    console.log(`[wait-and-launch] Vite is ready, launching Electron...`);

    const child = spawn('npx', ['electron', '.'], {
      stdio: 'inherit',
      shell: true,
    });

    child.on('exit', (code) => {
      process.exit(code || 0);
    });
  });
  req.on('error', () => {
    // Vite not ready yet, retry
  });
}, INTERVAL);
