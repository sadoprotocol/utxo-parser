"use strict"

const Rpc = require('../src/rpc');
const Ord = require('../src/ord');
const Mongo = require('../src/mongodb');

const decimals = parseInt(process.env.DECIMALS);
const inscriptionUrl = process.env.ORDINSCRIPTIONMEDIAURL || "";
const ordCommand = process.env.ORDCOMMAND || "";


exports.prepare = prepare;
exports.balance = balance;
exports.transaction = transaction;
exports.unconfirmed_transaction = unconfirmed_transaction;
exports.transactions = transactions;
exports.unconfirmed_transactions = unconfirmed_transactions;
exports.unspents = unspents;
exports.inscriptions = get_inscriptions;
exports.relay = relay;
exports.mempool_info = mempool_info;



async function prepare() {
  // Create collection and indexes
  let createCollections = [ 'address_transactions' ];
  let createCollectionsIndex = {
    "address_transactions": [
      {
        "address": 1,
        "blockheight": 1
      },
      {
        "address": 1,
        "blockheight": -1
      }
    ]
  };

  await Mongo.createCollectionAndIndexes(createCollections, createCollectionsIndex);

  transactions_repeater().catch(err => {
    console.log("Lookup transactions repeater uncought error", err);
  });
}

// ==

async function get_ordinals(outpoint) {
  let result = [];
  let sats = await Ord.list(outpoint);

  if (Array.isArray(sats)) {
    result = sats;

    for (let s = 0; s < sats.length; s++) {
      let traits = await Ord.traits(sats[s].start);

      if (traits && traits.name) {
        result[s] = { ...traits, ...result[s] };
      }
    }
  }

  return result;
}

async function get_inscriptions(outpoint, options = {}) {
  options = JSON.parse(JSON.stringify(options));

  let result = [];
  let res = await Ord.gioo(outpoint);

  if (options.full === undefined) {
    options.full = true;
  }

  if (
    res 
    && res.inscriptions 
    && Array.isArray(res.inscriptions)
    && res.inscriptions.length
  ) {
    for (let u = 0; u < res.inscriptions.length; u++) {
      let entry = await Ord.gie(res.inscriptions[u]);

      if (entry && entry.media_type) {
        if (!options.full) {
          entry.media_content = inscriptionUrl.replace("<outpoint>", outpoint).replace("<id>", res.inscriptions[u]); 
        }

        let oArr = outpoint.split(":");
        let txid = oArr[0];
        let vout_n = parseInt(oArr[1]);
        let tx = await transaction(txid, { noord: true });

        let voutIndex = tx.vout.findIndex(item => {
          return item.n === vout_n;
        });

        let owner = tx.vout[voutIndex].scriptPubKey.address;

        result.push({ ...{ id: res.inscriptions[u], outpoint, owner }, ...entry });
      }
    }
  }

  return result;
}

function get_null_data_utf8(asm) {
  if (asm.includes("OP_RETURN")) {
    asm = asm.replace("OP_RETURN", "").trim();
    let asmBuffer = Buffer.from(asm, "hex");

    return asmBuffer.toString();
  }

  return false;
}

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

// == transaction

async function expand_tx_data(tx, options) {
  options = JSON.parse(JSON.stringify(options));

  if (
    typeof tx === 'object' 
    && Array.isArray(tx.vin)
    && Array.isArray(tx.vout)
  ) {
    let totalIn = 0;
    let totalOut = 0;

    // build vin value and address
    for (let i = 0; i < tx.vin.length; i++) {
      let vinTx = await Rpc.getRawTransaction(tx.vin[i].txid);

      if (
        vinTx 
        && Array.isArray(vinTx.vout)
        && vinTx.vout[tx.vin[i].vout].n === tx.vin[i].vout
      ) {
        tx.vin[i].value = vinTx.vout[tx.vin[i].vout].value;
        tx.vin[i].address = (await Rpc.deriveAddresses(vinTx.vout[tx.vin[i].vout].scriptPubKey.desc))[0];

        totalIn = arithmetic("+", totalIn, vinTx.vout[tx.vin[i].vout].value, 8);
      }

      if (
        tx.vin[i].txinwitness 
        && Array.isArray(tx.vin[i].txinwitness) 
        && options.nowitness
      ) {
        delete tx.vin[i].txinwitness;
      }
    }

    for (let i = 0; i < tx.vout.length; i++) {
      if (!options.noord) {
        let outpoint = tx.txid + ":" + tx.vout[i].n;

        if (ordCommand) {
          tx.vout[i].ordinals = await get_ordinals(outpoint);
          tx.vout[i].inscriptions = await get_inscriptions(outpoint, { full: false });
        }
      }

      if (tx.vout[i].scriptPubKey && tx.vout[i].scriptPubKey.type === 'nulldata') {
        tx.vout[i].scriptPubKey.utf8 = get_null_data_utf8(tx.vout[i].scriptPubKey.asm);
      }

      // check if spent
      let spentRes = await Rpc.getTxOut(tx.txid, tx.vout[i].n);

      if (spentRes) {
        tx.vout[i].unspent = {
          bestblock: spentRes.bestblock,
          confirmations: spentRes.confirmations,
          coinbase: spentRes.coinbase
        };
        tx.vout[i].spent = false;
      } else {
        tx.vout[i].unspent = false;
        tx.vout[i].spent = true;
      }

      totalOut = arithmetic("+", totalOut, tx.vout[i].value, 8);
    }

    tx.fee = arithmetic("-", totalIn, totalOut, 8);

    if (options.nohex) {
      delete tx.hex;
    }

    // get the block height
    let networkBlockHeight = await Rpc.getBlockCount();

    tx.blockheight = (networkBlockHeight - tx.confirmations) + 1;
  }

  return tx;
}

async function transaction(txid, options = {}) {
  options = JSON.parse(JSON.stringify(options));

  if (options.noord === undefined) {
    options.noord = false;
  }

  let tx = await Rpc.getRawTransaction(txid);

  tx = await expand_tx_data(tx, options);

  return tx;
}

async function unconfirmed_transaction(wtxid) {
  return await Rpc.getMempoolEntry(wtxid);
}

// == transactions

async function save_address_transaction(address, tx) {
  const db = Mongo.getClient();

  tx.address = address;

  return await db.collection("address_transactions").updateOne({
    "address": address,
    "txid": tx.txid
  }, {
    $set: tx
  }, {
    upsert: true
  });
}

function transactions_options(options) {
  options = JSON.parse(JSON.stringify(options));

  if (options.noord === undefined) {
    options.noord = false;
  }

  if (!options.limit || isNaN(options.limit)) {
    options.limit = 50;
  }

  if (options.nohex === undefined) {
    options.nohex = false;
  }

  if (options.nowitness === undefined) {
    options.nowitness = false;
  }

  if (!options.before || isNaN(options.before)) {
    options.before = 0;
  }

  if (!options.after || isNaN(options.after)) {
    options.after = 0;
  }

  return options;
}

function transactions_refresh_helper(address) {
  const db = Mongo.getClient();

  let promises = [];
  let pipelines = [];

  let match = {
    "addressFrom": address
  };

  pipelines.push({
    $match: match
  });
  pipelines.push({
    $group: {
      _id: {
        blockN: "$blockN",
        txid: "$txid",
      },
      data: {
        $push: {
          n: "$n",
          txid: "$txid",
        },
      },
    }
  });
  pipelines.push({
    $project: {
      blockN: "$_id.blockN",
      txid: "$_id.txid"
    }
  });
  pipelines.push({
    $sort: {
      blockN: -1,
    }
  });

  promises.push(db.collection("vin").aggregate(pipelines));

  pipelines = [];

  match = {
    "addressTo": address
  };

  pipelines.push({
    $match: match
  });
  pipelines.push({
    $group: {
      _id: {
        blockN: "$blockN",
        txid: "$txid",
      },
      data: {
        $push: {
          n: "$n",
          txid: "$txid",
        },
      },
    }
  });
  pipelines.push({
    $project: {
      blockN: "$_id.blockN",
      txid: "$_id.txid"
    }
  });
  pipelines.push({
    $sort: {
      blockN: -1,
    }
  });

  promises.push(db.collection("vout").aggregate(pipelines));

  return Promise.all(promises);
}

async function transactions_refresh(address) {
  let doneTxids = [];
  let res = await transactions_refresh_helper(address);

  while(await res[0].hasNext() || await res[1].hasNext()) {
    if (await res[0].hasNext()) {
      let doc = await res[0].next();

      if (!doneTxids.includes(doc.txid)) {
        doneTxids.push(doc.txid);

        let tx = await transaction(doc.txid);

        await save_address_transaction(address, tx);
      }
    }

    if (await res[1].hasNext()) {
      let doc = await res[1].next();

      if (!doneTxids.includes(doc.txid)) {
        doneTxids.push(doc.txid);

        let tx = await transaction(doc.txid);

        await save_address_transaction(address, tx);
      }
    }
  }
}

async function get_address_blocktip(address, rightAfter = false, inclusive = false) {
  const db = Mongo.getClient();

  let pipelines = [];

  let match = {
    "address": address
  };

  if (rightAfter) {
    if (inclusive) {
      match.blockheight = { $gte: rightAfter };
    } else {
      match.blockheight = { $gt: rightAfter };
    }
  }

  let sort = {
    "address": 1,
    "blockheight": -1
  }

  if (rightAfter) {
    sort.blockheight = 1;
  }

  pipelines.push({
    $match: match
  });
  pipelines.push({
    $sort: sort
  });
  pipelines.push({
    $limit: 1
  });

  let cursor = db.collection("address_transactions").aggregate(pipelines);
  let blockheight = 0;

  while(await cursor.hasNext()) {
    const doc = await cursor.next();
    blockheight = doc.blockheight;
    break;
  }

  return blockheight;
}

async function get_address_blockfloor(address, rightBefore = false, inclusive = false) {
  const db = Mongo.getClient();

  let pipelines = [];

  let match = {
    "address": address
  };

  if (rightBefore) {
    if (inclusive) {
      match.blockheight = { $lte: rightBefore };
    } else {
      match.blockheight = { $lt: rightBefore };
    }
  }

  let sort = {
    "address": 1,
    "blockheight": 1
  }

  if (rightBefore) {
    sort.blockheight = -1;
  }

  pipelines.push({
    $match: match
  });
  pipelines.push({
    $sort: sort
  });
  pipelines.push({
    $limit: 1
  });

  let cursor = db.collection("address_transactions").aggregate(pipelines);
  let blockheight = 0;

  while(await cursor.hasNext()) {
    const doc = await cursor.next();
    blockheight = doc.blockheight;
    break;
  }

  return blockheight;
}

async function got_cache_transactions(address, options) {
  options = JSON.parse(JSON.stringify(options));

  const db = Mongo.getClient();

  let pipelines = [];

  let match = {
    "address": address
  };

  if (options.before !== 0 && !isNaN(options.before)) {
    match.blockheight = { $lte: options.before };
  }

  let reverse = false;
  let negate = false;

  if (options.after !== 0 && !isNaN(options.after)) {
    if (typeof match.blockheight === 'object') {
      negate = true;
      match.blockheight = { 
        $lte: options.before,
        $gte: options.after
      };
    } else {
      reverse = true;
      match.blockheight = { $gte: options.after };
    }
  }

  let sort = {
    "address": 1,
    "blockheight": -1
  }

  if (reverse) {
    sort.blockheight = 1;
  }

  pipelines.push({
    $match: match
  });
  pipelines.push({
    $sort: sort
  });

  let project = {
    _id: 0,
    address: 0
  }

  if (options.noord) {
    project['vout.ordinals'] = 0;
    project['vout.inscriptions'] = 0;
  }

  if (options.nohex) {
    project.hex = 0;
  }

  if (options.nowitness) {
    project['vin.txinwitness'] = 0;
  }

  pipelines.push({
    $project: project
  });

  let cursor = db.collection("address_transactions").aggregate(pipelines);
  let result = [];
  let height = 0;
  let blockheight = 0;

  while(await cursor.hasNext()) {
    const doc = await cursor.next();

    if (reverse) {
      if (!blockheight) {
        blockheight = doc.blockheight;
      }

      if (height === doc.blockheight) {
        // don't do anything
      } else if (result.length >= options.limit) {
        height = doc.blockheight;
        break;
      }

      result.unshift(doc);
      height = doc.blockheight;
    } else {
      if (!height) {
        height = doc.blockheight;
      }

      if (blockheight === doc.blockheight) {
        // don't do anything
      } else if (result.length >= options.limit) {
        blockheight = doc.blockheight;
        break;
      }

      result.push(doc);
      blockheight = doc.blockheight;
    }
  }

  options.after = await get_address_blocktip(address, height, reverse);
  if (negate) {
    reverse = !reverse;
  }
  options.before = await get_address_blockfloor(address, blockheight, !reverse);

  // ==

  let addressBlockFloor = await get_address_blockfloor(address);

  if (addressBlockFloor === blockheight) {
    options.before = false;
  }

  let addressBlockTip = await get_address_blocktip(address);

  if (addressBlockTip === height) {
    options.after = false;
  }

  return {
    txs: result,
    options
  }
}

async function transactions_repeater() {
  const db = Mongo.getClient();

  let pipelines = [];

  pipelines.push({
    $group: {
      _id: "$address",
      count: {
        $sum: 1
      }
    }
  });

  let cursor = db.collection("address_transactions").aggregate(pipelines);
  let counter = 0;

  while(await cursor.hasNext()) {
    counter++;
    const doc = await cursor.next();
    await transactions_refresh(doc._id);
  }

  if (counter < 50) {
    await new Promise(resolve => setTimeout(resolve, 300000));
    await transactions_repeater();
  } else {
    await transactions_repeater();
  }
}

function transactions(address, options = {}) {
  options = JSON.parse(JSON.stringify(options));

  return new Promise(async (resolve, reject) => {
    options = transactions_options(options);

    try {
      let gotCache = await got_cache_transactions(address, options);

      if (gotCache && gotCache.txs && gotCache.txs.length) {
        resolve(gotCache);
        return;
      }

      setTimeout(async () => {
        resolve(await got_cache_transactions(address, options));
      }, 95000);

      await transactions_refresh(address);

      resolve(await got_cache_transactions(address, options));
    } catch (err) {
      reject(err);
    }
  });
}

async function unconfirmed_transactions(noarg, options = {}) {
  options = JSON.parse(JSON.stringify(options));

  if (options.verbose === undefined) {
    options.verbose = false;
  }

  return await Rpc.getRawMempool(options.verbose);
}

// == unspents

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
      addressTo: 0
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

async function unspents(address, options = {}) {
  options = JSON.parse(JSON.stringify(options));

  let unspents = await unspents_helper(address);

  for (let i = 0; i < unspents.length; i++) {
    if (!options.noord) {
      let outpoint = unspents[i].txid + ":" + unspents[i].n;

      if (ordCommand) {
        unspents[i].ordinals = await get_ordinals(outpoint);
        unspents[i].inscriptions = await get_inscriptions(outpoint, { full: false });
      }
    }

    if (unspents[i].scriptPubKey && unspents[i].scriptPubKey.type === 'nulldata') {
      unspents[i].scriptPubKey.utf8 = get_null_data_utf8(unspents[i].scriptPubKey.asm);
    }
  }

  return unspents;
}

// == relay

async function relay(hex) {
  return await Rpc.sendRawTransaction(hex);
}

// == mempool

async function mempool_info(noarg) {
  return await Rpc.getMempoolInfo();
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

function arithmetic(operation, a, b, decimal) {
  // Replace coma if exists
  let re = new RegExp(',', 'g');
  a = parseFloat(a.toString().replace(re, ''));
  b = parseFloat(b.toString().replace(re, ''));

  // To integer
  a = a * (10 ** decimal);
  b = b * (10 ** decimal);

  if (operation === '+') {
    return intToStr(a + b, decimal);
  } else if (operation === '-') {
    return intToStr(a - b, decimal);
  } else {
    return false;
  }
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
