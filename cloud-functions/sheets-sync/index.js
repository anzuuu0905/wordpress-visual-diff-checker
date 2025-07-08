const functions = require('@google-cloud/functions-framework');
const { google } = require('googleapis');

const SHEET_ID = process.env.SHEET_ID;

/**
 * Get authenticated Google Sheets client
 * @returns {Object} Authenticated Google Sheets API client
 */
async function getAuthClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.metadata.readonly'
    ]
  });
  return auth.getClient();
}

/**
 * Get or create worksheet for a site
 * @param {Object} sheets - Google Sheets API client
 * @param {string} siteId - Site identifier
 * @returns {number} Sheet ID of the worksheet
 */
async function getOrCreateWorksheet(sheets, siteId) {
  try {
    // Get spreadsheet metadata
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID
    });
    
    // Check if worksheet already exists
    const existingSheet = spreadsheet.data.sheets.find(
      sheet => sheet.properties.title === siteId
    );
    
    if (existingSheet) {
      return existingSheet.properties.sheetId;
    }
    
    // Create new worksheet
    const addSheetResponse = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      resource: {
        requests: [{
          addSheet: {
            properties: {
              title: siteId,
              gridProperties: {
                rowCount: 1000,
                columnCount: 10
              }
            }
          }
        }]
      }
    });
    
    const newSheetId = addSheetResponse.data.replies[0].addSheet.properties.sheetId;
    
    // Add header row
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${siteId}!A1:J1`,
      valueInputOption: 'RAW',
      resource: {
        values: [[
          'Date',
          'URL', 
          'Baseline',
          'After',
          'Diff',
          'Diff%',
          'Status',
          'Dimensions',
          'Error',
          'Timestamp'
        ]]
      }
    });
    
    // Format header row
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      resource: {
        requests: [{
          repeatCell: {
            range: {
              sheetId: newSheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: 10
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
                textFormat: { bold: true },
                horizontalAlignment: 'CENTER'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
          }
        }]
      }
    });
    
    console.log(`Created new worksheet: ${siteId}`);
    return newSheetId;
    
  } catch (error) {
    console.error(`Failed to get/create worksheet for ${siteId}:`, error);
    throw error;
  }
}

/**
 * Apply conditional formatting to highlight NG rows
 * @param {Object} sheets - Google Sheets API client
 * @param {number} sheetId - Sheet ID
 * @param {number} dataRowCount - Number of data rows
 */
async function applyConditionalFormatting(sheets, sheetId, dataRowCount) {
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      resource: {
        requests: [
          // Clear existing conditional formatting
          {
            deleteConditionalFormatRule: {
              sheetId: sheetId,
              index: 0
            }
          },
          // Add NG highlighting
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [{
                  sheetId: sheetId,
                  startRowIndex: 1,
                  endRowIndex: dataRowCount + 1,
                  startColumnIndex: 0,
                  endColumnIndex: 10
                }],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'NG' }]
                  },
                  format: {
                    backgroundColor: { red: 1, green: 0.8, blue: 0.8 },
                    textFormat: { bold: true }
                  }
                }
              }
            }
          },
          // Add OK highlighting  
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [{
                  sheetId: sheetId,
                  startRowIndex: 1,
                  endRowIndex: dataRowCount + 1,
                  startColumnIndex: 0,
                  endColumnIndex: 10
                }],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'OK' }]
                  },
                  format: {
                    backgroundColor: { red: 0.8, green: 1, blue: 0.8 }
                  }
                }
              }
            }
          },
          // Add ERROR highlighting
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [{
                  sheetId: sheetId,
                  startRowIndex: 1,
                  endRowIndex: dataRowCount + 1,
                  startColumnIndex: 0,
                  endColumnIndex: 10
                }],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'ERROR' }]
                  },
                  format: {
                    backgroundColor: { red: 1, green: 0.6, blue: 0.6 },
                    textFormat: { italic: true }
                  }
                }
              }
            }
          }
        ]
      }
    });
    
    console.log(`Applied conditional formatting to ${dataRowCount} rows`);
    
  } catch (error) {
    console.error('Failed to apply conditional formatting:', error);
    // Don't throw error as this is not critical
  }
}

/**
 * Send webhook notifications for NG results
 * @param {string} siteId - Site identifier
 * @param {Array} ngResults - Array of NG results
 */
async function sendNotifications(siteId, ngResults) {
  if (ngResults.length === 0) return;
  
  const message = `🚨 ${siteId} で ${ngResults.length} 件の差分が検出されました\n` +
    ngResults.slice(0, 5).map(r => 
      `- ${r.url} (${r.diffPercent?.toFixed(2) || 'N/A'}%)`
    ).join('\n') +
    (ngResults.length > 5 ? `\n... 他 ${ngResults.length - 5} 件` : '');
  
  const promises = [];
  
  // Slack notification
  if (process.env.SLACK_WEBHOOK_URL) {
    promises.push(
      fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: message,
          username: 'WordPress VRT Bot',
          icon_emoji: ':warning:'
        })
      }).catch(error => console.error('Slack notification failed:', error))
    );
  }
  
  // Discord notification
  if (process.env.DISCORD_WEBHOOK_URL) {
    promises.push(
      fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content: message,
          username: 'WordPress VRT Bot'
        })
      }).catch(error => console.error('Discord notification failed:', error))
    );
  }
  
  await Promise.all(promises);
  console.log(`Sent notifications for ${ngResults.length} NG results`);
}

/**
 * Cloud Function triggered by Firestore document write
 * Syncs comparison results to Google Sheets
 */
functions.cloudEvent('syncToSheets', async (cloudEvent) => {
  console.log('Firestore trigger received:', JSON.stringify(cloudEvent, null, 2));
  
  try {
    // Extract data from Firestore event
    const eventData = cloudEvent.data;
    
    if (!eventData || !eventData.value) {
      console.log('No data in event, skipping');
      return;
    }
    
    const fields = eventData.value.fields;
    if (!fields) {
      console.log('No fields in event data, skipping');
      return;
    }
    
    const siteId = fields.siteId?.stringValue;
    const date = fields.date?.stringValue;
    const resultsJson = fields.results?.stringValue;
    
    if (!siteId || !date || !resultsJson) {
      console.error('Missing required fields:', { siteId, date, results: !!resultsJson });
      return;
    }
    
    const results = JSON.parse(resultsJson);
    console.log(`Processing ${results.length} results for site ${siteId} on ${date}`);
    
    // Get authenticated client
    const authClient = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    
    // Get or create worksheet
    const sheetId = await getOrCreateWorksheet(sheets, siteId);
    
    // Prepare data rows
    const rows = results.map(result => [
      date,
      result.url,
      result.baselinePath || '',
      result.afterPath || '',
      result.diffPath || '',
      result.diffPercent?.toFixed(3) || '',
      result.status || 'UNKNOWN',
      result.dimensions ? `${result.dimensions.width}x${result.dimensions.height}` : '',
      result.error || '',
      result.timestamp ? new Date(result.timestamp).toLocaleString('ja-JP') : ''
    ]);
    
    // Append data to sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${siteId}!A:J`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: rows
      }
    });
    
    console.log(`Added ${rows.length} rows to ${siteId} worksheet`);
    
    // Apply conditional formatting
    const totalRows = rows.length + 1; // +1 for header
    await applyConditionalFormatting(sheets, sheetId, rows.length);
    
    // Send notifications for NG results
    const ngResults = results.filter(r => r.status === 'NG');
    if (ngResults.length > 0) {
      await sendNotifications(siteId, ngResults);
    }
    
    console.log(`Sync completed for ${siteId}: ${results.length} total, ${ngResults.length} NG`);
    
  } catch (error) {
    console.error('Sync to Sheets failed:', error);
    throw error;
  }
});

// Export for testing
module.exports = {
  getOrCreateWorksheet,
  applyConditionalFormatting,
  sendNotifications
};