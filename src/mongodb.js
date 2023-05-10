"use strict";

const MongoClient = require('mongodb').MongoClient;

const mongoConfig = {
  hostname: process.env.MONGOHOSTNAME,
  port: process.env.MONGOPORT,
  database: process.env.MONGODATABASE,
  username: process.env.MONGOUSERNAME,
  password: process.env.MONGOPASSWORD
};

exports.getClient = getClient;
exports.connect = connectServer;
exports.disconnect = disconnect;
exports.createCollectionAndIndexes = createCollectionAndIndexes;



var dbConnected = false;
var dbDatabase = false;

function getClient(prefix = "") {
  if (prefix !== '') {
    prefix += '-';
  }

  if (dbConnected === false) {
    throw new Error('MongoDB disconnected');
  }

  return dbConnected.db(prefix + dbDatabase);
}

function connectDb(url) {
  const client = new MongoClient(url);

  return client.connect({ 
    useNewUrlParser: true, 
    useUnifiedTopology: true, 
    authSource:'admin' 
  });
}

async function connectServer() {
  let url = "";

  if (mongoConfig.username === "" && mongoConfig.password === "") {
    url = "mongodb://" + mongoConfig.hostname + ":" + mongoConfig.port + '/' + mongoConfig.database;
  } else {
    url = "mongodb://" + mongoConfig.username + ":" + mongoConfig.password + "@" + mongoConfig.hostname + ":" + mongoConfig.port + '/' + mongoConfig.database;
  }

  dbConnected = await connectDb(url);
  dbDatabase = mongoConfig.database;

  return dbConnected;
}

function disconnect() {
  if (dbConnected) {
    dbConnected.close();
  }
}

async function createCollectionAndIndexes(createCollections, createCollectionsIndex) {
  if (!Array.isArray(createCollections)) {
    throw new Error('Invalid createCollections data.');
  }

  if (typeof createCollectionsIndex !== 'object') {
    throw new Error('Invalid createCollectionsIndex data.');
  }

  const db = getClient();

  // Create collection and indexes
  let collections = await db.listCollections().toArray();

  for (let i = 0; i < collections.length; i++) {
    if (collections[i].type === 'collection') {
      let index = createCollections.indexOf(collections[i].name);

      if (index > -1) {
        createCollections.splice(index, 1);
      }
    }
  }

  for (let i = 0; i < createCollections.length; i++) {
    let name = createCollections[i];

    await db.createCollection(name);

    console.log('Created new collection' + name + '.');

    if (createCollectionsIndex[name]) {
      // Create the indexes
      for (let m = 0; m < createCollectionsIndex[name].length; m++) {
        await db.collection(name).createIndex(createCollectionsIndex[name][m]);
        console.log('Collection ' + name + ' is indexed [' + m + '].');
      }
    }
  }
}

