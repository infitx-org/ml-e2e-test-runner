const { Worker } = require('bullmq');
const AllureReportGenerator = require("../lib/allureReportGenerator");
const { SlackReporter } = require('../lib/slackReporter.js');

function setupReportGenerationProcessor(queueName, redisOptions) {
  new Worker(
    queueName,
    async (job) => {
      const reportURL = `${job.data.reportsLinkBaseURL}/${job.data.reportName}`
      await job.log(`Generating Allure results for each TTK report file..`);
      const fileCount = job.data.ttkReports.length;

      job.data.ttkReports.forEach((ttkReport, index) => {
        const purge = index == 0;
        const reportGenerator = new AllureReportGenerator({ ttkReportFile: ttkReport.reportFilePath, suiteName: ttkReport.suiteName, purge, resultsDir: job.data.resultsDir, testRunName: job.data.testRunName });
        reportGenerator.generateAllureResults();
        job.updateProgress(100 * (index + 1) / fileCount);
      });

      await job.log(`Generating the combined Allure report..`);
      try {
        await (new AllureReportGenerator({ reportDir: `${job.data.reportsDir}/${job.data.reportName}`, resultsDir: job.data.resultsDir, testRunName: job.data.testRunName })).generateAllureReport();
        await job.log(`Generated report successfully`);
        const slackReporter = new SlackReporter({
          slackWebhookUrl: job.data.slackWebhookUrl,
          slackWebhookUrlForFailed: job.data.slackWebhookUrlForFailed,
          allureResultsPath: job.data.resultsDir,
          showDetails: false,
          slackWebhookDescription: job.data.slackWebhookDescription,
          testRunName: job.data.testRunName,
          releaseCdUrl: job.data.releaseCdUrl,
        });
        const slackReporterLogs = await slackReporter.sendSlackNotification(reportURL);
        slackReporterLogs.forEach(async log => {
          await job.log(log);
        });
        // job.updateProgress(100);
      } catch (error) {
        await job.log(`Failed to generate the report, ${error.message}`);
        throw new Error(`Failed to generate the report, ${error.message}`);
      }

      return { reportURL };
    },
    { connection: redisOptions, concurrency: 1 }
  );
}

module.exports = {
    setupReportGenerationProcessor
};