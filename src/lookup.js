"use strict"

const Rpc = require('../src/rpc.js');
const Mongo = require('../src/mongodb');

const decimals = parseInt(process.env.DECIMALS);


exports.balance = balance;
exports.transactions = transactions;
exports.unspents = unspents;


function balance(address) {
  const db = Mongo.getClient();

  let promises = [];
  let pipelines = [];

  pipelines.push({
    $match: {
      "addressFrom": address
    }
  });
  pipelines.push({
    $project: {
      sats: 1,
    }
  });

  promises.push(db.collection("vin").aggregate(pipelines, { allowDiskUse:true }).toArray());

  pipelines = [];

  pipelines.push({
    $match: {
      "addressTo": address
    }
  });
  pipelines.push({
    $project: {
      sats: 1,
    }
  });

  promises.push(db.collection("vout").aggregate(pipelines, { allowDiskUse:true }).toArray());

  return new Promise((resolve, reject) => {
    Promise.all(promises).then(res => {
      let totalIn = 0;
      let totalOut = 0;

      for (let i = 0; i < res[0].length; i++) {
        totalIn += res[0][i].sats;
      }

      for (let i = 0; i < res[1].length; i++) {
        totalOut += res[1][i].sats;
      }

      let balance = totalOut - totalIn;

      resolve({
        int: balance,
        value: intToStr(balance, decimals)
      })
      resolve();
    }).catch(reject);
  });
}

function transactions(address) {}

function unspents(address) {}

// ==

function intToStr(num, decimal) {
  if (typeof num === 'string') {
    num = num.replace(',', '');
  } else {
    num = num.toLocaleString('fullwide', {useGrouping:false});
  }

  BigDecimal.decimals = decimal; // Configuration of the number of decimals you want to have.

  let a = new BigDecimal(num);
  let b = new BigDecimal("1" + "0".repeat(decimal));

  return a.divide(b).toString();
}

class BigDecimal {
  constructor(value) {
    let [ints, decis] = String(value).split(".").concat("");
    decis = decis.padEnd(BigDecimal.decimals, "0");
    this.bigint = BigInt(ints + decis);
  }
  static fromBigInt(bigint) {
    return Object.assign(Object.create(BigDecimal.prototype), { bigint });
  }
  divide(divisor) { // You would need to provide methods for other operations
    return BigDecimal.fromBigInt(this.bigint * BigInt("1" + "0".repeat(BigDecimal.decimals)) / divisor.bigint);
  }
  toString() {
    const s = this.bigint.toString().padStart(BigDecimal.decimals+1, "0");
    return s.slice(0, -BigDecimal.decimals) + "." + s.slice(-BigDecimal.decimals);
  }
}
