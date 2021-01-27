import { promisify } from 'util';
import fs, { Stats } from 'fs';
import path from 'path';
import chai from 'chai';
import chalk from 'chalk';
import Mocha, { Context, MochaOptions } from 'mocha';
import { Key } from 'selenium-webdriver';
import { Config, Images, Options, BrowserConfig, TestMessage, isImageError } from '../../types';
import { subscribeOn, emitTestMessage, emitWorkerMessage } from '../messages';
import chaiImage from './chai-image';
import { getBrowser, switchStory, updateStorybookGlobals } from '../selenium';
import { CreeveyReporter, TeamcityReporter } from './reporter';
import { addTestsFromStories } from './helpers';
import { storiesProviderFactory } from '../storiesProviders/storiesProviderFactory';

const statAsync = promisify(fs.stat);
const readdirAsync = promisify(fs.readdir);
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);

async function getStat(filePath: string): Promise<Stats | null> {
  try {
    return await statAsync(filePath);
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function getLastImageNumber(imageDir: string, imageName: string): Promise<number> {
  const actualImagesRegexp = new RegExp(`${imageName}-actual-(\\d+)\\.png`);

  try {
    return (
      (await readdirAsync(imageDir))
        .map((filename) => filename.replace(actualImagesRegexp, '$1'))
        .map(Number)
        .filter((x) => !isNaN(x))
        .sort((a, b) => b - a)[0] ?? 0
    );
  } catch (_error) {
    return 0;
  }
}

// FIXME browser options hotfix
export default async function worker(config: Config, options: Options & { browser: string }): Promise<void> {
  let retries = 0;
  let images: Partial<{ [name: string]: Images }> = {};
  let error: string | undefined = undefined;
  const testScope: string[] = [];

  function runHandler(failures: number): void {
    if (failures > 0 && (error || Object.values(images).some((image) => image?.error != null))) {
      const isTimeout = hasTimeout(error) || Object.values(images).some((image) => hasTimeout(image?.error));
      const payload: { status: 'failed'; images: typeof images; error?: string } = {
        status: 'failed',
        images,
        error,
      };
      isTimeout
        ? emitWorkerMessage({ type: 'error', payload: { error: error ?? 'Unknown error' } })
        : emitTestMessage({ type: 'end', payload });
    } else {
      emitTestMessage({ type: 'end', payload: { status: 'success', images } });
    }
  }

  async function saveImages(imageDir: string, images: { name: string; data: Buffer }[]): Promise<void> {
    await mkdirAsync(imageDir, { recursive: true });
    for (const { name, data } of images) {
      await writeFileAsync(path.join(imageDir, name), data);
    }
  }

  async function getExpected(
    assertImageName?: string,
  ): Promise<
    | { expected: Buffer | null; onCompare: (actual: Buffer, expect?: Buffer, diff?: Buffer) => Promise<void> }
    | Buffer
    | null
  > {
    // context => [kind, story, test, browser]
    // rootSuite -> kindSuite -> storyTest -> [browsers.png]
    // rootSuite -> kindSuite -> storySuite -> test -> [browsers.png]
    const testPath = [...testScope];
    const imageName = assertImageName ?? (testPath.pop() as string);

    const imagesMeta: { name: string; data: Buffer }[] = [];
    const reportImageDir = path.join(config.reportDir, ...testPath);
    const imageNumber = (await getLastImageNumber(reportImageDir, imageName)) + 1;
    const actualImageName = `${imageName}-actual-${imageNumber}.png`;
    const image = (images[imageName] = images[imageName] ?? { actual: actualImageName });
    const onCompare = async (actual: Buffer, expect?: Buffer, diff?: Buffer): Promise<void> => {
      imagesMeta.push({ name: image.actual, data: actual });

      if (diff && expect) {
        image.expect = `${imageName}-expect-${imageNumber}.png`;
        image.diff = `${imageName}-diff-${imageNumber}.png`;
        imagesMeta.push({ name: image.expect, data: expect });
        imagesMeta.push({ name: image.diff, data: diff });
      }
      if (options.saveReport) {
        await saveImages(reportImageDir, imagesMeta);
      }
    };

    const expectImageDir = path.join(config.screenDir, ...testPath);
    const expectImageStat = await getStat(path.join(expectImageDir, `${imageName}.png`));
    if (!expectImageStat) return { expected: null, onCompare };

    const expected = await readFileAsync(path.join(expectImageDir, `${imageName}.png`));

    return { expected, onCompare };
  }

  const mochaOptions: MochaOptions = {
    timeout: 30000,
    reporter: process.env.TEAMCITY_VERSION ? TeamcityReporter : options.reporter || CreeveyReporter,
    reporterOptions: {
      reportDir: config.reportDir,
      topLevelSuite: options.browser,
      willRetry: () => retries < config.maxRetries,
      images: () => images,
    },
  };
  const mocha = new Mocha(mochaOptions);
  // @ts-expect-error: @types/mocha has out-dated types
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  mocha.cleanReferencesAfterRun(false);

  chai.use(chaiImage(getExpected, config.diffOptions));

  const provider = storiesProviderFactory({ config });

  await addTestsFromStories(mocha.suite, provider, {
    browser: options.browser,
    watch: options.ui,
  });

  const browserConfig = config.browsers[options.browser] as BrowserConfig;
  const browser = await getBrowser(config, browserConfig);

  if (browser == null) return;

  const interval = setInterval(
    () =>
      void browser.getCurrentUrl().then((url) => {
        if (options.debug)
          console.log(chalk`[{blue WORKER}{grey :${options.browser}:${process.pid}}] {grey current url} ${url}`);
      }),
    10 * 1000,
  );

  subscribeOn('shutdown', () => clearInterval(interval));

  if (browserConfig.storybookGlobals) {
    await updateStorybookGlobals(browser, browserConfig.storybookGlobals);
  }

  mocha.suite.beforeAll(function (this: Context) {
    this.config = config;
    this.browser = browser;
    this.keys = Key;
    this.expect = chai.expect;
    this.browserName = options.browser;
    this.testScope = testScope;
  });
  mocha.suite.beforeEach(switchStory);

  subscribeOn('test', (message: TestMessage) => {
    if (message.type != 'start') return;

    const test = message.payload;
    const testPath = test.path.join(' ').replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&');

    images = {};
    error = undefined;
    retries = test.retries;

    mocha.grep(new RegExp(`^${testPath}$`));
    const runner = mocha.run(runHandler);

    // TODO How handle browser corruption?
    runner.on('fail', (_test, reason: unknown) => {
      if (!(reason instanceof Error)) {
        error = reason as string;
      } else if (!isImageError(reason)) {
        error = reason.stack ?? reason.message;
      } else if (typeof reason.images == 'string') {
        const image = images[testScope.slice(-1)[0]];
        if (image) image.error = reason.images;
      } else {
        const imageErrors = reason.images;
        Object.keys(imageErrors).forEach((imageName) => {
          const image = images[imageName];
          if (image) image.error = imageErrors[imageName];
        });
      }
    });
  });

  console.log('[CreeveyWorker]:', `Ready ${options.browser}:${process.pid}`);

  emitWorkerMessage({ type: 'ready' });
}

function hasTimeout(str: string | null | undefined): boolean {
  return str != null && str.toLowerCase().includes('timeout');
}
