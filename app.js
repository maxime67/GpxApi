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
const app = express();

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Configure Winston logger
const winstonLogger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
  ),
  transports: [
    // Write to all logs with level 'info' and below to combined.log
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write all logs error (and below) to error.log
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Console output
    new winston.transports.Console({
      format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
      )
    })
  ]
});

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
});

process.on('unhandledRejection', (reason, promise) => {
  winstonLogger.error('Unhandled Rejection:', { reason, promise });
});

module.exports = app;