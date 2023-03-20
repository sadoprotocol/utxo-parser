"use strict"

const fs = require('fs').promises;

const { dirname } = require('path');
const path = dirname(dirname(require.main.filename)) + "/data";

exports.blockHeight = blockHeight;


async function readFile(filename) {
  const data = await fs.readFile(`${path}/${filename}`, 'binary');
  return (Buffer.from(data)).toString();
}

async function writeFile(filename, data) {
  if (typeof data !== 'string') {
    data = JSON.stringify(data);
  }

  return await fs.writeFile(`${path}/${filename}`, data);
}

async function blockHeight(number = false) {
  const filename = 'block_n';
  if (number === false) {
    try {
      return await readFile(filename);
    } catch (err) {
      await writeFile(filename, 0);
      return await readFile(filename);
    }
  }

  if (isNaN(number)) {
    return false;
  }

  return await writeFile(filename, number);
}
