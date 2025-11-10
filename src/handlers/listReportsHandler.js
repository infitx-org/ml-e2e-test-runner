const fs = require('fs');
const path = require('path');
const { constructHtml } = require('../lib/utils');

// Helper function to get index.html file size
const getIndexFileSize = async (folderPath) => {
  try {
    const indexPath = path.join(folderPath, 'index.html');
    const stats = await fs.promises.stat(indexPath);
    return stats.size;
  } catch (error) {
    // If index.html doesn't exist, return 0
    return 0;
  }
};

// Helper function to format bytes
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const handleListReports = (ALLURE_REPORTS_DIR) => {
  return (req, res) => {
    fs.readdir(ALLURE_REPORTS_DIR, { withFileTypes: true }, (err, files) => {
      if (err) {
        return res.status(500).send("Error reading directory");
      }

      // Filter only directories and get their stats
      const folders = files.filter(file => file.isDirectory());
      
      // Get folder stats with creation dates and sizes
      Promise.all(
        folders.map(async (folder) => {
          try {
            const folderPath = path.join(ALLURE_REPORTS_DIR, folder.name);
            const stats = await fs.promises.stat(folderPath);
            const folderSize = await getIndexFileSize(folderPath);
            return {
              name: folder.name,
              createdAt: stats.birthtime || stats.mtime,
              size: folderSize
            };
          } catch (error) {
            return {
              name: folder.name,
              createdAt: null,
              size: 0
            };
          }
        })
      ).then(foldersWithDates => {
        // Sort by creation date (newest first)
        foldersWithDates.sort((a, b) => {
          if (!a.createdAt) return 1;
          if (!b.createdAt) return -1;
          return new Date(b.createdAt) - new Date(a.createdAt);
        });

        // Generate table content
        const tableContent = generateReportsTable(foldersWithDates);
        const html = constructHtml(tableContent);

        res.send(html);
      }).catch(error => {
        console.error('Error getting folder stats:', error);
        res.status(500).send("Error processing directories");
      });
    });
  };
};


const generateReportsTable = (folders) => {
  if (!folders || folders.length === 0) {
    return `
      <div class="reports-container">
        <h2 class="reports-title">Test Reports</h2>
        <div class="empty-state">
          <p>No reports available</p>
        </div>
      </div>
    `;
  }

  const tableRows = folders.map(folderInfo => {
    // Use actual folder creation date
    const formattedDate = folderInfo.createdAt ? 
      new Date(folderInfo.createdAt).toLocaleString() : 'N/A';
    const formattedSize = formatBytes(folderInfo.size);

    return `
      <tr class="report-row">
        <td class="report-name">
          ${folderInfo.name}
        </td>
        <td class="report-date">${formattedDate}</td>
        <td class="report-size">${formattedSize}</td>
        <td class="report-actions">
          <a href="/reports/${folderInfo.name}" target="_blank" class="btn btn-primary">
            View Report
          </a>
          <a href="/download/${folderInfo.name}" class="btn btn-secondary">
            Download
          </a>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="reports-container">
      <h2 class="reports-title">Test Reports</h2>
      <div class="table-wrapper">
        <table class="reports-table">
          <thead>
            <tr>
              <th>Report Name</th>
              <th>Generated</th>
              <th>Size</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    </div>

    <style>
      .reports-container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px;
      }

      .reports-title {
        color: #fff;
        margin-bottom: 30px;
        font-size: 2rem;
        font-weight: 600;
        text-align: center;
      }

      .table-wrapper {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.1);
      }

      .reports-table {
        width: 100%;
        border-collapse: collapse;
        background: transparent;
      }

      .reports-table th {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        padding: 15px 20px;
        text-align: left;
        font-weight: 600;
        border-bottom: 2px solid rgba(255, 255, 255, 0.2);
        font-size: 0.95rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .reports-table th:first-child {
        border-radius: 8px 0 0 0;
      }

      .reports-table th:last-child {
        border-radius: 0 8px 0 0;
      }

      .report-row {
        transition: all 0.2s ease;
      }

      .report-row:hover {
        background: rgba(255, 255, 255, 0.05);
        transform: translateY(-1px);
      }

      .reports-table td {
        padding: 15px 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        color: #e0e0e0;
      }

      .report-name {
        font-weight: 500;
        font-size: 1rem;
      }

      .report-link {
        color: #4fc3f7;
        text-decoration: none;
        transition: color 0.2s ease;
        font-weight: 500;
      }

      .report-link:hover {
        color: #29b6f6;
        text-decoration: underline;
      }

      .report-date {
        color: #bbb;
        font-size: 0.9rem;
      }

      .report-size {
        color: #bbb;
        font-size: 0.9rem;
        text-align: right;
        font-family: monospace;
      }

      .report-actions {
        text-align: center;
      }

      .btn {
        display: inline-block;
        padding: 8px 16px;
        border-radius: 6px;
        text-decoration: none;
        font-weight: 500;
        font-size: 0.9rem;
        transition: all 0.2s ease;
        border: none;
        cursor: pointer;
      }

      .btn-primary {
        background: linear-gradient(135deg, #4fc3f7 0%, #29b6f6 100%);
        color: white;
        box-shadow: 0 2px 8px rgba(79, 195, 247, 0.3);
      }

      .btn-primary:hover {
        background: linear-gradient(135deg, #29b6f6 0%, #1e88e5 100%);
        box-shadow: 0 4px 12px rgba(79, 195, 247, 0.4);
        transform: translateY(-1px);
      }

      .btn-secondary {
        background: linear-gradient(135deg, #66bb6a 0%, #4caf50 100%);
        color: white;
        box-shadow: 0 2px 8px rgba(102, 187, 106, 0.3);
        margin-left: 8px;
      }

      .btn-secondary:hover {
        background: linear-gradient(135deg, #4caf50 0%, #388e3c 100%);
        box-shadow: 0 4px 12px rgba(102, 187, 106, 0.4);
        transform: translateY(-1px);
      }

      .empty-state {
        text-align: center;
        padding: 60px 20px;
        color: #999;
      }

      .empty-state p {
        font-size: 1.2rem;
        margin: 0;
      }

      /* Responsive design */
      @media (max-width: 768px) {
        .reports-container {
          padding: 15px;
        }

        .table-wrapper {
          padding: 15px;
          overflow-x: auto;
        }

        .reports-table {
          min-width: 600px;
        }

        .reports-title {
          font-size: 1.5rem;
          margin-bottom: 20px;
        }

        .reports-table th,
        .reports-table td {
          padding: 12px 15px;
        }
      }
    </style>
  `;
};

module.exports = {
  handleListReports
};