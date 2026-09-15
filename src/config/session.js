import { env } from "./env.js";

export const sessionConfig = {
  name: "dhsid",
  secret: env.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: env.nodeEnv === "production" ? "none" : "lax",
    path: "/",
    maxAge: env.sessionMaxAgeMs,
    domain: undefined,
  },
  rolling: true,
};