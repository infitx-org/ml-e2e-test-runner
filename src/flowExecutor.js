const { Queue: QueueMQ, FlowProducer, WaitingChildrenError, QueueEvents } = require('bullmq');
const Config = require('./lib/config');
const { setupReportGenerationProcessor } = require('./processors/reportGenerationProcessor');
const { setupTtkTestsProcessor } = require('./processors/ttkTestsProcessor');
const { Worker } = require('bullmq');

const MULTI_SCHEME_TESTS_QUEUE = 'Multi Scheme Tests';
const PER_SCHEME_TESTS_QUEUE = 'Per Scheme Tests';
const STATIC_TESTS_QUEUE = 'Static Tests';
const REPORT_GENERATION_QUEUE = '>> Report Generation';
const WAIT_QUEUE = 'Wait';

const TTK_REPORTS_DIR = './reports/ttk_reports';
const ALLURE_REPORTS_DIR = './reports/allure_reports';
const ALLURE_RESULTS_DIR = './reports/allure_results';
const ENV_DIR = './ttk-environments';

const WaitProcessorStep = {
  Start: 'Start',
  perSchemeTests: 'perSchemeTests',
  multiSchemeTests: 'multiSchemeTests',
  Finish: 'Finish',
};

const perSchemeTestJobs = Config.getPerSchemeTestConfig().map((config) => ({
  name: `${config.sourceDfspId}`,
  data: {
    testCollection: 'ttk-test-collection/per-scheme-tests',
    ttkBackendHost: Config.getTestConfig().ttkBackendHost,
    envFilePath: `${ENV_DIR}/${config.ttkEnvFile}`,
    reportFilePrefix: `${config.sourceDfspId}`,
    reportFilePath: `${TTK_REPORTS_DIR}/${config.sourceDfspId}-report.json`,
    reportsDir: `${TTK_REPORTS_DIR}`,
    ...config
  },
  queueName: PER_SCHEME_TESTS_QUEUE,
  opts: {
    ignoreDependencyOnFailure: true,
  }
}));

const multiSchemeTestJobs = Config.getMultiSchemeTestConfig().map((config) => ({
  name: `${config.sourceDfspId} to ${config.targetDfspId}`,
  data: {
    testCollection: 'ttk-test-collection/multi-scheme-tests',
    ttkBackendHost: Config.getTestConfig().ttkBackendHost,
    envFilePath: `${ENV_DIR}/${config.ttkEnvFile}`,
    reportFilePrefix: `${config.sourceDfspId}-${config.targetDfspId}`,
    reportFilePath: `${TTK_REPORTS_DIR}/${config.sourceDfspId}-${config.targetDfspId}-report.json`,
    reportsDir: `${TTK_REPORTS_DIR}`,
    ...config
  },
  queueName: MULTI_SCHEME_TESTS_QUEUE,
  opts: {
    ignoreDependencyOnFailure: true,
  }
}));

class FlowExecutor {

  constructor () {
    this.redisOptions = Config.getRedisOptions();

    this.flowProducer = new FlowProducer({ connection: this.redisOptions });
    this.topQueueName = REPORT_GENERATION_QUEUE;
    this.multiSchemeTestsQueueName = MULTI_SCHEME_TESTS_QUEUE;
    this.perSchemeTestsQueueName = PER_SCHEME_TESTS_QUEUE;
    this.staticTestsQueueName = STATIC_TESTS_QUEUE;
    this.waitQueueName = WAIT_QUEUE;

    this.reportGenerationBullMq = this._createQueueMQ(this.topQueueName);
    this.multiSchemeTestsBullMq = this._createQueueMQ(this.multiSchemeTestsQueueName);
    this.perSchemeTestsBullMq = this._createQueueMQ(this.perSchemeTestsQueueName);
    this.staticTestsBullMq = this._createQueueMQ(this.staticTestsQueueName);
    this.waitBullMq = this._createQueueMQ(this.waitQueueName);

  }

  _createQueueMQ = (name) => new QueueMQ(name, { connection: this.redisOptions });

  async setupWorkers () {
    const { multiSchemeConcurrency, perSchemeConcurrency, staticConcurrency } = Config.getTestConfig();
    await setupTtkTestsProcessor(this.multiSchemeTestsQueueName, this.redisOptions, multiSchemeConcurrency);
    await setupTtkTestsProcessor(this.perSchemeTestsQueueName, this.redisOptions, perSchemeConcurrency);
    await setupTtkTestsProcessor(this.staticTestsQueueName, this.redisOptions, staticConcurrency);
    await setupReportGenerationProcessor(this.topQueueName, this.redisOptions);
    await this._setupWaitProcessor(this.waitQueueName, this.redisOptions);
  }

  _setupWaitProcessor(queueName) {
    new Worker(
      queueName,
      async (job, token) => {
        let step = job.data.step;
        while (step !== WaitProcessorStep.Finish) {
          switch (step) {
            case WaitProcessorStep.Start: {
              console.log('Transitioning to perSchemeTests');
              await this.perSchemeTestsBullMq.addBulk(perSchemeTestJobs.map((child) => {
                child.opts.parent = {
                  id: job.id,
                  queue: job.queueQualifiedName,
                };
                return child;
              }));
              await job.updateData({
                step: WaitProcessorStep.perSchemeTests,
              });
              step = WaitProcessorStep.perSchemeTests;
              await job.moveToWaitingChildren(token);
              throw new WaitingChildrenError();
            }
            case WaitProcessorStep.perSchemeTests: {
              console.log('Transitioning to multiSchemeTests');
              await this.multiSchemeTestsBullMq.addBulk(multiSchemeTestJobs.map((child) => {
                child.opts.parent = {
                  id: job.id,
                  queue: job.queueQualifiedName,
                };
                return child;
              }));
              await job.updateData({
                step: WaitProcessorStep.multiSchemeTests,
              });
              step = WaitProcessorStep.multiSchemeTests;
              await job.moveToWaitingChildren(token);
              throw new WaitingChildrenError();
            }
            case WaitProcessorStep.multiSchemeTests: {
              await job.updateData({
                step: WaitProcessorStep.Finish,
              });
              step = WaitProcessorStep.Finish;
              return WaitProcessorStep.Finish;
            }
            default: {
              throw new Error('invalid step');
            }
          }
        }
      },
      { connection: this.redisOptions, concurrency: 1 }
    );
  }

  async startTestRun() {
    const activeCount4 = await this.staticTestsBullMq.getActiveCount()
    const activeCount3 = await this.perSchemeTestsBullMq.getActiveCount()
    const activeCount2 = await this.multiSchemeTestsBullMq.getActiveCount()
    const activeCount1 = await this.reportGenerationBullMq.getActiveCount()
    if (activeCount1 > 0 || activeCount2 > 0 || activeCount3 > 0 || activeCount4 > 0) {
      throw new Error('There are active jobs. Please wait for them to finish.');
    } else {
      // // Clear existing jobs

      await this.waitBullMq.drain();
      await this.waitBullMq.clean(0, 1000, 'completed');
      await this.waitBullMq.clean(0, 1000, 'failed');
      await this.waitBullMq.clean(0, 1000, 'active');
      await this.waitBullMq.clean(0, 1000, 'waiting');
      await this.waitBullMq.clean(0, 1000, 'waiting-children');

      await this.staticTestsBullMq.drain();
      await this.staticTestsBullMq.clean(0, 1000, 'completed');
      await this.staticTestsBullMq.clean(0, 1000, 'failed');
      await this.staticTestsBullMq.clean(0, 1000, 'active');
      await this.staticTestsBullMq.clean(0, 1000, 'waiting');
      await this.staticTestsBullMq.clean(0, 1000, 'waiting-children');

      await this.perSchemeTestsBullMq.drain();
      await this.perSchemeTestsBullMq.clean(0, 1000, 'completed');
      await this.perSchemeTestsBullMq.clean(0, 1000, 'failed');
      await this.perSchemeTestsBullMq.clean(0, 1000, 'active');
      await this.perSchemeTestsBullMq.clean(0, 1000, 'waiting');
      await this.perSchemeTestsBullMq.clean(0, 1000, 'waiting-children');

      await this.multiSchemeTestsBullMq.drain();
      await this.multiSchemeTestsBullMq.clean(0, 1000, 'completed');
      await this.multiSchemeTestsBullMq.clean(0, 1000, 'failed');
      await this.multiSchemeTestsBullMq.clean(0, 1000, 'active');
      await this.multiSchemeTestsBullMq.clean(0, 1000, 'waiting');
      await this.multiSchemeTestsBullMq.clean(0, 1000, 'waiting-children');

      await this.reportGenerationBullMq.drain();
      await this.reportGenerationBullMq.clean(0, 1000, 'completed');
      await this.reportGenerationBullMq.clean(0, 1000, 'failed');
      await this.reportGenerationBullMq.clean(0, 1000, 'active');
      await this.reportGenerationBullMq.clean(0, 1000, 'waiting');
      await this.reportGenerationBullMq.clean(0, 1000, 'waiting-children');

      const combinedReportName = new Date().toISOString().replace(/[:.]/g, '-');
      const originalTree = await this.flowProducer.add({
        name: 'Generate Report',
        queueName: this.topQueueName,
        data: {
          ttkReports: [
            ...Config.getPerSchemeTestConfig().map((config) => ({
              reportFilePath: `${TTK_REPORTS_DIR}/${config.sourceDfspId}-report.json`,
              suiteName: `Per Scheme ${config.sourceDfspId}`,
            })),
            ...Config.getMultiSchemeTestConfig().map((config) => ({
              reportFilePath: `${TTK_REPORTS_DIR}/${config.sourceDfspId}-${config.targetDfspId}-report.json`,
              suiteName: `Multi Scheme ${config.sourceDfspId} to ${config.targetDfspId}`,
            })),
          ],
          reportName: combinedReportName,
          reportsDir: ALLURE_REPORTS_DIR,
          resultsDir: ALLURE_RESULTS_DIR,
          reportsLinkBaseURL: Config.getTestConfig().reportsLinkBaseURL || '/reports',
          slackWebhookUrl: Config.getTestConfig().slackWebhookUrl,
          slackWebhookUrlForFailed: Config.getTestConfig().slackWebhookUrlForFailed,
          slackWebhookDescription: Config.getTestConfig().slackWebhookDescription,
          testRunName: Config.getTestConfig().testRunName,
          releaseCdUrl: process.env.RELEASE_CD_URL,
          s3: Config.getTestConfig().s3,
        },
        children: [{
          name: `Wait Queue`,
          data: {
            step: WaitProcessorStep.Start,
          },
          queueName: WAIT_QUEUE,
          opts: {
            ignoreDependencyOnFailure: true,
          }
        }],
      });
      return originalTree;
    }
  }

  onTestExecutionLog (logFn) {
    const perSchemeQueueEvents = new QueueEvents(this.perSchemeTestsQueueName, { connection: this.redisOptions });
    perSchemeQueueEvents.on('progress', async ({ jobId, data }) => {
      // const { logs, count } = await this.perSchemeTestsBullMq.getJobLogs(jobId);
      // logFn(logs);
      const jobInfo = await this.perSchemeTestsBullMq.getJob(jobId);
      const jobDescription = `${jobInfo.queue.name} -> ${jobInfo.name}`;
      logFn(`${jobDescription}: ${data}%`);
    });
    perSchemeQueueEvents.on('completed', async ({ jobId }) => {
      logFn(await getJobLogs(this.perSchemeTestsBullMq, jobId));
    });
    perSchemeQueueEvents.on('failed', async ({ jobId }) => {
      logFn(await getJobLogs(this.perSchemeTestsBullMq, jobId));
    });

    const multiSchemeQueueEvents = new QueueEvents(this.multiSchemeTestsQueueName, { connection: this.redisOptions });
    multiSchemeQueueEvents.on('progress', async ({ jobId, data }) => {
      const jobInfo = await this.multiSchemeTestsBullMq.getJob(jobId);
      const jobDescription = `${jobInfo.queue.name} -> ${jobInfo.name}`;
      logFn(`${jobDescription}: ${data}%`);
    });
    multiSchemeQueueEvents.on('completed', async ({ jobId }) => {
      logFn(await getJobLogs(this.multiSchemeTestsBullMq, jobId));
    });
    multiSchemeQueueEvents.on('failed', async ({ jobId }) => {
      logFn(await getJobLogs(this.multiSchemeTestsBullMq, jobId));
    });

    const staticQueueEvents = new QueueEvents(this.staticTestsQueueName, { connection: this.redisOptions });
    staticQueueEvents.on('progress', async ({ jobId, data }) => {
      const jobInfo = await this.staticTestsBullMq.getJob(jobId);
      const jobDescription = `${jobInfo.queue.name} -> ${jobInfo.name}`;
      logFn(`${jobDescription}: ${data}%`);
    });
    staticQueueEvents.on('completed', async ({ jobId }) => {
      logFn(await getJobLogs(this.staticTestsBullMq, jobId));
    });
    staticQueueEvents.on('failed', async ({ jobId }) => {
      logFn(await getJobLogs(this.staticTestsBullMq, jobId));
    });
  }


}

getLogStringFromArray = (logArray) => {
  return logArray.join('\n');
}

getJobLogs = async (queue, jobId) => {
  const jobInfo = await queue.getJob(jobId);
  const jobDescription = `${jobInfo.queue.name} -> ${jobInfo.name}`;
  const { logs } = await queue.getJobLogs(jobId);
  return `-------------------- START OF LOG: ${jobDescription} --------------------\n` +
    getLogStringFromArray(logs) +
    `-------------------- END OF LOG: ${jobDescription} --------------------\n`;
}



module.exports = {
  FlowExecutor
}
