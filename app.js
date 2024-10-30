const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require('cors');
const fs = require('fs');
const winston = require('winston');
const net = require('net');
require('dotenv').config();

const gpxRouter = require('./routes/gpx');
const elecRouter = require('./routes/elec');
const { createServer } = require("node:https");
const app = express();

const sslOptions = {
  key: fs.readFileSync(path.join(__dirname, 'certificates', 'privkey.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'certificates', 'fullchain.pem')),
};

const PORT = 3024;
let server = null;

// Configure Winston logger
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

const winstonLogger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5,
    }),
    new winston.transports.Console({
      format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
      )
    })
  ]
});

// Function to forcefully clean up port
const cleanupPort = () => {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        server = null;
        resolve();
      });
    } else {
      // Create a temporary server to force port release
      const tempServer = net.createServer();
      tempServer.listen(PORT, () => {
        tempServer.close(() => {
          resolve();
        });
      });
      tempServer.on('error', () => {
        resolve();
      });
    }
  });
};

// Function to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to check if port is actually free
const isPortFree = () => {
  return new Promise((resolve) => {
    const tempServer = net.createServer()
        .once('error', () => {
          tempServer.close();
          resolve(false);
        })
        .once('listening', () => {
          tempServer.close();
          resolve(true);
        })
        .listen(PORT);
  });
};

// Start server with retries
const startServer = async (retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      // First, attempt to cleanup any existing connections
      await cleanupPort();

      // Wait a bit to ensure cleanup is complete
      await wait(1000);

      // Check if port is actually free
      const portFree = await isPortFree();
      if (!portFree) {
        winstonLogger.error(`Port ${PORT} is still in use after cleanup attempt ${i + 1}`);
        if (i === retries - 1) {
          process.exit(1);
        }
        continue;
      }

      // Create and start the server
      server = createServer(sslOptions, app);

      await new Promise((resolve, reject) => {
        server.listen(PORT, () => {
          winstonLogger.info(`Secure server running on port ${PORT}`);
          resolve();
        });

        server.once('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            winstonLogger.error(`Port ${PORT} is already in use - attempt ${i + 1}`);
            reject(err);
          } else {
            winstonLogger.error(`Server error: ${err.message}`);
            reject(err);
          }
        });
      });

      // If we got here, server started successfully
      return;

    } catch (error) {
      winstonLogger.error(`Server start attempt ${i + 1} failed:`, error);
      await wait(2000); // Wait before retry

      if (i === retries - 1) {
        winstonLogger.error('All server start attempts failed');
        process.exit(1);
      }
    }
  }
};

// Middleware and routes setup...
app.use(logger('combined', { stream: fs.createWriteStream(path.join(logsDir, 'access.log'), { flags: 'a' }) }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    winstonLogger.info({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      responseTime: Date.now() - start,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
  });
  next();
});

app.use(cors({
  origin: function(origin, callback) {
    winstonLogger.debug(`CORS request from origin: ${origin}`);
    callback(null, true);
  },
  credentials: true
}));

app.use('/gpx', gpxRouter);
app.use('/elec', elecRouter);

// Graceful shutdown handler
const gracefulShutdown = async () => {
  winstonLogger.info('Received shutdown signal. Closing server...');
  if (server) {
    await new Promise(resolve => server.close(resolve));
    winstonLogger.info('Server closed successfully');
  }
  process.exit(0);
};

// Process handlers
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('uncaughtException', (error) => {
  winstonLogger.error('Uncaught Exception:', error);
  gracefulShutdown();
});
process.on('unhandledRejection', (reason, promise) => {
  winstonLogger.error('Unhandled Rejection:', { reason, promise });
  gracefulShutdown();
});

// Start the server
startServer();

module.exports = app;