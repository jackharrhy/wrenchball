import Papa from "papaparse";
import ExcelJS from "exceljs";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Parse a CSV file from FormData File object or string content
 */
export async function parseCSV(
  fileOrContent: File | string
): Promise<Array<Record<string, string>>> {
  return new Promise((resolve, reject) => {
    const getContent = async () => {
      if (typeof fileOrContent === "string") {
        return fileOrContent;
      }
      return await fileOrContent.text();
    };

    getContent()
      .then((fileContent) => {
        Papa.parse(fileContent, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            if (results.errors.length > 0) {
              reject(
                new Error(
                  `CSV parsing errors: ${results.errors.map((e) => e.message).join(", ")}`
                )
              );
            } else {
              resolve(results.data as Array<Record<string, string>>);
            }
          },
          error: (error: Error) => {
            reject(error);
          },
        });
      })
      .catch(reject);
  });
}

/**
 * Parse an XLSX file from a file path (for server-side reading)
 */
export async function parseXLSX(
  filePath: string,
  sheetName?: string,
  headerRow?: number
): Promise<Array<Record<string, any>>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = sheetName
    ? workbook.getWorksheet(sheetName)
    : workbook.worksheets[0];

  if (!worksheet) {
    throw new Error(
      `Sheet "${sheetName || workbook.worksheets[0]?.name || "first"}" not found in Excel file`
    );
  }

  const rows: Array<Record<string, any>> = [];
  const headerRowIndex = headerRow !== undefined ? headerRow : 0;
  let headers: string[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === headerRowIndex + 1) {
      // Extract headers from this row
      // row.values is an array where index 0 is undefined (Excel is 1-indexed)
      headers = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const headerValue = cell?.text || cell?.value || "";
        headers[colNumber - 1] = String(headerValue).trim();
      });
    } else if (rowNumber > headerRowIndex + 1) {
      // Extract data rows
      const rowData: Record<string, any> = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const header = headers[colNumber - 1];
        if (header) {
          // Get the actual value, handling different cell types
          let value: any = null;
          if (cell) {
            // exceljs provides .value for the raw value or .text for formatted text
            value = cell.value;
            // Handle rich text and other complex types
            if (cell.type === ExcelJS.ValueType.RichText) {
              value = cell.text;
            } else if (cell.type === ExcelJS.ValueType.Hyperlink) {
              value = cell.text;
            } else if (cell.type === ExcelJS.ValueType.Formula) {
              value = cell.result || cell.value;
            }
          }
          rowData[header] = value;
        }
      });
      rows.push(rowData);
    }
  });

  return rows;
}

/**
 * Read and parse an XLSX file from the data directory
 */
export async function readXLSXFromData(
  filename: string,
  sheetName?: string,
  headerRow?: number
): Promise<Array<Record<string, any>>> {
  const filePath = join(process.cwd(), "data", "sheets", filename);
  return await parseXLSX(filePath, sheetName, headerRow);
}
