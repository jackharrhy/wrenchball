import Papa from "papaparse";
import ExcelJS from "exceljs";
import { join } from "path";

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
      headers = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const headerValue = cell?.text || cell?.value || "";
        headers[colNumber - 1] = String(headerValue).trim();
      });
    } else if (rowNumber > headerRowIndex + 1) {
      const rowData: Record<string, any> = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const header = headers[colNumber - 1];
        if (header) {
          let value: any = null;
          if (cell) {
            value = cell.value;
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

export async function readXLSXFromData(
  filename: string,
  sheetName?: string,
  headerRow?: number
): Promise<Array<Record<string, any>>> {
  const filePath = join(process.cwd(), "data", "sheets", filename);
  return await parseXLSX(filePath, sheetName, headerRow);
}
