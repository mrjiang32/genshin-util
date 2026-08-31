import { rimraf } from "rimraf";
import { OUT_DIR, CONTENT_JSON, DONE_FILE } from "./config.js";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    all: {
      short: "a",
      type: "boolean",
    },
  },
  strict: false,
});

if (values.all) {
  await rimraf(OUT_DIR);
  await rimraf(CONTENT_JSON);
}
await rimraf(DONE_FILE);
