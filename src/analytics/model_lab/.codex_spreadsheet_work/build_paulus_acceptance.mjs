import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "outputs/paulus-acceptance-criteria";
await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();

const moduleData = [
  {
    code: "MOD-FE",
    name: "Frontend User Interface",
    weight: 0.245,
    tasks: [
      ["LOGIN", "Login and User Access Interface", "for qa / internal testing", "https://app.clickup.com/t/86d38tg64"],
      ["DASH", "Main Financial Dashboard", "for qa / internal testing", "https://app.clickup.com/t/86d38tg6m"],
      ["INST", "Institution Management Interface", "for qa / internal testing", "https://app.clickup.com/t/86d38tg8j"],
      ["TWIN", "Digital Twin Interface", "for qa / internal testing", "https://app.clickup.com/t/86d38tgck"],
      ["WHATIF", "What-If Simulator Interface", "for qa / internal testing", "https://app.clickup.com/t/86d38tgd8"],
      ["BUDGET", "Budget Page", "planning/backlog", "https://app.clickup.com/t/86d3bw6fq"],
      ["EVENTS", "Events Page", "planning/backlog", "https://app.clickup.com/t/86d3bw6gu"],
      ["REPORT", "Report Viewing and Export Interface", "for qa / internal testing", "https://app.clickup.com/t/86d38tgc8"],
      ["GEO", "Geospatial Institution Map", "for qa / internal testing", "https://app.clickup.com/t/86d38tged"],
      ["PRST", "Priest Health Tracker Interface", "for qa / internal testing", "https://app.clickup.com/t/86d38tgmg"],
      ["PROJ", "Projects and Donations Interface", "for qa / internal testing", "https://app.clickup.com/t/86d38tgb5"],
      ["CHAT", "AI Chatbot Interface", "for qa / internal testing", "https://app.clickup.com/t/86d38tgkb"],
      ["ANALYTICS", "Analytics and Decision-Support", "for qa / internal testing", "https://app.clickup.com/t/86d38tgbx"],
      ["FS", "Financial Statement Upload Interface", "for qa / internal testing", "https://app.clickup.com/t/86d38tgaq"],
      ["ANNC", "Announcements Interface", "for qa / internal testing", "https://app.clickup.com/t/86d38tgbu"],
      ["NOTIF", "Notification Feature", "planning/backlog", "https://app.clickup.com/t/86d3bw6ht"],
      ["IAFR", "IAFR Data Entry and Upload Interface", "for qa / internal testing", "https://app.clickup.com/t/86d38tga9"],
      ["AUDITLOG", "Audit Log Viewing Interface", "for qa / internal testing", "https://app.clickup.com/t/86d38tgxt"],
      ["ADMIN", "Admin Management Interface", "for qa / internal testing", "https://app.clickup.com/t/86d38tgy3"],
      ["ARCHIVES", "Archives Page / Archive Management", "planning/backlog", "https://app.clickup.com/t/86d3bw6jy"],
    ],
  },
  {
    code: "MOD-BE",
    name: "Backend and API Services",
    weight: 0.235,
    tasks: [
      ["AUTH", "Authentication and Role Access API", "in progress", "https://app.clickup.com/t/86d38tft1"],
      ["INSTAPI", "Institution Management API", "for qa / internal testing", "https://app.clickup.com/t/86d38tfth"],
      ["PROJAPI", "Projects and Donations API", "in progress", "https://app.clickup.com/t/86d38tfuf"],
      ["ANNCAPI", "Announcements API", "for qa / internal testing", "https://app.clickup.com/t/86d38tfuw"],
      ["FSAPI", "Financial Statement Processing API", "planning/backlog", "https://app.clickup.com/t/86d38tfu2"],
      ["IAFRAPI", "IAFR Processing API", "planning/backlog", "https://app.clickup.com/t/86d38tftn"],
      ["ANALYTICSAPI", "Analytics Result API", "planning/backlog", "https://app.clickup.com/t/86d38tg0q"],
      ["REPORTAPI", "Report Generation API", "planning/backlog", "https://app.clickup.com/t/86d38tg14"],
      ["BUDGETAPI", "Budget API and Validation", "planning/backlog", "https://app.clickup.com/t/86d3bw6g7"],
      ["EVENTAPI", "Events API", "planning/backlog", "https://app.clickup.com/t/86d3bw6hb"],
      ["NOTIFAPI", "Notification API and Read-State Logic", "planning/backlog", "https://app.clickup.com/t/86d3bw6ja"],
      ["ARCHIVEAPI", "Archive and Restore API", "planning/backlog", "https://app.clickup.com/t/86d3bw6kh"],
      ["FINBACKUPAPI", "Financial Backup Input API", "planning/backlog", "https://app.clickup.com/t/86d3bw6rv"],
      ["CHATAPI", "AI Chatbot API", "planning/backlog", "https://app.clickup.com/t/86d38tg1f"],
      ["PRSTAPI", "Priest Health Records API", "in progress", "https://app.clickup.com/t/86d38tg03"],
      ["AUDIT", "Audit Trail and Activity Log API", "ready for work", "https://app.clickup.com/t/86d38tg1r"],
    ],
  },
  {
    code: "MOD-DB",
    name: "Database, ETL, and Storage Layers",
    weight: 0.08,
    tasks: [
      ["USERDB", "User and Role Tables", "in progress", "https://app.clickup.com/t/86d38tf0b"],
      ["INSTDB", "Institution Tables", "in progress", "https://app.clickup.com/t/86d38tf2u"],
      ["IAFRDB", "IAFR Data Tables", "in progress", "https://app.clickup.com/t/86d38tf3c"],
      ["FSDB", "Financial Statement Tables", "in progress", "https://app.clickup.com/t/86d38tf7g"],
      ["PROJDB", "Projects and Donations Tables", "in progress", "https://app.clickup.com/t/86d38tf81"],
      ["PRSTDB", "Priest Health Records Table", "in progress", "https://app.clickup.com/t/86d38tf96"],
      ["ANALYTICSDB", "Analytics Output Tables", "in progress", "https://app.clickup.com/t/86d38tf9g"],
      ["SANDBOX", "Sandbox and Model Testing Schema", "in progress", "https://app.clickup.com/t/86d38tfat"],
      ["BACKUP", "Backup and Recovery Setup", "planning/backlog", "https://app.clickup.com/t/86d38tfcn"],
      ["FINBACKUP", "Backup Input for Financial Data", "planning/backlog", "https://app.clickup.com/t/86d3bw6t9"],
    ],
  },
  {
    code: "MOD-ANA",
    name: "Analytics, Models, and Decision Support",
    weight: 0.285,
    tasks: [
      ["RATIO", "Financial Ratio Analysis Module", "planning/backlog", "https://app.clickup.com/t/86d38tg2f"],
      ["HEALTH", "Financial Health Classification Model", "planning/backlog", "https://app.clickup.com/t/86d38tg2t"],
      ["FORECAST", "Short-Term Financial Forecasting", "planning/backlog", "https://app.clickup.com/t/86d38tg3g"],
      ["RECO", "Decision-Support Recommendation Model", "planning/backlog", "https://app.clickup.com/t/86d38tg4b"],
      ["LITCAL", "Liturgical Calendar Data Pipeline", "for qa / internal testing", "https://app.clickup.com/t/86d38tg4j"],
      ["WEATHER", "Weather Data Collection Pipeline", "in progress", "https://app.clickup.com/t/86d39pnnk"],
    ],
  },
  {
    code: "CORE",
    name: "Hosting, Repository, and Project Management",
    weight: 0.055,
    tasks: [
      ["HOST", "Hosting and Deployment Setup", "planning/backlog", "https://app.clickup.com/t/86d38te3n"],
      ["UAT", "User Acceptance Testing and Final Validation", "planning/backlog", "https://app.clickup.com/t/86d38th2p"],
    ],
  },
  {
    code: "MANUSCRIPT",
    name: "Manuscript and Documentation",
    weight: 0.1,
    tasks: [
      ["MS-01", "Revise Chapter 3 methodology to Agile Kanban", "in progress", "https://app.clickup.com/t/86d391p3k"],
      ["MS-02", "Add Kanban literature in Chapter 2", "for qa / internal testing", "https://app.clickup.com/t/86d391r9d"],
      ["MS-03", "Add ClickUp tool discussion in Chapter 2", "for qa / internal testing", "https://app.clickup.com/t/86d391rag"],
      ["MS-04", "Draft Chapter 4 results and testing discussion", "planning/backlog", "https://app.clickup.com/t/86d3921qu"],
      ["MS-05", "Draft Chapter 5 conclusions and recommendations", "planning/backlog", "https://app.clickup.com/t/86d3921r5"],
      ["MS-06", "Compile appendix materials and supporting evidence", "planning/backlog", "https://app.clickup.com/t/86d3921ru"],
    ],
  },
];

function standardSubtasks(title, chapter = "Chapter 4") {
  return [
    ["REQ-01", `Define ${title} requirements`, "standardized subtask - URL pending", ""],
    ["DES-01", `Design ${title} structure and workflow`, "standardized subtask - URL pending", ""],
    ["DEV-01", `Implement ${title} baseline functionality`, "standardized subtask - URL pending", ""],
    ["TEST-01", `Test ${title} behavior and outputs`, "standardized subtask - URL pending", ""],
    ["FIX-01", `Resolve ${title} issues`, "standardized subtask - URL pending", ""],
    ["MS-01", `Document ${title} in ${chapter}`, "standardized subtask - URL pending", ""],
  ];
}

const subtasks = {
  LOGIN: [
    ["REQ-01", "Define login interface requirements", "planning/backlog", "https://app.clickup.com/t/86d390mdr"],
    ["DES-01", "Design login page wireframe", "planning/backlog", "https://app.clickup.com/t/86d390mgb"],
    ["DEV-01", "Build login page layout", "planning/backlog", "https://app.clickup.com/t/86d390mke"],
    ["DEV-02", "Connect login form to authentication API", "planning/backlog", "https://app.clickup.com/t/86d390mp8"],
    ["TEST-01", "Test valid and invalid login behavior", "planning/backlog", "https://app.clickup.com/t/86d390mrn"],
    ["FIX-01", "Resolve login form and validation issues", "planning/backlog", "https://app.clickup.com/t/86d390muz"],
    ["UAT-01", "Validate login process with target users", "planning/backlog", "https://app.clickup.com/t/86d390mxy"],
    ["MS-01", "Document login interface in Chapter 4", "planning/backlog", "https://app.clickup.com/t/86d390n0p"],
  ],
  DASH: [
    ["REQ-01", "Define dashboard data and filter requirements", "planning/backlog", "https://app.clickup.com/t/86d390n52"],
    ["DES-01", "Create dashboard wireframe", "planning/backlog", "https://app.clickup.com/t/86d390nvz"],
    ["DEV-01", "Build dashboard layout components", "planning/backlog", "https://app.clickup.com/t/86d390p6m"],
    ["DEV-02", "Add financial summary cards", "planning/backlog", "https://app.clickup.com/t/86d390p8g"],
    ["DEV-03", "Add chart and visualization components", "planning/backlog", "https://app.clickup.com/t/86d390pb0"],
    ["DEV-04", "Connect dashboard to backend API data", "planning/backlog", "https://app.clickup.com/t/86d390pde"],
    ["TEST-01", "Verify dashboard data rendering and filters", "planning/backlog", "https://app.clickup.com/t/86d390pfw"],
    ["FIX-01", "Resolve dashboard display and calculation issues", "planning/backlog", "https://app.clickup.com/t/86d390pjm"],
    ["UAT-01", "Validate dashboard usability with target users", "planning/backlog", "https://app.clickup.com/t/86d390pn2"],
    ["MS-01", "Document dashboard module in Chapter 4", "planning/backlog", "https://app.clickup.com/t/86d390pqg"],
  ],
  TWIN: [
    ["REQ-01", "Define digital twin interface requirements", "planning/backlog", "https://app.clickup.com/t/86d390ayb"],
    ["DES-01", "Design digital twin institution selector and launcher", "planning/backlog", "https://app.clickup.com/t/86d390azd"],
    ["DEV-01", "Build institution selection and session management", "planning/backlog", "https://app.clickup.com/t/86d390b66"],
    ["DEV-02", "Build digital twin scenario launch and history flow", "planning/backlog", "https://app.clickup.com/t/86d390b7k"],
    ["DEV-03", "Connect digital twin to backend simulation data", "planning/backlog", "https://app.clickup.com/t/86d390bae"],
    ["TEST-01", "Test digital twin institution selection and launch behavior", "planning/backlog", "https://app.clickup.com/t/86d390bct"],
    ["FIX-01", "Resolve digital twin interface and session issues", "planning/backlog", "https://app.clickup.com/t/86d390bef"],
    ["UAT-01", "Validate digital twin interface with target users", "planning/backlog", "https://app.clickup.com/t/86d390bfd"],
    ["MS-01", "Document digital twin interface in Chapter 4", "planning/backlog", "https://app.clickup.com/t/86d390bhk"],
  ],
  INST: [
    ["REQ-01", "Define institution management requirements", "standardized subtask - URL pending", ""],
    ["DES-01", "Design institution management interface and workflow", "standardized subtask - URL pending", ""],
    ["DEV-01", "Build institution management interface", "standardized subtask - URL pending", ""],
    ["TEST-01", "Test institution create, update, view, and validation behavior", "standardized subtask - URL pending", ""],
    ["FIX-01", "Resolve institution management issues", "standardized subtask - URL pending", ""],
    ["UAT-01", "Validate institution management with target users", "standardized subtask - URL pending", ""],
    ["MS-01", "Document institution management module in Chapter 4", "standardized subtask - URL pending", ""],
  ],
  PROJ: [
    ["REQ-01", "Define projects and donations page requirements", "standardized subtask - URL pending", ""],
    ["DES-01", "Design projects and donations interface workflow", "standardized subtask - URL pending", ""],
    ["DEV-01", "Build projects and donations page interface", "standardized subtask - URL pending", ""],
    ["TEST-01", "Test project listing, detail, donation display, and validation behavior", "standardized subtask - URL pending", ""],
    ["FIX-01", "Resolve projects and donations page issues", "standardized subtask - URL pending", ""],
    ["UAT-01", "Validate projects and donations page with target users", "standardized subtask - URL pending", ""],
    ["MS-01", "Document projects and donations module in Chapter 4", "standardized subtask - URL pending", ""],
  ],
  WHATIF: [
    ["REQ-01", "Define what-if simulator requirements", "standardized subtask - URL pending", ""],
    ["DES-01", "Design what-if simulator input and output workflow", "standardized subtask - URL pending", ""],
    ["DEV-01", "Build what-if simulator interface", "standardized subtask - URL pending", ""],
    ["TEST-01", "Test scenario input, calculation display, and reset behavior", "standardized subtask - URL pending", ""],
    ["FIX-01", "Resolve what-if simulator issues", "standardized subtask - URL pending", ""],
    ["UAT-01", "Validate what-if simulator with target users", "standardized subtask - URL pending", ""],
    ["MS-01", "Document what-if simulator module in Chapter 4", "standardized subtask - URL pending", ""],
  ],
  BUDGET: [
    ["REQ-01", "Define budget page requirements", "planning/backlog", "https://app.clickup.com/t/86d3bwnnq"],
    ["DES-01", "Design budget page interface and workflow", "planning/backlog", "https://app.clickup.com/t/86d3bwnpb"],
    ["DEV-01", "Build budget page interface", "planning/backlog", "https://app.clickup.com/t/86d3bwnpy"],
    ["TEST-01", "Test budget page display, totals, filters, and validation", "planning/backlog", "https://app.clickup.com/t/86d3bwnqd"],
    ["FIX-01", "Resolve budget page issues", "planning/backlog", "https://app.clickup.com/t/86d3bwnr7"],
    ["UAT-01", "Validate budget page with target users", "planning/backlog", "https://app.clickup.com/t/86d3bwnrz"],
    ["MS-01", "Document budget page module in Chapter 4", "planning/backlog", "https://app.clickup.com/t/86d3bwntd"],
  ],
  EVENTS: [
    ["REQ-01", "Define events page requirements", "planning/backlog", "https://app.clickup.com/t/86d3bwp2n"],
    ["DES-01", "Design events page interface and calendar workflow", "planning/backlog", "https://app.clickup.com/t/86d3bwp2z"],
    ["DEV-01", "Build events page interface", "planning/backlog", "https://app.clickup.com/t/86d3bwp3a"],
    ["TEST-01", "Test event creation, editing, viewing, filtering, and validation", "planning/backlog", "https://app.clickup.com/t/86d3bwp3w"],
    ["FIX-01", "Resolve events page issues", "planning/backlog", "https://app.clickup.com/t/86d3bwp4c"],
    ["UAT-01", "Validate events page with target users", "planning/backlog", "https://app.clickup.com/t/86d3bwp4t"],
    ["MS-01", "Document events page module in Chapter 4", "planning/backlog", "https://app.clickup.com/t/86d3bwp8g"],
  ],
  ANNC: [
    ["REQ-01", "Define announcements page requirements", "standardized subtask - URL pending", ""],
    ["DES-01", "Design announcements page and notification display", "planning/backlog", "https://app.clickup.com/t/86d390g9n"],
    ["DEV-01", "Build announcements page interface", "standardized subtask - URL pending", ""],
    ["TEST-01", "Test announcement creation, editing, publishing, and display", "standardized subtask - URL pending", ""],
    ["FIX-01", "Resolve announcements page issues", "standardized subtask - URL pending", ""],
    ["UAT-01", "Validate announcements page with target users", "standardized subtask - URL pending", ""],
    ["MS-01", "Document announcements module in Chapter 4", "standardized subtask - URL pending", ""],
  ],
  REPORT: [
    ["REQ-01", "Define report viewing and export requirements", "planning/backlog", "https://app.clickup.com/t/86d390bx9"],
    ["DES-01", "Design report viewing interface", "planning/backlog", "https://app.clickup.com/t/86d390bz6"],
    ["DEV-01", "Build report list and viewing page", "planning/backlog", "https://app.clickup.com/t/86d390c0j"],
    ["DEV-02", "Add report filters and search function", "planning/backlog", "https://app.clickup.com/t/86d390c1q"],
    ["DEV-03", "Add export button and download behavior", "planning/backlog", "https://app.clickup.com/t/86d390c39"],
    ["TEST-01", "Test report viewing and export behavior", "planning/backlog", "https://app.clickup.com/t/86d390c6b"],
    ["FIX-01", "Resolve report display and export issues", "planning/backlog", "https://app.clickup.com/t/86d390c85"],
    ["UAT-01", "Validate report viewing and export with target users", "planning/backlog", "https://app.clickup.com/t/86d390ca9"],
    ["MS-01", "Document report interface in Chapter 4", "planning/backlog", "https://app.clickup.com/t/86d390cbj"],
  ],
  CHAT: [
    ["REQ-01", "Define AI chatbot interface requirements", "planning/backlog", "https://app.clickup.com/t/86d3904z7"],
    ["DES-01", "Design chatbot widget and conversation layout", "planning/backlog", "https://app.clickup.com/t/86d390507"],
    ["DEV-01", "Build chatbot UI component", "planning/backlog", "https://app.clickup.com/t/86d39050y"],
    ["DEV-02", "Connect chatbot to AI response API", "planning/backlog", "https://app.clickup.com/t/86d390520"],
    ["DEV-03", "Add financial context and health score integration", "planning/backlog", "https://app.clickup.com/t/86d390533"],
    ["TEST-01", "Test chatbot responses and financial context accuracy", "planning/backlog", "https://app.clickup.com/t/86d39053w"],
    ["FIX-01", "Resolve chatbot interface and response issues", "planning/backlog", "https://app.clickup.com/t/86d39054y"],
    ["UAT-01", "Validate chatbot usefulness with target users", "planning/backlog", "https://app.clickup.com/t/86d39056p"],
    ["MS-01", "Document AI chatbot interface in Chapter 4", "planning/backlog", "https://app.clickup.com/t/86d39057y"],
  ],
  ANALYTICS: [
    ["REQ-01", "Define analytics dashboard requirements", "planning/backlog", "https://app.clickup.com/t/86d390cmy"],
    ["DES-01", "Design analytics dashboard wireframe", "planning/backlog", "https://app.clickup.com/t/86d390cpj"],
    ["DEV-01", "Build analytics dashboard layout", "planning/backlog", "https://app.clickup.com/t/86d390fba"],
    ["DEV-02", "Add financial health classification display", "planning/backlog", "https://app.clickup.com/t/86d390fcd"],
    ["DEV-03", "Add forecasting output display", "planning/backlog", "https://app.clickup.com/t/86d390fe3"],
    ["DEV-04", "Add recommendation output display", "planning/backlog", "https://app.clickup.com/t/86d390ffd"],
    ["DEV-05", "Connect analytics dashboard to backend API", "planning/backlog", "https://app.clickup.com/t/86d390fhr"],
    ["TEST-01", "Test analytics dashboard outputs", "planning/backlog", "https://app.clickup.com/t/86d390fkp"],
    ["FIX-01", "Resolve analytics display and data issues", "planning/backlog", "https://app.clickup.com/t/86d390fqf"],
    ["UAT-01", "Validate analytics dashboard with target users", "planning/backlog", "https://app.clickup.com/t/86d390fyb"],
    ["MS-01", "Document analytics dashboard in Chapter 4", "planning/backlog", "https://app.clickup.com/t/86d390g08"],
  ],
  FS: [
    ["REQ-01", "Define financial statement upload requirements", "planning/backlog", "https://app.clickup.com/t/86d390j60"],
    ["DES-01", "Design financial statement upload interface", "planning/backlog", "https://app.clickup.com/t/86d390j77"],
    ["DEV-01", "Build financial statement upload form", "planning/backlog", "https://app.clickup.com/t/86d390jhb"],
    ["DEV-02", "Add financial statement preview display", "planning/backlog", "https://app.clickup.com/t/86d390jjd"],
    ["DEV-03", "Connect financial statement upload to backend API", "planning/backlog", "https://app.clickup.com/t/86d390jm9"],
    ["TEST-01", "Test financial statement upload and preview", "planning/backlog", "https://app.clickup.com/t/86d390jnp"],
    ["FIX-01", "Resolve financial statement upload issues", "planning/backlog", "https://app.clickup.com/t/86d390jq6"],
    ["UAT-01", "Validate financial statement upload with target users", "planning/backlog", "https://app.clickup.com/t/86d390jra"],
    ["MS-01", "Document financial statement upload interface", "planning/backlog", "https://app.clickup.com/t/86d390jtr"],
  ],
  NOTIF: [
    ["REQ-01", "Define notification UI requirements", "planning/backlog", "https://app.clickup.com/t/86d3bwpdz"],
    ["DES-01", "Design notification display and read-state workflow", "planning/backlog", "https://app.clickup.com/t/86d3bwpg7"],
    ["DEV-01", "Build notification display and read-state UI", "planning/backlog", "https://app.clickup.com/t/86d3bwpnc"],
    ["TEST-01", "Test notification visibility, dismissal, and state behavior", "planning/backlog", "https://app.clickup.com/t/86d3bwpnw"],
    ["FIX-01", "Resolve notification UI issues", "planning/backlog", "https://app.clickup.com/t/86d3bwppd"],
    ["UAT-01", "Validate notifications with target users", "planning/backlog", "https://app.clickup.com/t/86d3bwpq4"],
    ["MS-01", "Document notification feature in Chapter 4", "planning/backlog", "https://app.clickup.com/t/86d3bwpqz"],
  ],
  ARCHIVES: [
    ["REQ-01", "Define archive UI requirements", "planning/backlog", "https://app.clickup.com/t/86d3bwq4v"],
    ["DES-01", "Design archive listing and restore workflow", "planning/backlog", "https://app.clickup.com/t/86d3bwq5p"],
    ["DEV-01", "Build archive listing and restore controls", "planning/backlog", "https://app.clickup.com/t/86d3bwq62"],
    ["TEST-01", "Test archive and restore workflows for supported records", "planning/backlog", "https://app.clickup.com/t/86d3bwq6h"],
    ["FIX-01", "Resolve archive management UI issues", "planning/backlog", "https://app.clickup.com/t/86d3bwq84"],
    ["UAT-01", "Validate archive workflows with target users", "planning/backlog", "https://app.clickup.com/t/86d3bwq8u"],
    ["MS-01", "Document archive management feature in Chapter 4", "planning/backlog", "https://app.clickup.com/t/86d3bwq9e"],
  ],
  FINBACKUP: [
    ["REQ-01", "Define backup input data requirements", "planning/backlog", "https://app.clickup.com/t/86d3bwqhr"],
    ["DES-01", "Design backup input storage and staging structure", "planning/backlog", "https://app.clickup.com/t/86d3bwqja"],
    ["DEV-01", "Build backup input storage and staging structure", "planning/backlog", "https://app.clickup.com/t/86d3bwqkn"],
    ["TEST-01", "Test duplicate handling, validation rules, and import constraints", "planning/backlog", "https://app.clickup.com/t/86d3bwqkz"],
    ["FIX-01", "Resolve financial backup input storage issues", "planning/backlog", "https://app.clickup.com/t/86d3bwqpk"],
    ["MS-01", "Document financial backup input storage design", "planning/backlog", "https://app.clickup.com/t/86d3bwqq9"],
  ],
  AUTH: [
    ["REQ-01", "Define authentication and role access requirements", "planning/backlog", "https://app.clickup.com/t/86d3901rz"],
    ["DES-01", "Create authentication flow diagram", "planning/backlog", "https://app.clickup.com/t/86d3901tv"],
    ["DEV-01", "Implement login endpoint", "planning/backlog", "https://app.clickup.com/t/86d3901up"],
    ["DEV-02", "Implement logout and session handling", "planning/backlog", "https://app.clickup.com/t/86d3901vx"],
    ["DEV-03", "Implement role-based access control", "planning/backlog", "https://app.clickup.com/t/86d3901ww"],
    ["TEST-01", "Test valid and invalid authentication attempts", "planning/backlog", "https://app.clickup.com/t/86d3901xz"],
    ["FIX-01", "Resolve authentication and session issues", "planning/backlog", "https://app.clickup.com/t/86d3901yk"],
    ["UAT-01", "Validate user access based on assigned roles", "planning/backlog", "https://app.clickup.com/t/86d390202"],
    ["MS-01", "Document authentication and role access process", "planning/backlog", "https://app.clickup.com/t/86d390213"],
  ],
  BUDGETAPI: [
    ["REQ-01", "Define budget API requirements", "planning/backlog", "https://app.clickup.com/t/86d3bwntu"],
    ["DES-01", "Design budget API request, response, and validation structure", "planning/backlog", "https://app.clickup.com/t/86d3bwnub"],
    ["DEV-01", "Build budget API endpoints", "planning/backlog", "https://app.clickup.com/t/86d3bwnuw"],
    ["TEST-01", "Test budget API validation and responses", "planning/backlog", "https://app.clickup.com/t/86d3bwnzn"],
    ["FIX-01", "Resolve budget API issues", "planning/backlog", "https://app.clickup.com/t/86d3bwp0e"],
    ["UAT-01", "Validate budget API with frontend workflow", "planning/backlog", "https://app.clickup.com/t/86d3bwp1a"],
    ["MS-01", "Document budget API process", "planning/backlog", "https://app.clickup.com/t/86d3bwp27"],
  ],
  EVENTAPI: [
    ["REQ-01", "Define events API requirements", "planning/backlog", "https://app.clickup.com/t/86d3bwp8y"],
    ["DES-01", "Design event API request, response, and validation structure", "planning/backlog", "https://app.clickup.com/t/86d3bwp9q"],
    ["DEV-01", "Build event CRUD endpoints", "planning/backlog", "https://app.clickup.com/t/86d3bwpaa"],
    ["TEST-01", "Test event API validation and persistence", "planning/backlog", "https://app.clickup.com/t/86d3bwpat"],
    ["FIX-01", "Resolve events API issues", "planning/backlog", "https://app.clickup.com/t/86d3bwpb9"],
    ["UAT-01", "Validate events API with frontend workflow", "planning/backlog", "https://app.clickup.com/t/86d3bwpbr"],
    ["MS-01", "Document events API process", "planning/backlog", "https://app.clickup.com/t/86d3bwpcx"],
  ],
  NOTIFAPI: [
    ["REQ-01", "Define notification API requirements", "planning/backlog", "https://app.clickup.com/t/86d3bwpub"],
    ["DES-01", "Design notification generation and read-state API flow", "planning/backlog", "https://app.clickup.com/t/86d3bwpv1"],
    ["DEV-01", "Build notification generation and retrieval logic", "planning/backlog", "https://app.clickup.com/t/86d3bwpvt"],
    ["TEST-01", "Test notification targeting and read-state updates", "planning/backlog", "https://app.clickup.com/t/86d3bwpww"],
    ["FIX-01", "Resolve notification API issues", "planning/backlog", "https://app.clickup.com/t/86d3bwpxv"],
    ["UAT-01", "Validate notification API with frontend workflow", "planning/backlog", "https://app.clickup.com/t/86d3bwq3v"],
    ["MS-01", "Document notification API process", "planning/backlog", "https://app.clickup.com/t/86d3bwq4d"],
  ],
  ARCHIVEAPI: [
    ["REQ-01", "Define archive API requirements", "planning/backlog", "https://app.clickup.com/t/86d3bwq9y"],
    ["DES-01", "Design archive and restore API flow", "planning/backlog", "https://app.clickup.com/t/86d3bwqdq"],
    ["DEV-01", "Build archive and restore API logic", "planning/backlog", "https://app.clickup.com/t/86d3bwqea"],
    ["TEST-01", "Test archive permissions and restore behavior", "planning/backlog", "https://app.clickup.com/t/86d3bwqff"],
    ["FIX-01", "Resolve archive API issues", "planning/backlog", "https://app.clickup.com/t/86d3bwqgd"],
    ["UAT-01", "Validate archive API with frontend workflow", "planning/backlog", "https://app.clickup.com/t/86d3bwqgw"],
    ["MS-01", "Document archive API process", "planning/backlog", "https://app.clickup.com/t/86d3bwqh9"],
  ],
  FINBACKUPAPI: [
    ["REQ-01", "Define financial backup input API requirements", "planning/backlog", "https://app.clickup.com/t/86d3bwqqm"],
    ["DES-01", "Design backup upload and import endpoint flow", "planning/backlog", "https://app.clickup.com/t/86d3bwqr1"],
    ["DEV-01", "Build backup upload and import endpoint", "planning/backlog", "https://app.clickup.com/t/86d3bwqru"],
    ["TEST-01", "Test import errors, duplicates, and validation", "planning/backlog", "https://app.clickup.com/t/86d3bwqtn"],
    ["FIX-01", "Resolve financial backup API issues", "planning/backlog", "https://app.clickup.com/t/86d3bwquh"],
    ["UAT-01", "Validate financial backup API with upload workflow", "planning/backlog", "https://app.clickup.com/t/86d3bwqv9"],
    ["MS-01", "Document financial backup input API process", "planning/backlog", "https://app.clickup.com/t/86d3bwqw4"],
  ],
  GEO: [
    ["REQ-01", "Define geospatial institution map requirements", "planning/backlog", "https://app.clickup.com/t/86d3906ne"],
    ["DES-01", "Design geospatial map interface", "planning/backlog", "https://app.clickup.com/t/86d3906qu"],
    ["DEV-01", "Build geospatial institution map layout", "planning/backlog", "https://app.clickup.com/t/86d3906t0"],
    ["DEV-02", "Add institution markers and filters", "planning/backlog", "https://app.clickup.com/t/86d3906v8"],
    ["DEV-03", "Connect geospatial map to institution data", "planning/backlog", "https://app.clickup.com/t/86d3906xe"],
    ["TEST-01", "Test map display and filters", "planning/backlog", "https://app.clickup.com/t/86d3906ym"],
    ["FIX-01", "Resolve geospatial map issues", "planning/backlog", "https://app.clickup.com/t/86d3906zr"],
    ["UAT-01", "Validate geospatial map with target users", "planning/backlog", "https://app.clickup.com/t/86d390720"],
    ["MS-01", "Document geospatial map interface in Chapter 4", "planning/backlog", "https://app.clickup.com/t/86d39074t"],
  ],
  PRST: [
    ["REQ-01", "Define priest health tracker requirements", "planning/backlog", "https://app.clickup.com/t/86d3904e2"],
    ["DES-01", "Design priest health tracker interface", "planning/backlog", "https://app.clickup.com/t/86d3904f1"],
    ["DEV-01", "Build priest health profile page", "planning/backlog", "https://app.clickup.com/t/86d3904g5"],
    ["DEV-02", "Build health record entry and update flow", "planning/backlog", "https://app.clickup.com/t/86d3904h0"],
    ["DEV-03", "Connect priest health tracker to backend API", "planning/backlog", "https://app.clickup.com/t/86d3904hb"],
    ["TEST-01", "Test priest health tracker workflows", "planning/backlog", "https://app.clickup.com/t/86d3904j9"],
    ["FIX-01", "Resolve priest health tracker issues", "planning/backlog", "https://app.clickup.com/t/86d3904k4"],
    ["UAT-01", "Validate priest health tracker with target users", "planning/backlog", "https://app.clickup.com/t/86d3904my"],
    ["MS-01", "Document priest health tracker in Chapter 4", "planning/backlog", "https://app.clickup.com/t/86d3904p9"],
  ],
  IAFR: [
    ["REQ-01", "Define IAFR upload and encoding requirements", "planning/backlog", "https://app.clickup.com/t/86d390jyp"],
    ["DES-01", "Design IAFR upload and entry interface", "planning/backlog", "https://app.clickup.com/t/86d390jzv"],
    ["DEV-01", "Build IAFR upload form", "planning/backlog", "https://app.clickup.com/t/86d390k11"],
    ["DEV-02", "Build IAFR manual data entry fields", "planning/backlog", "https://app.clickup.com/t/86d390k25"],
    ["DEV-03", "Connect IAFR interface to backend API", "planning/backlog", "https://app.clickup.com/t/86d390k3m"],
    ["TEST-01", "Test IAFR file upload and manual entry", "planning/backlog", "https://app.clickup.com/t/86d390k5x"],
    ["FIX-01", "Resolve IAFR interface and validation issues", "planning/backlog", "https://app.clickup.com/t/86d390k85"],
    ["UAT-01", "Validate IAFR upload with target users", "planning/backlog", "https://app.clickup.com/t/86d390k9w"],
    ["MS-01", "Document IAFR interface in Chapter 4", "planning/backlog", "https://app.clickup.com/t/86d390ke6"],
  ],
  AUDITLOG: [
    ["REQ-01", "Define audit log viewing interface requirements", "planning/backlog", "https://app.clickup.com/t/86d3903tx"],
    ["DES-01", "Design audit log timeline and detail panel layout", "planning/backlog", "https://app.clickup.com/t/86d3903wq"],
    ["DEV-01", "Build audit log timeline and category filter interface", "planning/backlog", "https://app.clickup.com/t/86d3903yt"],
    ["DEV-02", "Build field-level change detail panel", "planning/backlog", "https://app.clickup.com/t/86d390410"],
    ["DEV-03", "Add audit log CSV export functionality", "planning/backlog", "https://app.clickup.com/t/86d39041k"],
    ["TEST-01", "Test audit log display and field diff rendering", "planning/backlog", "https://app.clickup.com/t/86d39042r"],
    ["FIX-01", "Resolve audit log interface and data issues", "planning/backlog", "https://app.clickup.com/t/86d39043x"],
    ["UAT-01", "Validate audit log visibility with admin users", "planning/backlog", "https://app.clickup.com/t/86d39044m"],
    ["MS-01", "Document audit log interface in Chapter 4", "planning/backlog", "https://app.clickup.com/t/86d390454"],
  ],
  ADMIN: [
    ["REQ-01", "Define admin management requirements", "planning/backlog", "https://app.clickup.com/t/86d390337"],
    ["DES-01", "Design admin management interface", "planning/backlog", "https://app.clickup.com/t/86d390344"],
    ["DEV-01", "Build user management page", "planning/backlog", "https://app.clickup.com/t/86d39034u"],
    ["DEV-02", "Build role and permission management page", "planning/backlog", "https://app.clickup.com/t/86d39035y"],
    ["DEV-03", "Connect admin interface to backend APIs", "planning/backlog", "https://app.clickup.com/t/86d39036k"],
    ["TEST-01", "Test admin management actions", "planning/backlog", "https://app.clickup.com/t/86d39037j"],
    ["FIX-01", "Resolve admin interface and permission issues", "planning/backlog", "https://app.clickup.com/t/86d390397"],
    ["UAT-01", "Validate admin management with authorized users", "planning/backlog", "https://app.clickup.com/t/86d3903ax"],
    ["MS-01", "Document admin management module", "planning/backlog", "https://app.clickup.com/t/86d3903cy"],
  ],
  INSTAPI: [
    ["REQ-01", "Define institution API requirements", "planning/backlog", "https://app.clickup.com/t/86d3904jd"],
    ["DES-01", "Design institution API structure", "planning/backlog", "https://app.clickup.com/t/86d3904k6"],
    ["DEV-01", "Implement create institution endpoint", "planning/backlog", "https://app.clickup.com/t/86d3904mc"],
    ["DEV-02", "Implement view and update institution endpoints", "planning/backlog", "https://app.clickup.com/t/86d3904ne"],
    ["DEV-03", "Implement institution status and category logic", "planning/backlog", "https://app.clickup.com/t/86d3904tc"],
    ["TEST-01", "Test institution API requests and responses", "planning/backlog", "https://app.clickup.com/t/86d3904vm"],
    ["FIX-01", "Resolve institution API errors", "planning/backlog", "https://app.clickup.com/t/86d3904x5"],
    ["MS-01", "Document institution API process", "planning/backlog", "https://app.clickup.com/t/86d3904y8"],
  ],
  PROJAPI: [
    ["REQ-01", "Define projects and donations API requirements", "planning/backlog", "https://app.clickup.com/t/86d3906bh"],
    ["DES-01", "Design projects and donations API structure", "planning/backlog", "https://app.clickup.com/t/86d3906c7"],
    ["DEV-01", "Implement create and update project endpoints", "planning/backlog", "https://app.clickup.com/t/86d3906cq"],
    ["DEV-02", "Implement donation and expense recording endpoints", "planning/backlog", "https://app.clickup.com/t/86d3906d4"],
    ["DEV-03", "Implement project status and health scoring logic", "planning/backlog", "https://app.clickup.com/t/86d3906dr"],
    ["TEST-01", "Test projects and donations API requests and responses", "planning/backlog", "https://app.clickup.com/t/86d3906en"],
    ["FIX-01", "Resolve projects and donations API errors", "planning/backlog", "https://app.clickup.com/t/86d3906f3"],
    ["UAT-01", "Validate projects and donations API with target users", "planning/backlog", "https://app.clickup.com/t/86d3906fd"],
    ["MS-01", "Document projects and donations API process", "planning/backlog", "https://app.clickup.com/t/86d3906gq"],
  ],
  ANNCAPI: [
    ["REQ-01", "Define announcements API requirements", "planning/backlog", "https://app.clickup.com/t/86d3906ty"],
    ["DES-01", "Design announcements API structure", "planning/backlog", "https://app.clickup.com/t/86d3906vf"],
    ["DEV-01", "Implement announcements retrieval endpoint", "planning/backlog", "https://app.clickup.com/t/86d3906wu"],
    ["DEV-02", "Implement announcement creation and deletion endpoints", "planning/backlog", "https://app.clickup.com/t/86d3906y0"],
    ["TEST-01", "Test announcements API requests and responses", "planning/backlog", "https://app.clickup.com/t/86d3906zj"],
    ["FIX-01", "Resolve announcements API errors", "planning/backlog", "https://app.clickup.com/t/86d39070d"],
    ["UAT-01", "Validate announcements API with target users", "planning/backlog", "https://app.clickup.com/t/86d39071k"],
    ["MS-01", "Document announcements API process", "planning/backlog", "https://app.clickup.com/t/86d39073j"],
  ],
  FSAPI: [
    ["REQ-01", "Define financial statement processing requirements", "planning/backlog", "https://app.clickup.com/t/86d3905n3"],
    ["DES-01", "Map financial statement fields to database structure", "planning/backlog", "https://app.clickup.com/t/86d3905p3"],
    ["DEV-01", "Build financial statement upload endpoint", "planning/backlog", "https://app.clickup.com/t/86d3905pt"],
    ["DEV-02", "Implement financial statement validation logic", "planning/backlog", "https://app.clickup.com/t/86d3905qp"],
    ["DEV-03", "Implement financial statement data saving logic", "planning/backlog", "https://app.clickup.com/t/86d3905rv"],
    ["TEST-01", "Test financial statement processing using sample records", "planning/backlog", "https://app.clickup.com/t/86d3905tg"],
    ["FIX-01", "Resolve financial statement processing errors", "planning/backlog", "https://app.clickup.com/t/86d3905u8"],
    ["UAT-01", "Validate financial statement processing with target users", "planning/backlog", "https://app.clickup.com/t/86d3905w3"],
    ["MS-01", "Document financial statement processing workflow", "planning/backlog", "https://app.clickup.com/t/86d3905x7"],
  ],
  IAFRAPI: [
    ["REQ-01", "Define IAFR processing requirements", "planning/backlog", "https://app.clickup.com/t/86d390525"],
    ["DES-01", "Map IAFR fields to database structure", "planning/backlog", "https://app.clickup.com/t/86d39052z"],
    ["DEV-01", "Build IAFR upload endpoint", "planning/backlog", "https://app.clickup.com/t/86d39053t"],
    ["DEV-02", "Implement IAFR validation logic", "planning/backlog", "https://app.clickup.com/t/86d39054f"],
    ["DEV-03", "Implement IAFR data saving logic", "planning/backlog", "https://app.clickup.com/t/86d39059t"],
    ["TEST-01", "Test IAFR processing using sample records", "planning/backlog", "https://app.clickup.com/t/86d3905b8"],
    ["FIX-01", "Resolve IAFR processing and validation errors", "planning/backlog", "https://app.clickup.com/t/86d3905cy"],
    ["UAT-01", "Validate IAFR processing with target users", "planning/backlog", "https://app.clickup.com/t/86d3905ep"],
    ["MS-01", "Document IAFR processing workflow", "planning/backlog", "https://app.clickup.com/t/86d3905hh"],
  ],
  ANALYTICSAPI: [
    ["REQ-01", "Define analytics API requirements", "planning/backlog", "https://app.clickup.com/t/86d390b0f"],
    ["DES-01", "Design analytics API response structure", "planning/backlog", "https://app.clickup.com/t/86d390b2c"],
    ["DEV-01", "Build financial health result endpoint", "planning/backlog", "https://app.clickup.com/t/86d390b55"],
    ["DEV-02", "Build forecasting result endpoint", "planning/backlog", "https://app.clickup.com/t/86d390b6u"],
    ["DEV-03", "Build recommendation result endpoint", "planning/backlog", "https://app.clickup.com/t/86d390b84"],
    ["TEST-01", "Test analytics API responses", "planning/backlog", "https://app.clickup.com/t/86d390b9c"],
    ["FIX-01", "Resolve analytics API errors", "planning/backlog", "https://app.clickup.com/t/86d390bb3"],
    ["UAT-01", "Validate analytics API outputs with target users", "planning/backlog", "https://app.clickup.com/t/86d390bda"],
    ["MS-01", "Document analytics API process", "planning/backlog", "https://app.clickup.com/t/86d390ber"],
  ],
  PRSTAPI: [
    ["REQ-01", "Define priest health records API requirements", "planning/backlog", "https://app.clickup.com/t/86d39085p"],
    ["DES-01", "Design priest health API structure", "planning/backlog", "https://app.clickup.com/t/86d39086r"],
    ["DEV-01", "Implement priest health record endpoint", "planning/backlog", "https://app.clickup.com/t/86d39087w"],
    ["DEV-02", "Implement health record update endpoint", "planning/backlog", "https://app.clickup.com/t/86d390899"],
    ["DEV-03", "Implement priest health validation logic", "planning/backlog", "https://app.clickup.com/t/86d3908pc"],
    ["TEST-01", "Test priest health API requests and responses", "planning/backlog", "https://app.clickup.com/t/86d3908vc"],
    ["FIX-01", "Resolve priest health API errors", "planning/backlog", "https://app.clickup.com/t/86d3908yc"],
    ["UAT-01", "Validate priest health API with target users", "planning/backlog", "https://app.clickup.com/t/86d39091e"],
    ["MS-01", "Document priest health API process", "planning/backlog", "https://app.clickup.com/t/86d39099u"],
  ],
  PRSTDB: [
    ["REQ-01", "Define priest health database requirements", "planning/backlog", "https://app.clickup.com/t/86d38zzqh"],
    ["DES-01", "Design priest health records table", "planning/backlog", "https://app.clickup.com/t/86d38zzr8"],
    ["DEV-01", "Create priest health records table", "planning/backlog", "https://app.clickup.com/t/86d38zzwj"],
    ["DEV-02", "Configure priest health table constraints", "planning/backlog", "https://app.clickup.com/t/86d38zzxm"],
    ["TEST-01", "Test priest health data storage and retrieval", "planning/backlog", "https://app.clickup.com/t/86d39000b"],
    ["FIX-01", "Resolve priest health database errors", "planning/backlog", "https://app.clickup.com/t/86d39002q"],
    ["MS-01", "Document priest health database structure", "planning/backlog", "https://app.clickup.com/t/86d39004y"],
  ],
  IAFRDB: [
    ["REQ-01", "Define IAFR database field requirements", "planning/backlog", "https://app.clickup.com/t/86d38zu1h"],
    ["DES-01", "Design IAFR table structure", "planning/backlog", "https://app.clickup.com/t/86d38zu32"],
    ["DEV-01", "Create IAFR tables", "planning/backlog", "https://app.clickup.com/t/86d38zu4u"],
    ["DEV-02", "Configure IAFR validation constraints", "planning/backlog", "https://app.clickup.com/t/86d38zu7n"],
    ["DEV-03", "Configure IAFR relationships with institution tables", "planning/backlog", "https://app.clickup.com/t/86d38zvuq"],
    ["TEST-01", "Test IAFR data storage and retrieval", "planning/backlog", "https://app.clickup.com/t/86d38zvwv"],
    ["FIX-01", "Resolve IAFR database errors", "planning/backlog", "https://app.clickup.com/t/86d38zvym"],
    ["MS-01", "Document IAFR database structure", "planning/backlog", "https://app.clickup.com/t/86d38zw0b"],
  ],
  REPORTAPI: standardSubtasks("report generation API"),
  CHATAPI: standardSubtasks("AI chatbot API"),
  AUDIT: standardSubtasks("audit trail and activity log API"),
  USERDB: standardSubtasks("user and role tables", "Chapter 3"),
  INSTDB: standardSubtasks("institution tables", "Chapter 3"),
  FSDB: standardSubtasks("financial statement tables", "Chapter 3"),
  PROJDB: standardSubtasks("projects and donations tables", "Chapter 3"),
  ANALYTICSDB: standardSubtasks("analytics output tables", "Chapter 3"),
  SANDBOX: standardSubtasks("sandbox and model testing schema", "Chapter 3"),
  BACKUP: standardSubtasks("backup and recovery setup", "Chapter 3"),
  RATIO: standardSubtasks("financial ratio analysis module"),
  HEALTH: standardSubtasks("financial health classification model"),
  FORECAST: standardSubtasks("short-term financial forecasting module"),
  RECO: standardSubtasks("decision-support recommendation model"),
  HOST: standardSubtasks("hosting and deployment setup"),
  UAT: standardSubtasks("user acceptance testing and final validation"),
  "MS-01": standardSubtasks("Chapter 3 Agile Kanban methodology revision", "Chapter 3"),
  "MS-02": standardSubtasks("Kanban literature additions", "Chapter 2"),
  "MS-03": standardSubtasks("ClickUp tool discussion", "Chapter 2"),
  "MS-04": standardSubtasks("Chapter 4 results and testing discussion", "Chapter 4"),
  "MS-05": standardSubtasks("Chapter 5 conclusions and recommendations", "Chapter 5"),
  "MS-06": standardSubtasks("appendix materials and supporting evidence", "appendices"),
  LITCAL: [
    ["BUS-01", "Define liturgical calendar data requirements and seasonality use", "planning/backlog", "https://app.clickup.com/t/86d390k32"],
    ["DU-01", "Review liturgical calendar data sources and cross-validators", "planning/backlog", "https://app.clickup.com/t/86d390k61"],
    ["SRC-01", "Prepare GCATHOLIC source mapping for liturgical calendar ingestion", "planning/backlog", "https://app.clickup.com/t/86d3bwr22"],
    ["SRC-02", "Prepare LITCAL source mapping for liturgical calendar ingestion", "planning/backlog", "https://app.clickup.com/t/86d3bwr2p"],
    ["SRC-03", "Prepare ROMCAL source mapping for liturgical calendar ingestion", "planning/backlog", "https://app.clickup.com/t/86d3bwr3c"],
    ["DP-01", "Build liturgical calendar data ingestion pipeline", "planning/backlog", "https://app.clickup.com/t/86d390k9n"],
    ["MODEL-01", "Implement calendar validation and cross-check logic", "planning/backlog", "https://app.clickup.com/t/86d390kb3"],
    ["MODEL-02", "Program future calendar generation using pattern searching", "planning/backlog", "https://app.clickup.com/t/86d3bwr48"],
    ["DEP-01", "Load validated liturgical calendar data into database", "planning/backlog", "https://app.clickup.com/t/86d390kn9"],
    ["EVAL-01", "Validate liturgical calendar data accuracy", "planning/backlog", "https://app.clickup.com/t/86d390kf6"],
    ["MS-01", "Document liturgical calendar pipeline process", "planning/backlog", "https://app.clickup.com/t/86d390kpr"],
  ],
  WEATHER: [
    ["BUS-01", "Define weather data requirements and use in analytics", "planning/backlog", "https://app.clickup.com/t/86d39pntt"],
    ["DU-01", "Review weather data sources and APIs", "planning/backlog", "https://app.clickup.com/t/86d39pnrf"],
    ["EXT-01", "Extract weather data from selected source APIs or datasets", "planning/backlog", "https://app.clickup.com/t/86d3bwr15"],
    ["DP-01", "Build weather data ingestion pipeline", "planning/backlog", "https://app.clickup.com/t/86d39pnrg"],
    ["MODEL-01", "Implement weather data validation and cross-check logic", "planning/backlog", "https://app.clickup.com/t/86d39pnrh"],
    ["DEP-01", "Load validated weather data into database", "planning/backlog", "https://app.clickup.com/t/86d39pnta"],
    ["EVAL-01", "Validate weather data accuracy and completeness", "planning/backlog", "https://app.clickup.com/t/86d39pntv"],
    ["UAT-01", "Validate weather data pipeline with target users", "planning/backlog", "https://app.clickup.com/t/86d39pntd"],
    ["MS-01", "Document weather data collection pipeline process", "planning/backlog", "https://app.clickup.com/t/86d39pntw"],
  ],
};

const theme = {
  dark: "#1F4E78",
  mid: "#D9EAF7",
  light: "#F7FBFD",
  border: "#B7C9D6",
  green: "#E2F0D9",
  amber: "#FFF2CC",
  text: "#1F2933",
};

function taskParts(task) {
  const [code, title, clickupStatus, url] = task;
  return { code, title, clickupStatus, url };
}

function acceptanceCriteria(title) {
  return `Given the PAULUS ${title} task is implemented, the feature should meet the approved capstone requirements and pass review against its expected behavior.`;
}

function style(range, fill, color = theme.text, bold = false) {
  range.format = {
    fill,
    font: { bold, color },
    borders: { preset: "all", style: "thin", color: theme.border },
    wrapText: true,
  };
}

function setWidths(sheet) {
  [95, 260, 430, 120, 135, 135].forEach((width, index) => {
    sheet.getRangeByIndexes(0, index, 1, 1).format.columnWidthPx = width;
  });
}

function addModuleSheet(module) {
  const sheet = workbook.worksheets.add(module.code);
  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(2);
  setWidths(sheet);

  let row = 1;
  const totalCells = [];
  const perTopLevelWeight = module.weight / module.tasks.length;

  for (const rawTask of module.tasks) {
    const task = taskParts(rawTask);
    const children = subtasks[task.code] ?? [];
    const rows = children.length
      ? children.map((child) => {
          const childTask = taskParts(child);
          return [
            childTask.code,
            childTask.title,
            acceptanceCriteria(childTask.title),
            perTopLevelWeight / children.length,
            childTask.clickupStatus,
            false,
          ];
        })
      : [[
          task.code,
          task.title,
          acceptanceCriteria(task.title),
          perTopLevelWeight,
          task.clickupStatus,
          false,
        ]];

    const startRow = row + 2;
    const endRow = startRow + rows.length - 1;
    const totalRow = endRow + 1;

    sheet.getRange(`A${row}:F${row}`).values = [[
      "Task ID",
      task.code,
      "Task Name",
      task.title,
      "ClickUp Status",
      task.clickupStatus,
    ]];
    style(sheet.getRange(`A${row}:F${row}`), theme.dark, "#FFFFFF", true);

    sheet.getRange(`A${row + 1}:F${row + 1}`).values = [[
      "Subtask ID",
      "Subtask / Task Name",
      "Acceptance Criteria",
      "Weight Allocation",
      "ClickUp Status",
      "Accepted",
    ]];
    style(sheet.getRange(`A${row + 1}:F${row + 1}`), theme.mid, theme.text, true);

    sheet.getRange(`A${startRow}:F${endRow}`).values = rows;
    style(sheet.getRange(`A${startRow}:F${endRow}`), "#FFFFFF");
    sheet.getRange(`D${startRow}:D${endRow}`).format.numberFormat = "0.00%";
    sheet.getRange(`F${startRow}:F${endRow}`).dataValidation = {
      rule: { type: "list", values: ["TRUE", "FALSE"] },
    };

    sheet.getRange(`A${totalRow}:F${totalRow}`).values = [["Total Accomplished", "", "", "", "", ""]];
    sheet.getRange(`D${totalRow}`).formulas = [[`=SUM(D${startRow}:D${endRow})`]];
    sheet.getRange(`F${totalRow}`).formulas = [[`=SUMIF(F${startRow}:F${endRow}, TRUE, D${startRow}:D${endRow})`]];
    sheet.getRange(`D${totalRow}:F${totalRow}`).format.numberFormat = "0.00%";
    style(sheet.getRange(`A${totalRow}:F${totalRow}`), theme.green, theme.text, true);
    totalCells.push(`'${module.code}'!F${totalRow}`);

    row = totalRow + 2;
  }

  const summaryRow = row + 1;
  sheet.getRange(`A${summaryRow}:F${summaryRow}`).values = [[
    "Module Accomplishment",
    module.code,
    module.name,
    module.weight,
    "",
    "",
  ]];
  sheet.getRange(`F${summaryRow}`).formulas = [[`=SUM(${totalCells.join(",")})`]];
  sheet.getRange(`D${summaryRow}:F${summaryRow}`).format.numberFormat = "0.00%";
  style(sheet.getRange(`A${summaryRow}:F${summaryRow}`), theme.amber, theme.text, true);

  return { code: module.code, summaryCell: `'${module.code}'!F${summaryRow}`, taskCount: module.tasks.length };
}

const distribution = workbook.worksheets.add("DISTRIBUTION");
distribution.showGridLines = false;
distribution.freezePanes.freezeRows(2);
distribution.getRange("B2:F2").values = [[
  "Module Code",
  "Module Description",
  "ClickUp Task Count",
  "System Weight Allocation",
  "Actual Accomplishment",
]];
style(distribution.getRange("B2:F2"), theme.dark, "#FFFFFF", true);
distribution.getRange("B:B").format.columnWidthPx = 140;
distribution.getRange("C:C").format.columnWidthPx = 340;
distribution.getRange("D:F").format.columnWidthPx = 160;

const summaries = moduleData.map(addModuleSheet);
distribution.getRange(`B3:F${moduleData.length + 2}`).values = moduleData.map((module, index) => [
  module.code,
  module.name,
  summaries[index].taskCount,
  module.weight,
  "",
]);
for (let i = 0; i < moduleData.length; i += 1) {
  distribution.getRange(`F${i + 3}`).formulas = [[`=${summaries[i].summaryCell}`]];
}
const totalRow = moduleData.length + 3;
distribution.getRange(`B${totalRow}:F${totalRow}`).values = [["TOTAL", "PAULUS Project Scope", "", "", ""]];
distribution.getRange(`D${totalRow}`).formulas = [[`=SUM(D3:D${moduleData.length + 2})`]];
distribution.getRange(`E${totalRow}`).formulas = [[`=SUM(E3:E${moduleData.length + 2})`]];
distribution.getRange(`F${totalRow}`).formulas = [[`=SUM(F3:F${moduleData.length + 2})`]];
distribution.getRange(`E3:F${totalRow}`).format.numberFormat = "0.00%";
style(distribution.getRange(`B3:F${moduleData.length + 2}`), "#FFFFFF");
style(distribution.getRange(`B${totalRow}:F${totalRow}`), theme.green, theme.text, true);

const readme = workbook.worksheets.add("README");
readme.showGridLines = false;
readme.getRange("B2:F2").values = [["PAULUS Acceptance Criteria Tracker", "", "", "", ""]];
readme.getRange("B2:F2").merge();
style(readme.getRange("B2:F2"), theme.dark, "#FFFFFF", true);
readme.getRange("B4:F8").values = [
  ["Source", "Built from ClickUp tasks under the PAULUS space fetched on 2026-06-15.", "", "", ""],
  ["Structure", "Workbook keeps the ClickUp module/task grouping and includes task URLs for traceability.", "", "", ""],
  ["Accepted", "Use the Accepted column to mark formal acceptance. ClickUp Status is preserved separately.", "", "", ""],
  ["Formula", "Actual accomplishment uses SUMIF over accepted TRUE values and task weight allocations.", "", "", ""],
  ["Google Sheets", "Formulas use SUM and SUMIF so they should import cleanly into Google Sheets.", "", "", ""],
];
style(readme.getRange("B4:F8"), "#FFFFFF");
readme.getRange("B:B").format.columnWidthPx = 150;
readme.getRange("C:F").format.columnWidthPx = 210;

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula error scan",
  maxChars: 2000,
});
console.log(errors.ndjson);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/paulus_acceptance_criteria_compact_clickup.xlsx`);
console.log(`${outputDir}/paulus_acceptance_criteria_compact_clickup.xlsx`);
