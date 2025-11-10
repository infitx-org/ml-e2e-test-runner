const { FlowExecutor } = require('./flowExecutor');
const { QueueEvents } = require('bullmq');

const run = async () => {

  const flowExecutor = new FlowExecutor();

  const workerCount = await flowExecutor.waitBullMq.getWorkersCount();

  if(workerCount === 0) {
    console.error('No worker found. Make sure to start the service before running the test.');
    process.exit(1);
  }

  try {
    await flowExecutor.startTestRun();
  } catch (e) {
    console.error(e);
  }

  const topQueueEvents = new QueueEvents(flowExecutor.topQueueName, { connection: flowExecutor.redisOptions });

  topQueueEvents.on('completed', ({returnvalue}) => {
    console.log(returnvalue);
    process.exit(0);
  });

  topQueueEvents.on('failed', () => {
    process.exit(1);
  });

  flowExecutor.onTestExecutionLog((logLine) => {
    console.log(logLine);
  });

};

// eslint-disable-next-line no-console
run().catch((e) => console.error(e));
