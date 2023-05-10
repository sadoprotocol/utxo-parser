#!/usr/bin/env node
"use strict"

require('dotenv').config();

const MongoDB = require('../src/mongodb');
const Crawler = require('../src/crawler');
const Lookup = require('../src/lookup');

const args = process.argv.slice(2);

const lookupFunctions = ['balance', 'transaction', 'transactions', 'unspents', 'relay', 'inscriptions'];

if (!args.length) {
  console.log("Trying to connect to MongoDB..");
  MongoDB.connect().then(() => {
    console.log("MongoDB connected.");

    Crawler.start(true).catch(err => {
      console.log("Crawler uncought error", err);
    });
  }).catch(err => {
    console.log("Problem connecting to MongoDB", err);
  })
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
} else {
  console.log("Can't help you..");
  process.exit(0);
}

