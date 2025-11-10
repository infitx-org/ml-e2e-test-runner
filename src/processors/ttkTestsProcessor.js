const { Worker } = require('bullmq');
const { spawn } = require('node:child_process');
const fs = require('node:fs');

function calculateProgress(line) {
    const match = line.match(/\[\s*(\d+)\s+passed.*?(\d+)\s+skipped.*?(\d+)\s+failed.*?(\d+)\s*\]/i);

    if (match) {
        const passed = parseInt(match[1], 10);
        const skipped = parseInt(match[2], 10);
        const failed = parseInt(match[3], 10);
        const total = parseInt(match[4], 10);

        const completed = passed + skipped + failed;
        const percentage = ((completed / total) * 100).toFixed(0);
        return percentage;
    }

    return null;
}

function setupTtkTestsProcessor(queueName, redisOptions, concurrency = 10) {
  new Worker(
    queueName,
    async (job) => {
      return new Promise((resolve, reject) => {
        // Create reportsDir if it doesn't exist
        const reportsDir = job.data.reportsDir;
        if (!fs.existsSync(reportsDir)) {
          fs.mkdirSync(reportsDir, { recursive: true });
        }
        const ls = spawn('./node_modules/.bin/ml-ttk-cli', [
          '-i', job.data.testCollection,
          '-e', job.data.envFilePath,
          '-u', `http://${job.data.ttkBackendHost}:5050`,
          '--report-format', 'json',
          '--save-report', 'false',
          '--report-target', `file://${job.data.reportFilePath}`,
          '--save-report-base-url', `https://reports.somedomain.com/${job.data.reportFilePrefix}`
        ]);

        ls.stdout.on('data', async (data) => {
          const stripAnsi = (await import('strip-ansi')).default;
          const line = stripAnsi(data.toString());
          await job.log(line);
          const progress = calculateProgress(line)
          if (progress !== null) {
            job.updateProgress(+progress);
          }
        });

        ls.stderr.on('data', async (data) => {
          await job.log(`Error: ${data}`);
        });

        ls.on('close', (code) => {
          console.log(`child process exited with code ${code}`);
          // job.updateProgress(100);
          if (code === 0) {
            resolve({ status: 'completed' });
          } else {
            reject(new Error(`Process exited with code ${code}`));
          }
        });
      });
    },
    { connection: redisOptions, concurrency }
  );
}

module.exports = {
    setupTtkTestsProcessor
};
