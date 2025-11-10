const AWS = require('aws-sdk')
const path = require('path');
const fs = require('fs')

module.exports = async function s3upload({config, bucket}, reportPath, logs) {
    const s3 = new AWS.S3({ apiVersion: '2012-10-17', ...(config || {}) })
    try {
      const { Location } = await s3.upload({
        Bucket: bucket,
        Key: `comesa-tests/${path.basename(path.dirname(reportPath))}`,
        Body: fs.createReadStream(reportPath),
        ContentType: 'text/html'
      }).promise();
      logs.push(`Uploaded report to S3 successfully: ${Location}`);
      return Location;
    } catch (err) {
      console.error('S3 upload failed', err);
      throw new Error(`S3 upload failed: ${err.message}`);
    }
}
