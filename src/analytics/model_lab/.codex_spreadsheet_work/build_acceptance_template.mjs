import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "outputs/acceptance-criteria-template";
await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();

const modules = [
  {
    code: "MOD-FE",
    name: "Frontend User Interface",
    weight: 0.245,
    sheet: "MOD-FE",
    groups: [
      { code: "AUTH", name: "Authentication and Session UI" },
      { code: "DASH", name: "Dashboard and Navigation" },
      { code: "REPORT", name: "Reports and User Feedback" },
    ],
  },
  {
    code: "MOD-BE",
    name: "Backend and API Services",
    weight: 0.235,
    sheet: "MOD-BE",
    groups: [
      { code: "API", name: "Core API Endpoints" },
      { code: "SEC", name: "Security and Access Control" },
      { code: "INT", name: "System Integrations" },
    ],
  },
  {
    code: "MOD-DB",
    name: "Database and Data Processing",
    weight: 0.08,
    sheet: "MOD-DB",
    groups: [
      { code: "DATA", name: "Database Schema and Source Data" },
      { code: "ETL", name: "Cleaning, Import, and Validation" },
    ],
  },
  {
    code: "MOD-ANA",
    name: "Analytics, Models, and Simulation",
    weight: 0.285,
    sheet: "MOD-ANA",
    groups: [
      { code: "MODEL", name: "Model Training and Evaluation" },
      { code: "SIM", name: "Simulation and Prescriptive Logic" },
      { code: "VAL", name: "Validation and Results Review" },
    ],
  },
  {
    code: "CORE",
    name: "Deployment, Repository, and Project Management",
    weight: 0.055,
    sheet: "CORE",
    groups: [
      { code: "HOST", name: "Hosting and Deployment" },
      { code: "REPO", name: "Repository and Branch Management" },
      { code: "PM", name: "Project Management and QA" },
    ],
  },
  {
    code: "MANUSCRIPT",
    name: "Manuscript and Documentation",
    weight: 0.1,
    sheet: "MANUSCRIPT",
    groups: [
      { code: "DOC", name: "Capstone Manuscript Revisions" },
      { code: "APPX", name: "Appendices and References" },
    ],
  },
];

const sampleTasks = [
  ["REQ-01", "Define requirements", "Given the approved project scope, requirements should be specific, measurable, and traceable to the system objectives.", "Requirements matrix or signed-off checklist"],
  ["DES-01", "Design solution", "Given the requirement set, the design should describe the expected user flow, data flow, or technical behavior.", "Wireframe, diagram, ERD, API contract, or design note"],
  ["DEV-01", "Implement feature", "Given the approved design, the feature should work in the target environment and handle expected inputs.", "Committed implementation, deployment link, or working demo"],
  ["TEST-01", "Test expected behavior", "Given valid and invalid scenarios, the feature should pass documented functional and edge-case checks.", "Test cases, screenshots, QA log, or automated test output"],
  ["FIX-01", "Resolve issues", "Given defects found during testing, all critical issues should be fixed and rechecked.", "Resolved issue list and retest evidence"],
  ["MS-01", "Document work", "Given the completed work, the manuscript should explain the implementation, validation, and results clearly.", "Updated chapter, appendix, or technical documentation"],
];

const theme = {
  dark: "#1F4E78",
  mid: "#D9EAF7",
  light: "#F4F8FB",
  border: "#B7C9D6",
  green: "#E2F0D9",
  amber: "#FFF2CC",
  text: "#1F2933",
};

function setWidths(sheet) {
  const widths = [92, 235, 420, 360, 118, 105, 190];
  widths.forEach((width, i) => {
    sheet.getRangeByIndexes(0, i, 1, 1).format.columnWidthPx = width;
  });
}

function styleRange(range, fill, color = theme.text, bold = false) {
  range.format = {
    fill,
    font: { bold, color },
    borders: { preset: "all", style: "thin", color: theme.border },
    wrapText: true,
  };
}

function addModuleSheet(module) {
  const sheet = workbook.worksheets.add(module.sheet);
  sheet.showGridLines = false;
  setWidths(sheet);
  sheet.freezePanes.freezeRows(2);

  let row = 1;
  const totalCells = [];
  for (const group of module.groups) {
    const taskRows = sampleTasks.length;
    const startRow = row + 2;
    const endRow = startRow + taskRows - 1;
    const totalRow = endRow + 1;
    const groupWeight = module.weight / module.groups.length;
    const taskWeight = groupWeight / taskRows;

    sheet.getRange(`A${row}:G${row}`).values = [[
      "Task ID",
      group.code,
      "Task Name",
      group.name,
      "",
      "",
      "",
    ]];
    styleRange(sheet.getRange(`A${row}:G${row}`), theme.dark, "#FFFFFF", true);
    sheet.getRange(`A${row}:G${row}`).format.rowHeightPx = 28;

    sheet.getRange(`A${row + 1}:G${row + 1}`).values = [[
      "Subtask ID",
      "Subtask Name",
      "Acceptance Criteria",
      "Evidence / Deliverable",
      "Weight Allocation",
      "Status",
      "Remarks",
    ]];
    styleRange(sheet.getRange(`A${row + 1}:G${row + 1}`), theme.mid, theme.text, true);

    const rows = sampleTasks.map((task, index) => [
      `${group.code}-${String(index + 1).padStart(2, "0")}`,
      task[1],
      task[2],
      task[3],
      taskWeight,
      false,
      "",
    ]);
    sheet.getRange(`A${startRow}:G${endRow}`).values = rows;
    styleRange(sheet.getRange(`A${startRow}:G${endRow}`), "#FFFFFF");
    sheet.getRange(`C${startRow}:D${endRow}`).format.wrapText = true;
    sheet.getRange(`E${startRow}:E${endRow}`).format.numberFormat = "0.00%";
    sheet.getRange(`F${startRow}:F${endRow}`).dataValidation = {
      rule: { type: "list", values: ["TRUE", "FALSE"] },
    };

    sheet.getRange(`A${totalRow}:G${totalRow}`).values = [[
      "Total Accomplished",
      "",
      "",
      "",
      "",
      "",
      "",
    ]];
    sheet.getRange(`E${totalRow}`).formulas = [[`=SUM(E${startRow}:E${endRow})`]];
    sheet.getRange(`F${totalRow}`).formulas = [[`=SUMIF(F${startRow}:F${endRow}, TRUE, E${startRow}:E${endRow})`]];
    sheet.getRange(`E${totalRow}:F${totalRow}`).format.numberFormat = "0.00%";
    styleRange(sheet.getRange(`A${totalRow}:G${totalRow}`), theme.green, theme.text, true);
    totalCells.push(`'${module.sheet}'!F${totalRow}`);

    row = totalRow + 2;
  }

  const summaryRow = row + 1;
  sheet.getRange(`A${summaryRow}:G${summaryRow}`).values = [[
    "Module Accomplishment",
    module.code,
    module.name,
    "",
    module.weight,
    "",
    "",
  ]];
  sheet.getRange(`F${summaryRow}`).formulas = [[`=SUM(${totalCells.join(",")})`]];
  sheet.getRange(`E${summaryRow}:F${summaryRow}`).format.numberFormat = "0.00%";
  styleRange(sheet.getRange(`A${summaryRow}:G${summaryRow}`), theme.amber, theme.text, true);

  sheet.getRange(`A1:G${summaryRow}`).format.borders = { preset: "all", style: "thin", color: theme.border };
  sheet.getRange(`A1:G${summaryRow}`).format.verticalAlignment = "top";

  return { module, summaryCell: `'${module.sheet}'!F${summaryRow}` };
}

const distribution = workbook.worksheets.add("DISTRIBUTION");
distribution.showGridLines = false;
distribution.getRange("B2:E2").values = [["Module Code", "Module Description", "System Weight Allocation", "Actual Accomplishment"]];
styleRange(distribution.getRange("B2:E2"), theme.dark, "#FFFFFF", true);
distribution.getRange("B:B").format.columnWidthPx = 130;
distribution.getRange("C:C").format.columnWidthPx = 330;
distribution.getRange("D:E").format.columnWidthPx = 160;

const summaries = modules.map(addModuleSheet);
const distRows = modules.map((m) => [m.code, m.name, m.weight, ""]);
distribution.getRange(`B3:E${modules.length + 2}`).values = distRows;
for (let i = 0; i < modules.length; i += 1) {
  distribution.getRange(`E${i + 3}`).formulas = [[`=${summaries[i].summaryCell}`]];
}
const totalRow = modules.length + 3;
distribution.getRange(`B${totalRow}:E${totalRow}`).values = [["TOTAL", "Entire Project Scope", "", ""]];
distribution.getRange(`D${totalRow}`).formulas = [[`=SUM(D3:D${modules.length + 2})`]];
distribution.getRange(`E${totalRow}`).formulas = [[`=SUM(E3:E${modules.length + 2})`]];
distribution.getRange(`D3:E${totalRow}`).format.numberFormat = "0.00%";
styleRange(distribution.getRange(`B3:E${modules.length + 2}`), "#FFFFFF");
styleRange(distribution.getRange(`B${totalRow}:E${totalRow}`), theme.green, theme.text, true);

distribution.getRange("B12:E12").values = [["Task ID", "Task Name", "Task Weight Allocation", "Actual Task Accomplishment"]];
styleRange(distribution.getRange("B12:E12"), theme.mid, theme.text, true);
distribution.freezePanes.freezeRows(2);

const dashboard = workbook.worksheets.add("README");
dashboard.showGridLines = false;
dashboard.getRange("B2:F2").values = [["Acceptance Criteria Tracker Template", "", "", "", ""]];
dashboard.getRange("B2:F2").merge();
styleRange(dashboard.getRange("B2:F2"), theme.dark, "#FFFFFF", true);
dashboard.getRange("B4:F8").values = [
  ["How to use", "Edit module names, groups, task descriptions, acceptance criteria, evidence, and remarks.", "", "", ""],
  ["Weights", "Keep total system weight at 100%. Task weights roll up to module and project accomplishment.", "", "", ""],
  ["Status", "Set status cells to TRUE when the subtask is accepted. Formulas calculate accomplishment.", "", "", ""],
  ["Google Sheets", "Formulas use standard SUM and SUMIF patterns designed to import cleanly.", "", "", ""],
  ["Output", "Use the DISTRIBUTION tab for overall progress and module tabs for detailed acceptance criteria.", "", "", ""],
];
styleRange(dashboard.getRange("B4:F8"), "#FFFFFF");
dashboard.getRange("B:B").format.columnWidthPx = 150;
dashboard.getRange("C:F").format.columnWidthPx = 190;

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula error scan",
  maxChars: 2000,
});
console.log(errors.ndjson);

for (const sheetName of ["README", "DISTRIBUTION", "MOD-FE"]) {
  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(`${outputDir}/${sheetName}.png`, new Uint8Array(await preview.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/acceptance_criteria_template.xlsx`);
console.log(`${outputDir}/acceptance_criteria_template.xlsx`);
