const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const routes = require('./routes/index.js');

require('./db.js');

const server = express();

server.name = 'API';

const allowedOrigins = new Set([
  'https://pokemon-app-client-psi.vercel.app',
  'https://pokemon-app-client-f97ktfi1k-augusviggias-projects.vercel.app',
]);
const vercelPreviewOrigin = /^https:\/\/pokemon-app-client-[a-z0-9-]+-augusviggias-projects\.vercel\.app$/;
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin) || vercelPreviewOrigin.test(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  optionsSuccessStatus: 204,
};

// Do not let Express convert successful GET responses into 304 responses.
// Axios treats 304 as a rejected response, while our frontend expects JSON.
server.disable('etag');
server.use(cors(corsOptions));
server.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
server.use(bodyParser.json({ limit: '50mb' }));
server.use(cookieParser());
server.use(morgan('dev'));

server.use('/', routes);

server.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  const message = err.message || err;
  console.error(err);
  res.status(status).send(message);
});

module.exports = server;
