#!/usr/bin/env node
"use strict"

require('dotenv').config();

const MongoDB = require('../src/mongodb');
const Crawler = require('../src/crawler');

console.log("Trying to connect to MongoDB..");

MongoDB.connect().then(() => {
  console.log("MongoDB connected.");

  Crawler.start().catch(err => {
    console.log("Crawler uncought error", err);
  });
}).catch(err => {
  console.log("Problem connecting to MongoDB", err);
})
