#!/usr/bin/env node
"use strict"

require('dotenv').config();

const Rpc = require('../src/rpc.js');

Rpc.getBlockCount().then(res => {
  console.log('res', res);
});
