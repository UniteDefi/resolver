import * as dotenv from "dotenv";

dotenv.config();

jest.setTimeout(300000);

global.console = {
  ...console,
  log: process.env.TEST_VERBOSE ? console.log : jest.fn(),
  debug: process.env.TEST_VERBOSE ? console.debug : jest.fn(),
  info: process.env.TEST_VERBOSE ? console.info : jest.fn(),
  warn: console.warn,
  error: console.error,
};
