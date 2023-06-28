import * as dotenv from 'dotenv';
import * as mongoDB from 'mongodb';
import { Readable, Transform, TransformCallback, Writable } from 'stream';
import { faker } from '@faker-js/faker';

const DATABASE_NAME = 'test';
const READ_COLLECTION_NAME = 'customers';
const WRITE_COLLECTION_NAME = 'customers_anonimysed';

async function connectToDatabase(): Promise<mongoDB.Db> {
  dotenv.config();
  console.log('connecting to db');
  const client: mongoDB.MongoClient = new mongoDB.MongoClient(process.env.DB_URI || 'mongodb://localhost:27017');
  await client.connect();
  const db: mongoDB.Db = client.db(DATABASE_NAME);
  console.log('connected to db');
  return db;
}

async function batchInsertLoop(db: mongoDB.Db, isFullRead: boolean) {
  const readCollection = db.collection(READ_COLLECTION_NAME);
  const writeCollection = db.collection(WRITE_COLLECTION_NAME);

  const batcher = new BatchStream({
    readableObjectMode: true,
    writableObjectMode: true,
  });
  setInterval(() => {
    batcher.flush();
  }, 1000);
  console.log('before listen');

  const pipeline = readStream(readCollection, isFullRead).pipe(batcher).pipe(writeStream(writeCollection));
  if (isFullRead) {
    pipeline.on('close', () => process.exit(0));
  }

  console.log('started listening');
}

function readStream(collection: mongoDB.Collection<mongoDB.BSON.Document>, isFullRead: boolean): Readable {
  if (isFullRead) {
    return collection
      .find(
        {},
        {
          batchSize: 100,
        },
      )
      .stream(new DocumentAnonimyzer());
  }

  return collection
    .watch([], { fullDocument: 'required', maxAwaitTimeMS: 1000 })
    .stream(new ChangeToDocumentAnonimyzer());
}

class DocumentAnonimyzer implements mongoDB.CursorStreamOptions {
  transform(this: void, doc: mongoDB.BSON.Document): mongoDB.BSON.Document {
    const firstName = faker.string.alpha(8);
    const lastName = faker.string.alpha(8);
    const email: string = doc.email;
    const provider = email.split('@')[1].trim();

    doc.email = faker.internet.email({ firstName, lastName, provider });
    doc.firstName = firstName;
    doc.lastName = lastName;
    doc.address.line1 = faker.string.alpha(8);
    doc.address.line2 = faker.string.alpha(8);
    doc.address.postcode = faker.string.alpha(8);

    return doc;
  }
}

class ChangeToDocumentAnonimyzer extends DocumentAnonimyzer {
  transform(this: void, changeDoc: mongoDB.BSON.Document): mongoDB.BSON.Document {
    return super.transform(changeDoc.fullDocument);
  }
}

function writeStream(collection: mongoDB.Collection<mongoDB.BSON.Document>): Writable {
  return new Writable({
    emitClose: true,
    highWaterMark: 1,
    objectMode: true,
    async write(chunk, _, next) {
      const updateMany = chunk.map((doc: mongoDB.BSON.Document) => {
        return {
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: doc },
            upsert: true,
          },
        };
      });
      const res = await collection.bulkWrite(updateMany);
      // console.log('write = ', JSON.stringify(res, undefined, 4));
      console.log('write = ', updateMany.length);
      next();
    },
  });
}

class BatchStream extends Transform {
  batch: any[] = [];
  batchSize = 100;

  _transform(chunk: any, _: BufferEncoding, next: TransformCallback): void {
    this.batch.push(chunk);
    // console.log('push to batch, batch.length = ', this.batch.length);
    if (this.batch.length >= this.batchSize) {
      // console.log('batch is full');
      this.flush();
    }
    next();
  }

  _flush(next: TransformCallback): void {
    // console.log('flush , batch.length = ', this.batch.length);
    if (this.batch.length) {
      this.push(this.batch);
      this.batch = [];
    }
    next();
  }

  flush() {
    if (this.batch.length) {
      this.push(this.batch);
      this.batch = [];
    }
    // console.log('drain');
  }
}

async function start(isFullRead: boolean) {
  const db = await connectToDatabase();
  await batchInsertLoop(db, isFullRead);
}

start(process.argv.some((arg) => arg === '--full-reindex'));
