const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require('cors');
const fs = require('fs');
const winston = require('winston');
require('dotenv').config();

const gpxRouter = require('./routes/gpx');
const elecRouter = require('./routes/elec');
const { createServer } = require("node:https");
const app = express();

const sslOptions = {
  key: fs.readFileSync(path.join(__dirname, 'certificates', 'privkey.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'certificates', 'fullchain.pem')),
};

const PORT = 3000;

// Configure Winston logger first
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

// Function to check if port is in use
const checkPort = (port) => {
  return new Promise((resolve, reject) => {
    const tempServer = require('net').createServer()
    tempServer.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        reject(err);
      }
    });
    tempServer.once('listening', () => {
      tempServer.close();
      resolve(false);
    });
    tempServer.listen(port);
  });
};

// Start server with port check
const startServer = async () => {
  try {
    const isPortInUse = await checkPort(PORT);
    if (isPortInUse) {
      winstonLogger.error(`Port ${PORT} is already in use`);
      process.exit(1); // Exit with error code
    }

    const httpsServer = createServer(sslOptions, app);
    httpsServer.listen(PORT, () => {
      winstonLogger.info(`Secure server running on port ${PORT}`);
    });

    httpsServer.on('error', (err) => {
      if (err.code === 'EACCES') {
        winstonLogger.error(`Port ${PORT} requires elevated privileges`);
        process.exit(1);
      } else if (err.code === 'EADDRINUSE') {
        winstonLogger.error(`Port ${PORT} is already in use`);
        process.exit(1);
      } else {
        winstonLogger.error('An error occurred:', err);
        process.exit(1);
      }
    });

  } catch (error) {
    winstonLogger.error('Server startup error:', error);
    process.exit(1);
  }
};

// Create a write stream for Morgan
const accessLogStream = fs.createWriteStream(
    path.join(logsDir, 'access.log'),
    { flags: 'a' }
);

// Middleware
app.use(logger('combined', { stream: accessLogStream }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Add request logging middleware
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

// CORS configuration with logging
app.use(cors({
  origin: function(origin, callback) {
    winstonLogger.debug(`CORS request from origin: ${origin}`);
    callback(null, true);
  },
  credentials: true
}));

// Routes
app.use('/gpx', gpxRouter);
app.use('/elec', elecRouter);

// Enhanced error handler with logging
app.use((err, req, res, next) => {
  winstonLogger.error({
    message: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
    ip: req.ip
  });
  res.status(500).send('Something broke!');
});

// Process error handling
process.on('uncaughtException', (error) => {
  winstonLogger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  winstonLogger.error('Unhandled Rejection:', { reason, promise });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  winstonLogger.info('SIGTERM received. Performing graceful shutdown...');
  process.exit(0);
});

process.on('SIGINT', () => {
  winstonLogger.info('SIGINT received. Performing graceful shutdown...');
  process.exit(0);
});

// Start the server
startServer();

module.exports = app;