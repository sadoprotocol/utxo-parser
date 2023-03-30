"use strict"

const Rpc = require('../src/rpc');
const Ord = require('../src/ord');
const Mongo = require('../src/mongodb');

const decimals = parseInt(process.env.DECIMALS);


exports.balance = balance;
exports.transaction = transaction;
exports.transactions = transactions;
exports.unspents = unspents;

// bcrt1qqfraj903u6pneppeyreytwmppgztk29v4y25f5
// bcrt1qrx5q9qyw80f5vk4lmrcqrgl4ed283nrp23rv4j

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
    }).catch(reject);
  });
}

function transaction(txid) {
  return new Promise((resolve, reject) => {
    Rpc.getRawTransaction(txid).then(tx => {
      resolve(tx);
    }).catch(reject);
  });
}

function transactions(address) {
  const db = Mongo.getClient();

  let promises = [];
  let pipelines = [];

  pipelines.push({
    $match: {
      "addressFrom": address
    }
  });
  pipelines.push({
    $sort: {
      "blockN": -1,
      "n": 1
    }
  });
  pipelines.push({
    $project: {
      txid: 1,
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
    $sort: {
      "blockN": -1,
      "n": 1
    }
  });
  pipelines.push({
    $project: {
      txid: 1,
    }
  });

  promises.push(db.collection("vout").aggregate(pipelines, { allowDiskUse:true }).toArray());

  return new Promise((resolve, reject) => {
    Promise.all(promises).then(res => {
      let outs = [];
      let doneTxids = [];

      let inCounter = 0;
      let outCounter = 0;
      let goneOut = res[1].length === 0 ? true : false;

      for (let i = 0; i < res[0].length; i++) {
        if (!doneTxids.includes(res[0][i].txid)) {
          doneTxids.push(res[0][i].txid);

          // get from rpc
          inCounter++;
          Rpc.getRawTransaction(res[0][i].txid).then(tx => {
            outs.push(tx);
            inCounter--;

            if (inCounter === 0 && outCounter === 0 && goneOut) {
              resolve(outs.sort((a,b) => a.confirmations - b.confirmations));
            }
          });
        }
      }

      for (let i = 0; i < res[1].length; i++) {
        if (!doneTxids.includes(res[1][i].txid)) {
          doneTxids.push(res[1][i].txid);

          // get from rpc
          outCounter++;
          Rpc.getRawTransaction(res[1][i].txid).then(tx => {
            outs.push(tx);
            outCounter--;

            if (inCounter === 0 && outCounter === 0) {
              resolve(outs.sort((a,b) => a.confirmations - b.confirmations));
            }
          });
        }

        goneOut = true;
      }

      if (res[0].length === 0 && res[1].length === 0) {
        resolve(outs);
      }
    }).catch(reject);
  });
}

function unspents_helper(address) {
  const db = Mongo.getClient();

  let pipelines = [];

  pipelines.push({
    $match: {
      "addressTo": address
    }
  });
  pipelines.push({
    $sort: {
      "blockN": -1,
      "n": 1
    }
  });
  pipelines.push({
    $project: {
      _id: 0,
    }
  });

  return new Promise((resolve, reject) => {
    db.collection("vout").aggregate(pipelines, { allowDiskUse:true }).toArray().then(res => {
      let counter = 0;
      let outs = [];

      for (let i = 0; i < res.length; i++) {
        counter++;

        db.collection("vin").findOne({
          prev_txid: res[i].txid,
          vout: res[i].n
        }).then(got => {
          if (!got) {
            outs.push(res[i]);
          }

          counter--;

          if (counter === 0) {
            resolve(outs.sort((a,b) => a.blockN - b.blockN));
          }
        }).catch(reject);
      }

      if (res.length === 0) {
        resolve(outs);
      }
    }).catch(reject);
  });
}

async function unspents(address) {
  let unspents = await unspents_helper(address);

  for (let i = 0; i < unspents.length; i++) {
    let outpoint = unspents[i].txid + ":" + unspents[i].n;
    let sats = await Ord.list(outpoint);

    if (Array.isArray(sats)) {
      unspents[i].ordinals = sats;

      for (let s = 0; s < sats.length; s++) {
        let res = await Ord.gioo(outpoint);

        if (res && res.inscriptions && Array.isArray(res.inscriptions)) {
          unspents[i].ordinals[s].inscriptions = res.inscriptions;
        }
      }
    }
  }

  return unspents;
}

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
