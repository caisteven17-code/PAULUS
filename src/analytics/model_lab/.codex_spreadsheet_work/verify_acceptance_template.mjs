import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const outputDir = "outputs/acceptance-criteria-template";
const input = await FileBlob.load(`${outputDir}/acceptance_criteria_template.xlsx`);
const workbook = await SpreadsheetFile.importXlsx(input);

const overview = await workbook.inspect({
  kind: "sheet,table,formula",
  tableMaxRows: 10,
  tableMaxCols: 8,
  maxChars: 10000,
});
console.log(overview.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
  maxChars: 2000,
});
console.log(errors.ndjson);

for (const sheet of workbook.worksheets.items) {
  const preview = await workbook.render({
    sheetName: sheet.name,
    autoCrop: "all",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(
    `${outputDir}/verify-${sheet.name.replace(/[^A-Za-z0-9_-]/g, "_")}.png`,
    new Uint8Array(await preview.arrayBuffer()),
  );
}

console.log("verified");
