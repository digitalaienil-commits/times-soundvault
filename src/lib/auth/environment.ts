import "server-only";

import { cache } from "react";

import { parseAuthEnvironment } from "./environment-schema";

export const getAuthEnvironment = cache(() =>
  parseAuthEnvironment(process.env),
);
