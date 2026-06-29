import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/caist/Downloads/Copy of CAPSTONE-Group4_Acceptance Criteria.xlsx";
const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const overview = await workbook.inspect({
  kind: "workbook,sheet,table,drawing,formula",
  include: "name,id,values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 12,
  maxChars: 16000,
});
console.log(overview.ndjson);

const sheets = await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 4000 });
console.log("SHEETS", sheets.ndjson);

for (const name of workbook.worksheets.items.map((s) => s.name)) {
  const used = await workbook.inspect({
    kind: "region,table",
    sheetId: name,
    maxChars: 5000,
    tableMaxRows: 14,
    tableMaxCols: 12,
  });
  console.log(`SHEET_DETAIL ${name}`);
  console.log(used.ndjson);
}
