const { IncomingWebhook } = require('@slack/webhook');
const fs = require('fs');
const path = require('path');
const releaseCd = require('./release-cd');

// TODO: Need to adjust the following values dynamically
const categoryMap = {
    "Per Scheme": "Per Scheme Tests",
    "Multi Scheme": "Multi Scheme Tests",
    "Static": "Static Tests"
};

class SlackReporter {

  constructor (config) {
    if (config.slackWebhookUrl) {
      this.webhook = new IncomingWebhook(config.slackWebhookUrl);
    }
    if (config.slackWebhookUrlForFailed) {
      this.webhookForFailed = new IncomingWebhook(config.slackWebhookUrlForFailed);
    }
    this.allureResultsPath = config.allureResultsPath || './reports/allure_results';
    this.showDetails = config.showDetails || false;
    this.slackWebhookDescription = config.slackWebhookDescription || '';
    this.testRunName = config.testRunName || 'E2E Test';
    this.releaseCdUrl = config.releaseCdUrl;
  }

  generateCombinedReport = async (reportURL, logs) => {
    const blocks = [];

    const results = {};
    let totalPassed = 0;
    let totalTests = 0;


    // function countStepsRecursive(steps) {
    //     let total = 0, passed = 0;

    //     function traverse(steps) {
    //         steps.forEach(step => {
    //             total++;
    //             if (step.status === "passed") passed++;
    //             if (step.steps) traverse(step.steps);
    //         });
    //     }

    //     traverse(steps);
    //     return { passed, total };
    // }

    // function countSteps(steps) {
    //     let total = 0, passed = 0;

    //     steps.forEach(step => {
    //         total++;
    //         if (step.status === "passed") passed++;
    //     });

    //     return { passed, total };
    // }

    fs.readdirSync(this.allureResultsPath).forEach(file => {
        if (path.extname(file) === '.json') {
            const filePath = path.join(this.allureResultsPath, file);
            const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

            const suite = content.labels.find(label => label.name === "parentSuite")?.value || "Uncategorized";
            let category = "Uncategorized";

            let suiteName = '';
            for (const key in categoryMap) {
                if (suite.startsWith(key)) {
                    category = categoryMap[key];
                    suiteName = suite.replace(key, '').trim();
                    break;
                }
            }

            const testName = content.name;
            const testStatus = content.status;

            // We don't want to count assertion failures, just the test cases
            // So commenting the next line
            // const { passed, total } = countSteps(content.steps);

            const passed = testStatus === "passed" ? 1 : 0;
            const total = 1;

            totalPassed += passed;
            totalTests += total;
            const responseCode = `${passed}/${total}`;

            if (!results[category]) {
                results[category] = {};
            }
            if (!results[category][suiteName]) {
                results[category][suiteName] = [];
            }
            results[category][suiteName].push({ testName, testStatus, responseCode });
        }
    });

    await releaseCd({
      url: this.releaseCdUrl,
      totalPassedAssertions: totalPassed,
      totalAssertions: totalTests
    }, logs);

    Object.keys(results).sort().forEach(category => {
      if (this.showDetails) {
        blocks.push({
            type: "section",
            text: { type: "mrkdwn", text: `*${category}*` }
        });
        Object.keys(results[category]).sort().forEach(suiteName => {
            const suiteStatus = results[category][suiteName].every(test => test.testStatus === "passed");
            const suiteStatusEmoji = suiteStatus ? ":white_check_mark:" : ":warning:";
            blocks.push({
              type: "context",
              elements: [{ type: "mrkdwn", text: `${suiteStatusEmoji} ${suiteName}` }]
            });

            results[category][suiteName].forEach(({ testName, testStatus, responseCode }) => {
                const testStatusEmoji = testStatus === "passed" ? ":white_check_mark:" : ":x:";
                blocks.push({
                    type: "context",
                    elements: [{ type: "mrkdwn", text: `-  ${testStatusEmoji} ${testName} \`${responseCode}\`` }]
                });
            });
        });
      } else {
        const elements = [];
        if (Object.keys(results[category]).length <= 8) {
          elements.push({ type: "mrkdwn", text: `*${category}*` });
          Object.keys(results[category]).sort().forEach(suiteName => {
              const suiteStatus = results[category][suiteName].every(test => test.testStatus === "passed");
              const suiteStatusEmoji = suiteStatus ? ":white_check_mark:" : ":warning:";
              elements.push({ type: "mrkdwn", text: `${suiteStatusEmoji} ${suiteName}` });
          });
        } else {
          // generate summary for large categories
          const totalSuites = Object.keys(results[category]).length;
          const totalPassedSuites = Object.keys(results[category]).filter(suiteName =>
            results[category][suiteName].every(test => test.testStatus === "passed")
          ).length;
          const suiteStatusEmoji = totalPassedSuites === totalSuites ? ":white_check_mark:" : ":warning:";
          elements.push({ type: "mrkdwn", text: `*${category}* ${suiteStatusEmoji} \`${totalPassedSuites}/${totalSuites}\`` });
        }
        blocks.push({
          type: "context",
          elements
        });
      }
    });

    blocks.push({ type: "divider" });

    const totalStatus = totalPassed === totalTests ? ":white_check_mark:" : ":warning:";
    // Append the following at the start of the blocks array
    blocks.unshift({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `${totalStatus} *${this.testRunName}:* ${this.slackWebhookDescription} \`${totalPassed}/${totalTests}\` <${reportURL}|View Report>`
            }
    });
    return {
      blocks,
      isPassed: totalPassed === totalTests
    };
  }

  sendSlackNotification = async (reportURL = 'http://localhost/') => {
    const logs = [];
    if (!this.webhook && !this.webhookForFailed) {
      logs.push('No Slack webhook URLs configured.')
      return logs;
    }
    const { blocks, isPassed } = await this.generateCombinedReport(reportURL, logs)
    // console.log(JSON.stringify(blocks,null,2))
    // process.exit(0)

    if (this.webhook) {
      try {
        await this.webhook.send({
          blocks
        })
        logs.push('Slack notification sent.')
      } catch (err) {
        logs.push(`ERROR: Sending Slack notification failed. ${err.message}`)
      }
    }

    if (this.webhookForFailed && !isPassed) {
      try {
        await this.webhookForFailed.send({
          blocks
        })
        logs.push('Slack failure notification sent.')
      } catch (err) {
        logs.push(`ERROR: Sending Slack failure notification failed. ${err.message}`)
      }
    }
    return logs;
  }

}

module.exports = {
  SlackReporter
}