#!/usr/bin/env node
"use strict"

require('dotenv').config();

const MongoDB = require('../src/mongodb');
const Crawler = require('../src/crawler');
const Lookup = require('../src/lookup');

const args = process.argv.slice(2);

const lookupFunctions = ['balance', 'transaction', 'transactions', 'unspents'];

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
  MongoDB.connect().then(() => {
    Lookup[args[0]](args[1]).then(res => {
      console.log(JSON.stringify(res));
      process.exit(0);
    }).catch(err => {
      console.log("Lookup uncought error", err);
    });
  }).catch(err => {
    console.log("Problem connecting to MongoDB", err);
  })
} else {
  console.log("Can't help you..");
  process.exit(0);
}

