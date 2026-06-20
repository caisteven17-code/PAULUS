# Generates a Word (.docx) file of the Phase 1-5 manual checks, with no
# third-party libraries (a .docx is just a zip of Office Open XML parts).
import zipfile
from xml.sax.saxutils import escape

OUT = r"C:\Users\user\Downloads\NEWEST TO THE NEW CAPSTONE\PAULUS_Manual_Checks_Phase1-5.docx"

# ---- content model -------------------------------------------------------
# ("title"|"h1"|"h2"|"p"|"check"|"code"|"spacer", text)
content = [
    ("title", "PAULUS — Manual Verification Checklist"),
    ("subtitle", "Phases 1–5 · Diocese of San Pablo Financial System"),

    ("h1", "Step 0 — One-time setup"),
    ("p", "Run from the PAULUS folder. Backfill first, then rebuild the backend and start the app."),
    ("code", 'node backfill-phase12.js'),
    ("code", 'node diag-phase12.js   (confirm: schools=2, seminaries=2, Parvs profile reconciled)'),
    ("code", 'npm run build:backend'),
    ("code", 'npm run dev'),
    ("p", "Phases 4 & 5 are frontend-only (npm run dev:frontend is enough for those). Optional: npm run lint --workspace=src/frontend to catch broken imports."),

    ("h1", "Phase 1 — Stop the bleeding  (needs backend rebuild)"),
    ("check", "1.1  Log in as a SCHOOL and a SEMINARY user and create an Event and a Project. Expect: both save with no “400 / could not resolve institution” error."),
    ("check", "1.2b  Log in as CHANCELLOR and open Priest > Simulator. Expect: it works (no “restricted” message)."),
    ("check", "1.2a  Log in as DIOCESAN FINANCE STAFF. Expect: NO Simulator tab in the Priest section."),
    ("check", "1.2c/d  In User Role Control, toggle “Priest Assignment Simulator” for a Seminary role, then log in as that role. Expect: the tab shows/hides AND access allows/denies — they always agree."),
    ("check", "1.3  Log in as user X in browser A. In browser B (as admin) change X’s role. Expect: within ~20s (or when browser A regains focus) a “Role Updated – Sign Out Now” modal appears for X."),

    ("h1", "Phase 2 — Single source of truth  (needs backend rebuild + backfill)"),
    ("check", "2.4a  Home → “Diocesan Institutions” counts match Entity Management exactly (after backfill: 91 / 2 / 2)."),
    ("check", "2.4b  User Management → Add User Account → each Institution Type lists ONLY institutions that exist in Entity Management (no phantom seminaries/schools)."),
    ("check", "2.4c  Priest Simulator → Priest dropdown lists the real parish priests from User Management (not Arzaga / Santos / Mendoza)."),
    ("check", "2.5  Log in as a non-diocese institution user and open the financial Simulator. Expect: you can only see/select YOUR OWN institution’s finances."),
    ("check", "2.6  User Management → open Parvs Obni. Expect: Registration Status = “Registered” and the Birthday is shown (not “—”)."),

    ("h1", "Phase 3 — Business rules  (3.8 & 3.10 need backend rebuild)"),
    ("check", "3.7  Add a 2nd Parish Priest to a parish that already has one. Expect: a confirmation modal appears BEFORE saving (you can still proceed deliberately)."),
    ("check", "3.8  Budget → switch the year to 2021 (past). Expect: inputs read-only + a banner, Save bar hidden. Switch back to 2026 → editable again."),
    ("check", "3.9  Entity Management: Seminaries tab has NO vicariate/class/district columns or filters; Schools tab has Cluster but NO Class; the Add User dropdown shows “(Vicariate)” or “(Cluster N)” in parentheses."),
    ("check", "3.10  Create an event at the DIOCESE level, then open a parish/school/seminary Event tab. Expect: the diocesan event appears there too."),

    ("h1", "Phase 4 — Shared UI  (frontend-only)"),
    ("check", "4.11  Archives → a user with no photo shows their INITIALS (not a blank person). Top-right avatar (and mobile) shows photo if set, else initials."),
    ("check", "4.12  Projects → hover a project → Archive. Expect: “Are you sure you want to archive this?” modal with Cancel / Confirm."),
    ("check", "4.13  Compare parish/seminary/school icons on Home, Entity Management, and Archives. Expect: the same icon per type everywhere."),
    ("check", "4.14  Budget, Projects, and User Management each have a “Filters” button that opens a pop-up modal with a per-institution filter; the button shows an active-filter count badge."),

    ("h1", "Phase 5 — Health Tracker  (frontend-only)"),
    ("check", "5.12  As a DIOCESAN user → Health Tracker → “Add Record”: you can create/submit a medical record on behalf of any priest."),
    ("check", "5.13  Health Tracker → each priest card shows a submission badge: Submitted / Pending this month / “N months late” / “1 year late” (from birth month vs. last check-up)."),
    ("check", "5.14  As an overdue PARISH PRIEST: Health Tracker AND Announcements show a “System · Important” reminder to submit. As a DIOCESAN user: a “N priests haven’t submitted” banner → click → drill-down lists names + late status. Submit a record → that reminder disappears."),
    ("check", "5.15  Health Tracker visual is a distinct dark-header theme (different from Events) with the new reminder banners and status badges."),

    ("h1", "Quick reference — what needs a backend rebuild"),
    ("p", "Needs backend rebuild: 1.1, 2.6, 3.8, 3.10."),
    ("p", "Needs the backfill script: 2.4, 2.6."),
    ("p", "Frontend-only: 1.2, 1.3, 2.5, 3.7, 3.9, and all of Phases 4 & 5."),
]

# ---- OOXML helpers -------------------------------------------------------
def run(text, bold=False, size=None, color=None, font=None):
    rpr = ""
    props = ""
    if bold: props += "<w:b/>"
    if color: props += f'<w:color w:val="{color}"/>'
    if size: props += f'<w:sz w:val="{size*2}"/><w:szCs w:val="{size*2}"/>'
    if font: props += f'<w:rFonts w:ascii="{font}" w:hAnsi="{font}"/>'
    if props: rpr = f"<w:rPr>{props}</w:rPr>"
    return f'<w:r>{rpr}<w:t xml:space="preserve">{escape(text)}</w:t></w:r>'

def para(runs, *, before=0, after=120, shade=None, ind=0):
    ppr = "<w:pPr>"
    ppr += f'<w:spacing w:before="{before}" w:after="{after}"/>'
    if ind: ppr += f'<w:ind w:left="{ind}"/>'
    if shade: ppr += f'<w:shd w:val="clear" w:fill="{shade}"/>'
    ppr += "</w:pPr>"
    return f"<w:p>{ppr}{runs}</w:p>"

body = []
for kind, text in content:
    if kind == "title":
        body.append(para(run(text, bold=True, size=22, color="1A472A"), before=0, after=40))
    elif kind == "subtitle":
        body.append(para(run(text, bold=True, size=12, color="9A7B1E"), after=240))
    elif kind == "h1":
        body.append(para(run(text, bold=True, size=15, color="1A472A"), before=240, after=120))
    elif kind == "h2":
        body.append(para(run(text, bold=True, size=12, color="333333"), before=160, after=80))
    elif kind == "p":
        body.append(para(run(text, size=10, color="333333")))
    elif kind == "code":
        body.append(para(run(text, size=10, font="Consolas", color="1A1A1A"),
                         after=40, shade="F2F2F2", ind=120))
    elif kind == "check":
        runs = run("☐  ", bold=True, size=12, color="9A7B1E") + run(text, size=10, color="222222")
        body.append(para(runs, after=140, ind=60))
    elif kind == "spacer":
        body.append(para(run(""), after=120))

document_xml = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    '<w:body>' + "".join(body) +
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>'
    '<w:pgMar w:top="1080" w:bottom="1080" w:left="1180" w:right="1180"/></w:sectPr>'
    '</w:body></w:document>'
)

content_types = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="xml" ContentType="application/xml"/>'
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    '</Types>'
)

rels = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    '</Relationships>'
)

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", content_types)
    z.writestr("_rels/.rels", rels)
    z.writestr("word/document.xml", document_xml)

print("Wrote:", OUT)
