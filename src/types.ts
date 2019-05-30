import { Worker as ClusterWorker } from "cluster";
import { Context } from "mocha";

export interface Capabilities {
  browserName: string;
}

export interface BrowserConfig {
  limit: number;
}

export interface Config {
  gridUrl: string;
  address: {
    host: string;
    port: number;
    path: string;
  };
  testRegex: RegExp;
  testDir: string;
  screenDir: string;
  reportDir: string;
  maxRetries: number;
  browsers: { [key: string]: Capabilities & BrowserConfig };
  hooks: {
    beforeAll: (this: Context) => void;
    beforeEach: (this: Context) => void;
  };
}

export interface Options {
  config: string;
  parser: boolean;
  ui: boolean;
  browser?: string;
  reporter?: string;
}

export interface Worker extends ClusterWorker {
  isRunnning?: boolean;
}

export interface Workers {
  [browser: string]: Worker[];
}

export type WorkerMessage =
  | {
      type: "ready";
    }
  | {
      type: "error";
      payload: any;
    }
  | {
      type: "test";
      payload: TestResult;
    };

export interface Images {
  actual: string;
  expect?: string;
  diff?: string;
}

export type TestStatus = "unknown" | "pending" | "running" | "failed" | "success";

export interface TestResult {
  status: TestStatus;
  images?: Partial<{ [name: string]: Images }>;
  error?: any;
}

export interface Test {
  id: string;
  path: string[];
  retries: number;
  skip?: boolean;
  results?: Partial<{ [retry: number]: TestResult }>;
}

export interface CreeveyStatus {
  isRunning: boolean;
  testsById: Partial<{ [id: string]: Test }>;
}

export interface TestUpdate extends TestResult {
  id: string;
  retry: number;
}

export interface ApprovePayload {
  id: string;
  retry: number;
  image: string;
}

export type Request =
  | { type: "status" }
  | { type: "start"; payload: string[] }
  | { type: "stop" }
  | { type: "approve"; payload: ApprovePayload };

export type Response =
  | { type: "status"; payload: CreeveyStatus }
  | { type: "start"; payload: string[] }
  | { type: "stop" }
  | { type: "test"; payload: TestUpdate };

export function isTest<T1, T2 extends Test>(x: T1 | T2): x is T2 {
  return (
    "id" in x &&
    "path" in x &&
    "retries" in x &&
    Array.isArray(x.path) &&
    typeof x.id == "string" &&
    typeof x.retries == "number"
  );
}

export function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
