const fs = require('fs');
const path = require('path');

const handleDownloadReport = (ALLURE_REPORTS_DIR) => {
  return (req, res) => {
    const folderName = req.params.folder;
    const indexPath = path.join(ALLURE_REPORTS_DIR, folderName, 'index.html');

    // Check if the index.html file exists
    fs.access(indexPath, fs.constants.F_OK, (err) => {
      if (err) {
        return res.status(404).send('Report index.html not found');
      }

      // Set headers for file download
      res.setHeader('Content-Disposition', `attachment; filename="${folderName}-report.html"`);
      res.setHeader('Content-Type', 'text/html');

      // Stream the file
      const fileStream = fs.createReadStream(indexPath);
      fileStream.pipe(res);
    });
  };
};

module.exports = {
  handleDownloadReport
};