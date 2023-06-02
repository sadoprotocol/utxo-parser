#!/usr/bin/env node
"use strict"

require('dotenv').config();

const MongoDB = require('../src/mongodb');
const Crawler = require('../src/crawler');
const Lookup = require('../src/lookup');
const Ord = require('../src/ord');

const args = process.argv.slice(2);

const lookupFunctions = ['balance', 'transaction', 'unconfirmed_transaction', 'transactions', 'unconfirmed_transactions', 'unspents', 'inscriptions', 'relay', 'mempool_info'];
const ordFunctions = ['indexing', 'indexer_status'];

async function db_connect() {
  console.log("Trying to connect to MongoDB..");
  await MongoDB.connect();
  console.log("MongoDB connected.");
}

if (!args.length || args[0] === 'indexer') {
  db_connect().then(() => {
    Crawler.start(true).catch(err => {
      console.log("Crawler uncought error", err);
    });
  }).catch(err => {
    console.log("Problem connecting to MongoDB", err);
  });
} else if (args[0] === 'repeater') {
  db_connect().then(() => {
    console.log('Running repeater..');

    Lookup.prepare().catch(err => {
      console.log("Lookup prepare uncought error", err);
    });
  }).catch(err => {
    console.log("Problem connecting to MongoDB", err);
  });
} else if (lookupFunctions.includes(args[0]) && args[1]) {
  if (args[2]) {
    try {
      args[2] = JSON.parse(args[2]);
    } catch (err) {
      console.log("Expecting second argument to be JSON string..");
      process.exit(0);
    }
  }

  MongoDB.connect().then(() => {
    Lookup[args[0]](args[1], args[2]).then(res => {
      let start = Date.now();
      console.log(JSON.stringify(res));
      let timeTaken = (Date.now() - start) * 100;

      if (timeTaken > 3000) {
        timeTaken = 3000;
      }

      setTimeout(() => {
        process.exit(0);
      }, timeTaken);
    }).catch(err => {
      console.log("Lookup uncought error", err);
      process.exit(0);
    });
  }).catch(err => {
    console.log("Problem connecting to MongoDB", err);
  })
} else if (ordFunctions.includes(args[0])) {
  Ord[args[0]]().then(res => {
    let start = Date.now();
    console.log(JSON.stringify(res));
    let timeTaken = (Date.now() - start) * 100;

    if (timeTaken > 3000) {
      timeTaken = 3000;
    }

    setTimeout(() => {
      process.exit(0);
    }, timeTaken);
  }).catch(err => {
    console.log("Ord uncought error", err);
    process.exit(0);
  });
} else {
  console.log("Can't help you..");
  process.exit(0);
}

