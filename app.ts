import * as dotenv from 'dotenv';
import * as mongoDB from 'mongodb';
import { faker } from '@faker-js/faker';
import { randomInt } from 'crypto';

class Address {
  constructor(
    public line1: string,
    public line2: string,
    public postcode: string,
    public city: string,
    public state: string,
    public country: string,
  ) {}
}
class Customer {
  constructor(
    public firstName: string,
    public lastName: string,
    public email: string,
    public createdAt: string,
    public address: Address,
    public _id?: mongoDB.ObjectId,
  ) {}
}

const DATABASE_NAME = 'test';
const COLLECTION_NAME = 'customers';

function generateFakeIdentity(): Customer {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();

  return new Customer(
    firstName,
    lastName,
    faker.internet.email({ firstName, lastName }),
    faker.date.between({ from: '1990-01-01T00:00:00.000Z', to: '2020-01-01T00:00:00.000Z' }).toISOString(),
    new Address(
      faker.location.buildingNumber(),
      faker.location.street(),
      faker.location.zipCode(),
      faker.location.city(),
      faker.location.state(),
      faker.location.country(),
    ),
  );
}

async function connectToDatabase(): Promise<mongoDB.Db> {
  dotenv.config();
  const client: mongoDB.MongoClient = new mongoDB.MongoClient(process.env.DB_URI || 'mongodb://localhost:27017');
  await client.connect();
  const db: mongoDB.Db = client.db(DATABASE_NAME);
  return db;
}

async function batchInsertLoop(db: mongoDB.Db) {
  //   db.createCollection(COLLECTION_NAME);
  const collection = db.collection(COLLECTION_NAME);

  setInterval(async () => {
    const batch = Array.from({ length: randomInt(1, 11) }, generateFakeIdentity);
    await insert(batch, collection);
    console.log('inserted = ', batch.length);
  }, 200);
}

async function insert(customers: Customer[], collection: mongoDB.Collection) {
  await collection.insertMany(customers);
}

async function start() {
  const db = await connectToDatabase();
  await batchInsertLoop(db);
}

start();
