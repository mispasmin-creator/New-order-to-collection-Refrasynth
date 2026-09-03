const SPREADSHEET_ID = "1YZ7_c1dgGe5c9MyfCH6BJk5zHIMhhaLpkztI3U4gks4";

// Cache the spreadsheet object to avoid repeated openById calls
let cachedSpreadsheet = null;

function getSpreadsheet() {
    if (!cachedSpreadsheet) {
        cachedSpreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    }
    return cachedSpreadsheet;
}

function doGet(e) {
    var params = (e && e.parameter) ? e.parameter : {};
    var action = params.action;

    // If an action like insert, update, delete is sent via GET, route directly to doPost
    // This provides 100% CORS-free write capability for browser frontend apps!
    if (action && action !== 'read') {
        return doPost(e);
    }

    const sheetName = params.sheet || params.sheetName || "FMS";

    try {
        const ss = getSpreadsheet();
        let sheet = ss.getSheetByName(sheetName);
        if (!sheet) {
            // Case-insensitive check across existing sheets
            const allSheets = ss.getSheets();
            for (let s = 0; s < allSheets.length; s++) {
                if (allSheets[s].getName().trim().toLowerCase() === sheetName.trim().toLowerCase()) {
                    sheet = allSheets[s];
                    break;
                }
            }
        }

        if (!sheet) {
            return jsonError(`Sheet '${sheetName}' not found`);
        }

        const data = sheet.getDataRange().getValues();
        const result = {
            success: true,
            updated: new Date().toISOString(),
            rows: data.length,
            data: data
        };

        return ContentService.createTextOutput(JSON.stringify(result))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (err) {
        return jsonError(err.message || "Server error");
    }
}

function jsonError(msg) {
    return ContentService.createTextOutput(
        JSON.stringify({ success: false, error: msg })
    ).setMimeType(ContentService.MimeType.JSON);
}

function jsonSuccess(msg, additionalData) {
    const response = { success: true, message: msg, ...additionalData };
    return ContentService.createTextOutput(JSON.stringify(response))
        .setMimeType(ContentService.MimeType.JSON);
}

function fetchSheetData(sheetName) {
    try {
        var ss = getSpreadsheet();
        var sheet = ss.getSheetByName(sheetName);
        var data = sheet.getDataRange().getDisplayValues();

        return ContentService.createTextOutput(JSON.stringify({
            success: true,
            data: data
        })).setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
        console.error("Error fetching sheet data:", error);
        return ContentService.createTextOutput(JSON.stringify({
            success: false,
            error: error.toString()
        })).setMimeType(ContentService.MimeType.JSON);
    }
}

function doPost(e) {
    try {
        var params = (e && e.parameter) ? { ...e.parameter } : {};

        // Parse JSON body if present in postData
        if (e && e.postData && e.postData.contents) {
            try {
                var jsonBody = JSON.parse(e.postData.contents);
                for (var key in jsonBody) {
                    if (params[key] === undefined) {
                        params[key] = jsonBody[key];
                    }
                }
            } catch (err) {
                // Not valid JSON string, ignore
            }
        }

        var action = params.action || 'insert';

        if (action === 'uploadFile') {
            return handleFileUpload(e);
        }

        var sheetName = params.sheetName || params.sheet || 'FMS';
        var ss = getSpreadsheet();
        var sheet = ss.getSheetByName(sheetName);

        if (!sheet) {
            // Case-insensitive check across existing sheets
            var allSheets = ss.getSheets();
            for (var s = 0; s < allSheets.length; s++) {
                if (allSheets[s].getName().trim().toLowerCase() === sheetName.trim().toLowerCase()) {
                    sheet = allSheets[s];
                    break;
                }
            }
        }

        if (!sheet) {
            throw new Error("Sheet '" + sheetName + "' not found");
        }

        // ============== HEADER-BASED INSERT ==============
        // Data is sent as a JSON object { "Header Name": value, ... }
        // Apps Script finds the correct column by matching header names,
        // so formula columns (Planned 1, etc.) are never touched.
        if (action === 'insert') {

            var dataObj = {};

            // Accept either new-style object (rowDataObj) or legacy array (rowData)
            if (params.rowDataObj) {
                dataObj = JSON.parse(params.rowDataObj);
            } else {
                // Legacy fallback: flat array — use positional insert (old behaviour)
                var rowData = JSON.parse(params.rowData || '[]');
                sheet.appendRow(rowData);
                SpreadsheetApp.flush();
                return jsonSuccess("Data inserted (legacy array mode)");
            }

            // Add server-side Timestamp
            var now = new Date();
            var tz = Session.getScriptTimeZone() || 'Asia/Kolkata';
            dataObj['Timestamp'] = Utilities.formatDate(now, tz, 'dd/MM/yyyy HH:mm:ss');

            // ── Find header row (scan first 6 rows) ──────────────────────────
            var headerRow = -1;
            var headerValues = [];
            var searchLimit = Math.min(6, sheet.getLastRow());

            for (var r = 1; r <= searchLimit; r++) {
                var rowVals = sheet.getRange(r, 1, 1, sheet.getLastColumn()).getValues()[0];
                var rowStr = rowVals.join('||').toUpperCase();
                // Look for at least 1 known header marker in the same row. This must stay
                // sheet-agnostic (FMS, Dispatch, Billing, Full Kitting, ...) — every one of
                // them has a Timestamp column, so that alone is a reliable signal.
                var hits = 0;
                if (rowStr.indexOf('DO-DELIVERY') !== -1 || rowStr.indexOf('PARTY PO') !== -1) hits++;
                if (rowStr.indexOf('PARTY NAMES') !== -1 || rowStr.indexOf('PRODUCT NAME') !== -1) hits++;
                if (rowStr.indexOf('TIMESTAMP') !== -1) hits++;
                if (hits >= 1) {
                    headerRow = r;
                    headerValues = rowVals;
                    break;
                }
            }

            if (headerRow === -1) {
                throw new Error("Header row not found in first 6 rows for sheet '" + sheetName + "'");
            }

            // ── Build column-index map { "Header Name (lowercase)": colIndex (1-based) }
            var colMap = {};
            for (var c = 0; c < headerValues.length; c++) {
                var hdr = (headerValues[c] || '').toString().trim();
                if (hdr) {
                    colMap[hdr.toLowerCase()] = c + 1; // 1-based column
                }
            }

            // ── Determine target row ─────────────────────────────────────────
            var lastDataRow = sheet.getLastRow();
            var dataStartRow = headerRow + 1; // row right after header
            // For FMS we always start from at least row 7
            if (dataStartRow < 7) dataStartRow = 7;
            var targetRow = (lastDataRow >= dataStartRow) ? lastDataRow + 1 : dataStartRow;

            // ── Write each field to its matching column ──────────────────────
            var written = 0;
            for (var key in dataObj) {
                if (!dataObj.hasOwnProperty(key)) continue;
                var colIdx = colMap[key.toLowerCase()];
                if (colIdx) {
                    sheet.getRange(targetRow, colIdx).setValue(dataObj[key]);
                    written++;
                }
            }

            // Flush all writes at once
            SpreadsheetApp.flush();

            return jsonSuccess("Data inserted to " + written + " columns by header name");
        }

        // ============== OPTIMIZED UPDATE (HEADER-NAME OR ARRAY) ==============
        else if (action === 'update') {
            var rowIndex = parseInt(params.rowIndex);

            // Option A: Update specific fields by Header Name { "Status 1": "Approved", ... }
            if (params.rowDataObj) {
                var updateObj = JSON.parse(params.rowDataObj);

                // ── Find header row (scan first 6 rows) ──────────────────────────
                var headerRow = -1;
                var headerValues = [];
                var searchLimit = Math.min(6, sheet.getLastRow());

                for (var r = 1; r <= searchLimit; r++) {
                    var rowVals = sheet.getRange(r, 1, 1, sheet.getLastColumn()).getValues()[0];
                    var rowStr = rowVals.join('||').toUpperCase();
                    var hits = 0;
                    if (rowStr.indexOf('DO-DELIVERY') !== -1 || rowStr.indexOf('PARTY PO') !== -1) hits++;
                    if (rowStr.indexOf('STATUS 1') !== -1 || rowStr.indexOf('ACTUAL 1') !== -1) hits++;
                    if (rowStr.indexOf('TIMESTAMP') !== -1) hits++;
                    if (hits >= 1) {
                        headerRow = r;
                        headerValues = rowVals;
                        break;
                    }
                }

                if (headerRow === -1) {
                    throw new Error("Header row not found for update");
                }

                // ── Build column map { "header name (lowercase)": 1-based colIndex }
                var colMap = {};
                var cleanColMap = {};
                for (var c = 0; c < headerValues.length; c++) {
                    var hdr = (headerValues[c] || '').toString().trim();
                    if (hdr) {
                        colMap[hdr.toLowerCase()] = c + 1;
                        cleanColMap[hdr.toLowerCase().replace(/[^a-z0-9]/g, '')] = c + 1;
                    }
                }

                // If rowIndex not given or invalid, search row by DO Number
                if (isNaN(rowIndex) || rowIndex < 2) {
                    var doKey = params.doNumber || updateObj['DO-Delivery Order No.'] || updateObj['doNumber'];
                    var doCol = colMap['do-delivery order no.'] || cleanColMap['dondeliveryorderno'] || cleanColMap['dodeleliveryorderno'];
                    if (doKey && doCol) {
                        var allDos = sheet.getRange(1, doCol, sheet.getLastRow(), 1).getValues();
                        for (var rowI = 0; rowI < allDos.length; rowI++) {
                            if ((allDos[rowI][0] || '').toString().trim().toLowerCase() === doKey.toString().trim().toLowerCase()) {
                                rowIndex = rowI + 1;
                                break;
                            }
                        }
                    }
                }

                if (isNaN(rowIndex) || rowIndex < 2) {
                    throw new Error("Invalid row index for update");
                }

                // Write each field to its mapped column
                var updatedCount = 0;
                for (var key in updateObj) {
                    if (!updateObj.hasOwnProperty(key)) continue;
                    var colIdx = colMap[key.toLowerCase()] || cleanColMap[key.toLowerCase().replace(/[^a-z0-9]/g, '')];
                    if (colIdx) {
                        sheet.getRange(rowIndex, colIdx).setValue(updateObj[key]);
                        updatedCount++;
                    }
                }

                SpreadsheetApp.flush();
                return jsonSuccess("Updated " + updatedCount + " fields by header name in row " + rowIndex);
            }

            // Option B: Legacy array update
            if (isNaN(rowIndex) || rowIndex < 2) {
                throw new Error("Invalid row index for update");
            }

            var rowData = JSON.parse(params.rowData || '[]');
            var existingData = sheet.getRange(rowIndex, 1, 1, rowData.length).getValues()[0];
            var mergedData = existingData.map(function (existingVal, i) {
                return (rowData[i] !== '' && rowData[i] !== undefined) ? rowData[i] : existingVal;
            });
            sheet.getRange(rowIndex, 1, 1, mergedData.length).setValues([mergedData]);

            SpreadsheetApp.flush();
            return jsonSuccess("Data updated successfully");
        }

        // ============== UPDATE CELL ==============
        else if (action === 'updateCell') {
            var rowIndex = parseInt(params.rowIndex);
            var columnIndex = parseInt(params.columnIndex);
            var value = params.value;

            if (isNaN(rowIndex) || rowIndex < 1 || isNaN(columnIndex) || columnIndex < 1) {
                throw new Error("Invalid row or column index for update");
            }

            sheet.getRange(rowIndex, columnIndex).setValue(value);
            SpreadsheetApp.flush();

            return jsonSuccess("Cell updated successfully");
        }

        // ============== DELETE ==============
        else if (action === 'delete') {
            var rowIndex = parseInt(params.rowIndex);

            if (isNaN(rowIndex) || rowIndex < 2) {
                throw new Error("Invalid row index for delete");
            }

            sheet.deleteRow(rowIndex);
            SpreadsheetApp.flush();

            return jsonSuccess("Row deleted successfully");
        }

        // ============== MARK DELETED ==============
        else if (action === 'markDeleted') {
            var rowIndex = parseInt(params.rowIndex);
            var columnIndex = parseInt(params.columnIndex);
            var value = params.value || 'Yes';

            if (isNaN(rowIndex) || rowIndex < 2) {
                throw new Error("Invalid row index for marking as deleted");
            }
            if (isNaN(columnIndex) || columnIndex < 1) {
                throw new Error("Invalid column index for marking as deleted");
            }

            sheet.getRange(rowIndex, columnIndex).setValue(value);
            SpreadsheetApp.flush();

            return jsonSuccess("Row marked as deleted successfully");
        }

        // ============== BATCH INSERT (NEW - FOR MULTIPLE ROWS) ==============
        else if (action === 'batchInsert') {
            var rowsData = JSON.parse(params.rowsData);

            if (!Array.isArray(rowsData) || rowsData.length === 0) {
                throw new Error("Invalid rows data for batch insert");
            }

            var lastRow = sheet.getLastRow();
            sheet.getRange(lastRow + 1, 1, rowsData.length, rowsData[0].length).setValues(rowsData);

            SpreadsheetApp.flush();

            return jsonSuccess("Batch insert successful", { rowsInserted: rowsData.length });
        }

        else {
            throw new Error("Unknown action: " + action);
        }
    } catch (error) {
        console.error("Error in doPost:", error);
        return ContentService.createTextOutput(JSON.stringify({
            success: false,
            error: error.toString()
        })).setMimeType(ContentService.MimeType.JSON);
    }
}

function handleFileUpload(e) {
    try {
        var params = e.parameter;

        if (!params.base64Data || !params.fileName || !params.mimeType || !params.folderId) {
            throw new Error("Missing required parameters for file upload");
        }

        var fileUrl = uploadFileToDrive(params.base64Data, params.fileName, params.mimeType, params.folderId);

        if (!fileUrl) {
            throw new Error("Failed to upload file to Google Drive");
        }

        return ContentService.createTextOutput(JSON.stringify({
            success: true,
            fileUrl: fileUrl,
            message: "File uploaded successfully"
        })).setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
        console.error("Error in handleFileUpload:", error);
        return ContentService.createTextOutput(JSON.stringify({
            success: false,
            error: error.toString()
        })).setMimeType(ContentService.MimeType.JSON);
    }
}

function uploadFileToDrive(base64Data, fileName, mimeType, folderId) {
    try {
        let fileData = base64Data;
        if (base64Data.indexOf('base64,') !== -1) {
            fileData = base64Data.split('base64,')[1];
        }

        const decoded = Utilities.base64Decode(fileData);
        const blob = Utilities.newBlob(decoded, mimeType, fileName);
        const folder = DriveApp.getFolderById(folderId);
        const file = folder.createFile(blob);

        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

        return "https://drive.google.com/uc?export=view&id=" + file.getId();
    } catch (error) {
        console.error("Error in uploadFileToDrive:", error);
        return null;
    }
}

/**
 * Run this function once in Google Apps Script editor (select 'setupMasterTab' and click Run)
 * to automatically create and populate the "Master" tab with standard headers & options!
 */
function setupMasterTab() {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName("Master");
    if (!sheet) {
        sheet = ss.insertSheet("Master");
    }

    const masterHeaders = [
        "Firm Name",
        "Type Of Transporting",
        "Customer Category",
        "Type Of Measurement",
        "Type Of PI",
        "Payment to Be Taken",
        "Order Received From",
        "Sales Person Name",
        "TC Required",
        "Free Replacement (FOC)",
        "Is This Order Through Some Agent",
        "Retention Payment"
    ];

    const masterSampleRows = [
        [
            "Refrasynth Corporate",
            "By Road",
            "Steel Plant",
            "MT",
            "100% Advance",
            "Advance + Against Dispatch",
            "Email",
            "Arun Verma",
            "Yes",
            "No",
            "No",
            "No"
        ],
        [
            "Refrasynth Manufacturing Unit 1",
            "Dedicated Truck",
            "Cement",
            "Pcs",
            "Against Dispatch",
            "100% Advance",
            "WhatsApp",
            "Vikas Deshmukh",
            "No",
            "Yes",
            "Yes",
            "Yes"
        ],
        [
            "Refrasynth Plant 2",
            "Part Load / Consignment",
            "Foundry",
            "Bags",
            "Against Delivery",
            "Against Dispatch",
            "Direct PO Copy",
            "Rajesh Sharma",
            "",
            "",
            "",
            ""
        ],
        [
            "Refrasynth Refractories Ltd",
            "FOR Destination",
            "Power",
            "Kgs",
            "30 Days Credit",
            "Against Delivery",
            "Agent / Broker",
            "Suresh Gupta",
            "",
            "",
            "",
            ""
        ],
        [
            "Refrasynth Trading Division",
            "Ex-Works (Customer Scope)",
            "Aluminium",
            "Tonnes",
            "45 Days Credit",
            "30 Days LC / Credit",
            "Phone Call",
            "",
            "",
            "",
            "",
            ""
        ],
        [
            "",
            "Freight to Pay",
            "Glass",
            "Sqm",
            "60 Days LC",
            "60 Days LC",
            "Tender / GeM Portal",
            "",
            "",
            "",
            "",
            ""
        ],
        [
            "",
            "Rake / Train Loading",
            "Chemical / Fertilizer",
            "",
            "90 Days LC",
            "90 Days LC",
            "",
            "",
            "",
            "",
            "",
            ""
        ],
        [
            "",
            "Courier / Express Cargo",
            "Other",
            "",
            "LC at Sight",
            "",
            "",
            "",
            "",
            "",
            "",
            ""
        ],
        [
            "",
            "",
            "",
            "",
            "PDC (Post Dated Cheque)",
            "",
            "",
            "",
            "",
            "",
            "",
            ""
        ]
    ];

    // Clear and set headers
    sheet.clear();
    sheet.getRange(1, 1, 1, masterHeaders.length).setValues([masterHeaders]);
    sheet.getRange(1, 1, 1, masterHeaders.length).setBackground("#312e81").setFontColor("#ffffff").setFontWeight("bold");

    // Insert sample rows
    sheet.getRange(2, 1, masterSampleRows.length, masterHeaders.length).setValues(masterSampleRows);

    sheet.autoResizeColumns(1, masterHeaders.length);
    SpreadsheetApp.flush();
    console.log("Master tab created and populated successfully!");
}