const { Command } = require("commander");
const AllureReportGenerator = require("./lib/allureReportGenerator");

const program = new Command();

program
    .version("0.0.1")
    .description("Generate Allure reports from TTK report JSON files")
    .option("-f, --files <files...>", "List of TTK report JSON files")
    .option("-o, --output <directory>", "Output directory for the Allure report", "allure-report")
    .parse(process.argv);

const options = program.opts();

if (!options.files || options.files.length === 0) {
    console.error("No TTK report JSON files specified.");
    process.exit(1);
}

// Generate Allure results for each TTK report file
options.files.forEach((file, index) => {
    const purge = index == 0;
    const reportGenerator = new AllureReportGenerator({ ttkReportFile: file, purge });
    reportGenerator.generateAllureResults();
});

// Generate the combined Allure report
new AllureReportGenerator({ reportDir: options.output }).generateAllureReport();

