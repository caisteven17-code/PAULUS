import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const outputDir = "outputs/paulus-acceptance-criteria";
const input = await FileBlob.load(`${outputDir}/paulus_acceptance_criteria_compact_clickup.xlsx`);
const workbook = await SpreadsheetFile.importXlsx(input);

const overview = await workbook.inspect({
  kind: "sheet,table,formula",
  tableMaxRows: 8,
  tableMaxCols: 8,
  maxChars: 12000,
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

for (const sheetName of ["DISTRIBUTION", "MOD-FE", "MOD-BE", "MOD-DB", "MOD-ANA", "CORE", "MANUSCRIPT"]) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(
    `${outputDir}/verify-${sheetName}.png`,
    new Uint8Array(await preview.arrayBuffer()),
  );
}

console.log("verified");
