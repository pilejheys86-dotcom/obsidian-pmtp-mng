const cluster = require('cluster');
const os = require('os');

const WORKER_COUNT = Math.min(os.cpus().length, parseInt(process.env.WEB_CONCURRENCY, 10) || 2);
const RESPAWN_DELAY = 1000;
const SHUTDOWN_TIMEOUT = 5000;

if (cluster.isPrimary) {
  console.log(`[Cluster] Primary ${process.pid} starting ${WORKER_COUNT} workers`);

  for (let i = 0; i < WORKER_COUNT; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    if (signal !== 'SIGTERM' && signal !== 'SIGINT') {
      console.error(`[Cluster] Worker ${worker.process.pid} died (code=${code}). Restarting in ${RESPAWN_DELAY}ms...`);
      setTimeout(() => cluster.fork(), RESPAWN_DELAY);
    }
  });

  const shutdown = () => {
    console.log('[Cluster] Shutting down gracefully...');
    for (const id in cluster.workers) {
      cluster.workers[id].send('shutdown');
    }
    setTimeout(() => {
      console.log('[Cluster] Forcing exit after timeout');
      process.exit(0);
    }, SHUTDOWN_TIMEOUT);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} else {
  const app = require('./index');
  const PORT = process.env.PORT || 5000;

  const server = app.listen(PORT, () => {
    console.log(`[Cluster] Worker ${process.pid} listening on port ${PORT}`);
  });

  process.on('message', (msg) => {
    if (msg === 'shutdown') {
      console.log(`[Cluster] Worker ${process.pid} draining...`);
      server.close(() => process.exit(0));
    }
  });
}
