require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");

const MONGO_USER = process.env.MONGO_DB_USERNAME;
const MONGO_PASS = process.env.MONGO_DB_PASSWORD;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;
const MONGO_COLLECTION = process.env.MONGO_COLLECTION;

const uri = `mongodb+srv://${MONGO_USER}:${MONGO_PASS}@auth.kr7x4gt.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const database = client.db(MONGO_DB_NAME);

const apps = database.collection(MONGO_COLLECTION);

const updateTokens = async (tokens, google_id) => {
  if (google_id !== "") {
    const query = { google_id: google_id };
    await apps.updateOne(query, {
      $inc: { tokens: tokens },
    });
  }

  return true;
};

const setTokens = async (tokens, google_id) => {
  if (google_id !== "") {
    const query = { google_id: google_id };
    await apps.updateOne(query, {
      $set: { tokens: tokens },
    });
  }

  return true;
};

module.exports = {
  updateTokens,
  setTokens,
};
