process.env.NODE_ENV = "test";
process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/khamosh-alfaaz-test";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret";

let mongoose;
let app;
let request;

export async function setup() {
  mongoose = (await import("mongoose")).default;
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  await mongoose.connection.db.dropDatabase();

  const appMod = await import("../app.js");
  app = appMod.createApp();
  const supertest = (await import("supertest")).default;
  request = supertest(app);
  return { app, request, mongoose };
}

export async function teardown() {
  if (mongoose) await mongoose.disconnect();
}

export function appRef() {
  return app;
}

export function req() {
  return request;
}

export async function newAgent() {
  const supertest = (await import("supertest")).default;
  return supertest.agent(app);
}