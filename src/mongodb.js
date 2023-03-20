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

