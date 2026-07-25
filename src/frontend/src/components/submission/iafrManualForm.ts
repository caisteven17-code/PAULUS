export type IAFRSectionCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface IAFRSacramentRow {
  accountCode: string;
  label: string;
  prescribedRate: number;
}

export interface IAFRAmountField {
  key: string;
  accountCode: string;
  label: string;
  subsection: string;
  description?: string;
}

export interface IAFRSpecialCollection {
  date: string;
  displayDate: string;
  label: string;
}

export interface IAFRManualSection {
  code: IAFRSectionCode;
  title: string;
  description: string;
  fields: IAFRAmountField[];
}

export const iafrSacramentRows: IAFRSacramentRow[] = [
  { accountCode: 'A.1.02', label: 'Baptism - Infant', prescribedRate: 200 },
  { accountCode: 'A.1.03', label: 'Baptism - Adult', prescribedRate: 200 },
  { accountCode: 'A.1.04', label: 'Wedding with Mass', prescribedRate: 500 },
  { accountCode: 'A.1.05', label: 'Wedding without Mass', prescribedRate: 400 },
  { accountCode: 'A.1.06', label: 'Funeral Mass', prescribedRate: 300 },
  { accountCode: 'A.1.07', label: 'Funeral Blessings', prescribedRate: 200 },
  { accountCode: 'A.1.08', label: 'Certificates', prescribedRate: 25 },
  { accountCode: 'A.1.09', label: 'Marriage Banns', prescribedRate: 25 },
  { accountCode: 'A.1.10', label: 'Permits', prescribedRate: 120 },
  { accountCode: 'A.2.01', label: 'Confirmation', prescribedRate: 100 },
];

export const iafrSpecialCollections2026: Record<number, IAFRSpecialCollection[]> = {
  1: [
    { date: '2026-01-14', displayDate: 'January 14', label: 'Pro-Nigritis (All Collections - ORDO 2026)' },
    { date: '2026-01-18', displayDate: 'January 18', label: 'Sancta Infantia (All Collections - ORDO 2026)' },
    { date: '2026-01-25', displayDate: 'January 25', label: "National Bible Sunday (All Collections - ORDO 2026)" },
  ],
  2: [
    { date: '2026-02-11', displayDate: 'February 11', label: 'World Day of the Sick (Special Collection - ORDO 2026)' },
    { date: '2026-02-15', displayDate: 'February 15', label: 'Priests Healthcare Fund (Special Collections)' },
    { date: '2026-02-18', displayDate: 'February 18', label: 'Ash Wednesday (Hapag-Asa Collection / Fast to Feed)' },
    { date: '2026-02-22', displayDate: 'February 22', label: 'Opus Sancti Petri (All Collections - ORDO 2026)' },
  ],
  3: [
    { date: '2026-03-01', displayDate: 'March 1', label: 'Diocesan Catechetical Commission (Special Collection)' },
    { date: '2026-03-22', displayDate: 'March 22', label: 'Diocesan Seminaries (Special Collections)' },
    { date: '2026-03-29', displayDate: 'March 29', label: 'Alay Kapwa (Special Collection - ORDO 2026)' },
  ],
  4: [
    { date: '2026-04-02', displayDate: 'April 2', label: 'Holy Thursday (Priests Hospitalization Fund - All Collections)' },
    { date: '2026-04-03', displayDate: 'April 3', label: 'Holy Land (Good Friday Collection)' },
  ],
  5: [
    { date: '2026-05-03', displayDate: 'May 3', label: 'Diocesan Programs for the Poor and the Needy (Special Collections)' },
    { date: '2026-05-17', displayDate: 'May 17', label: "World Communications Sunday (Special Collection)" },
    { date: '2026-05-31', displayDate: 'May 31', label: 'BEC Sunday (Special Collection - ORDO 2026)' },
  ],
  6: [
    { date: '2026-06-07', displayDate: 'June 7', label: 'Diocesan Youth Commission (Special Collection)' },
    { date: '2026-06-28', displayDate: 'June 28', label: "Saint Peter's Pence - Obulum Sancti Petri (All Collections)" },
  ],
  7: [
    { date: '2026-07-05', displayDate: 'July 5', label: 'Diocesan Catechetical Commission (Special Collection)' },
    { date: '2026-07-26', displayDate: 'July 26', label: 'Fil-Mission Sunday (All Collections)' },
  ],
  8: [
    { date: '2026-08-02', displayDate: 'August 2', label: 'Saint John Mary Vianney Sunday (Special Collections)' },
    { date: '2026-08-09', displayDate: 'August 9', label: 'Priests Health Care Fund (Special Collections)' },
    { date: '2026-08-30', displayDate: 'August 30', label: 'Priests Health Care Fund (Special Collections)' },
  ],
  9: [
    { date: '2026-09-06', displayDate: 'September 6', label: 'Saint John Mary Vianney Sunday (Special Collections)' },
    { date: '2026-09-13', displayDate: 'September 13', label: 'Priests Health Care Fund (Special Collections)' },
    { date: '2026-09-27', displayDate: 'September 27', label: 'Priests Health Care Fund (Special Collections)' },
  ],
  10: [
    { date: '2026-10-11', displayDate: 'October 11', label: 'Indigenous People Sunday (Special Collections - ORDO 2026)' },
    { date: '2026-10-18', displayDate: 'October 18', label: 'World Mission Sunday (All Collections - ORDO 2026)' },
    { date: '2026-10-25', displayDate: 'October 25', label: 'Prison Awareness Sunday (Special Collections - ORDO 2026)' },
  ],
  11: [
    { date: '2026-11-01', displayDate: 'November 1', label: 'Diocesan Seminaries (Special Collections)' },
    { date: '2026-11-08', displayDate: 'November 8', label: 'Spiritual Pastoral Formation Year (Special Collections)' },
    { date: '2026-11-15', displayDate: 'November 15', label: 'Priests Health Care Fund (Special Collections)' },
    { date: '2026-11-25', displayDate: 'November 25', label: 'Aid to the Church in Need - Red Wednesday (Special Collection)' },
  ],
  12: [
    { date: '2026-12-06', displayDate: 'December 6 (TBA)', label: 'Diocesan Catechetical Commission (Special Collections)' },
    { date: '2026-12-16', displayDate: 'December 16 (TBA)', label: 'National Youth Day (All Collections - First Simbang Gabi)' },
    { date: '2026-12-27', displayDate: 'December 27', label: 'Holy Family Sunday (Family and Life Commission - Special Collections)' },
  ],
};

export const iafrManualSections: IAFRManualSection[] = [
  {
    code: 'A',
    title: 'Pastoral Fund Receipts',
    description: 'Sacraments, confirmation, and Mass intentions.',
    fields: [
      { key: 'mass_intentions_total', accountCode: 'A.3.01', label: 'Mass Intentions - Total Receipts', subsection: 'mass_intentions' },
      { key: 'mass_intentions_claimed', accountCode: 'A.3.02', label: 'Mass Intentions - Claimed by Parish Priest', subsection: 'mass_intentions' },
    ],
  },
  {
    code: 'B',
    title: 'Parish Fund Receipts',
    description: 'Mass collections, other collections, and other receipts.',
    fields: [
      { key: 'weekday_collections', accountCode: 'B.1.01', label: 'Weekday Collections', subsection: 'mass_collections' },
      { key: 'sunday_collections', accountCode: 'B.1.02', label: 'Sunday Collections', subsection: 'mass_collections' },
      { key: 'saturday_collections', accountCode: 'B.1.03', label: 'Saturday Anticipated Mass Collections', subsection: 'mass_collections' },
      { key: 'rentals', accountCode: 'B.2.01', label: 'Rentals', subsection: 'other_collections' },
      { key: 'mortuary_columbary', accountCode: 'B.2.02', label: 'Mortuary / Columbary', subsection: 'other_collections' },
      { key: 'kandilaan', accountCode: 'B.2.03', label: 'Kandilaan', subsection: 'other_collections' },
      { key: 'donation_boxes', accountCode: 'B.2.04', label: 'Donation Boxes', subsection: 'other_collections' },
      { key: 'envelopes', accountCode: 'B.2.05', label: 'Envelopes', subsection: 'other_collections' },
      { key: 'other_sources', accountCode: 'B.2.06', label: 'Other Sources', subsection: 'other_collections' },
      { key: 'parking_fees', accountCode: 'B.2.07', label: 'Receipts from Parking Fees', subsection: 'other_collections' },
      { key: 'donations', accountCode: 'B.3.01', label: 'Donations', subsection: 'other_receipts' },
      { key: 'interest_income', accountCode: 'B.3.02', label: 'Interest Income from Bank Accounts', subsection: 'other_receipts' },
      { key: 'diocese_subsidy', accountCode: 'B.3.03', label: 'Subsidy from Diocese', subsection: 'other_receipts' },
      { key: 'special_collections', accountCode: 'B.3.04', label: 'Special Collections', subsection: 'other_receipts' },
      { key: 'second_collections', accountCode: 'B.3.05', label: 'Second Collections', subsection: 'other_receipts' },
      { key: 'charge_over_above', accountCode: 'B.3.06', label: 'Charge Over / Above', subsection: 'other_receipts' },
      { key: 'other_receipts', accountCode: 'B.3.07', label: 'Other Receipts', subsection: 'other_receipts' },
    ],
  },
  {
    code: 'C',
    title: 'Pastoral Fund Expenses',
    description: 'Priest shares, Mass stipends, and pastoral expenses.',
    fields: [
      { key: 'sacraments_priest_share', accountCode: 'C.1.01', label: 'Sacraments - Priest Share', subsection: 'priest_share' },
      { key: 'mass_intentions_priest_share', accountCode: 'C.1.02', label: 'Mass Intentions - Priest Share', subsection: 'priest_share' },
      { key: 'confirmation_priest_share', accountCode: 'C.1.03', label: 'Confirmation - Priest Share', subsection: 'priest_share' },
      { key: 'confirmation_minister_priest', accountCode: 'C.1.04', label: 'Confirmation Minister - Priest', subsection: 'priest_share' },
      { key: 'other_priest_share', accountCode: 'C.1.05', label: 'Others - Priest Share', subsection: 'priest_share' },
      { key: 'parish_priest_stipend', accountCode: 'C.2.01', label: 'Parish Priest Stipend / Share', subsection: 'mass_stipend' },
      { key: 'parochial_vicar_stipend', accountCode: 'C.2.02', label: 'Parochial Vicar Stipend', subsection: 'mass_stipend' },
      { key: 'guest_priest_stipend', accountCode: 'C.2.03', label: 'Guest Priest Stipend', subsection: 'mass_stipend' },
      { key: 'parish_guest_stipend', accountCode: 'C.2.04', label: 'Parish and Guest Priest Stipend', subsection: 'mass_stipend' },
      { key: 'confirmation_minister_others', accountCode: 'C.3.01', label: 'Confirmation Minister - Others', subsection: 'other_pastoral_expenses' },
      { key: 'other_pastoral_expense', accountCode: 'C.3.02', label: 'Other Pastoral Expense', subsection: 'other_pastoral_expenses' },
    ],
  },
  {
    code: 'D',
    title: 'Parish Operating and Rectory Expenses',
    description: 'Personnel, utilities, communication, and operating costs.',
    fields: [
      { key: 'salaries', accountCode: 'D.1.01', label: 'Salaries and Wages - Employees', subsection: 'salaries_wages_benefits' },
      { key: 'religious_remuneration', accountCode: 'D.1.02', label: 'Remuneration - Priests / Deacons / Nuns', subsection: 'salaries_wages_benefits' },
      { key: 'allowances', accountCode: 'D.1.03', label: 'Other Compensations / Allowances', subsection: 'salaries_wages_benefits' },
      { key: 'bonuses', accountCode: 'D.1.04', label: '13th Month and Bonuses', subsection: 'salaries_wages_benefits' },
      { key: 'sss', accountCode: 'D.2.01', label: 'SSS Contributions', subsection: 'government_contributions' },
      { key: 'pagibig', accountCode: 'D.2.02', label: 'HDMF / Pag-IBIG Contributions', subsection: 'government_contributions' },
      { key: 'philhealth', accountCode: 'D.2.03', label: 'PHIC / PhilHealth Contributions', subsection: 'government_contributions' },
      { key: 'electricity', accountCode: 'D.3.01', label: 'Electric Bill', subsection: 'utilities' },
      { key: 'water', accountCode: 'D.3.02', label: 'Water Bill', subsection: 'utilities' },
      { key: 'telephone', accountCode: 'D.4.01', label: 'Telephone Bill', subsection: 'postage_communications' },
      { key: 'cable', accountCode: 'D.4.02', label: 'Cable Bill', subsection: 'postage_communications' },
      { key: 'internet', accountCode: 'D.4.03', label: 'Internet Bill', subsection: 'postage_communications' },
      { key: 'mailing', accountCode: 'D.4.04', label: 'Mailing Expenses', subsection: 'postage_communications' },
      { key: 'food', accountCode: 'D.5.01', label: 'Food and Groceries', subsection: 'other_parish_rectory_expenses' },
      { key: 'meetings', accountCode: 'D.5.02', label: 'Meetings and Representations', subsection: 'other_parish_rectory_expenses' },
      { key: 'gasoline', accountCode: 'D.5.03', label: 'Gasoline Expenses', subsection: 'other_parish_rectory_expenses' },
      { key: 'transportation', accountCode: 'D.5.04', label: 'Transportation and Related Expenses', subsection: 'other_parish_rectory_expenses' },
      { key: 'office_supplies', accountCode: 'D.5.05', label: 'Office Expenses and Supplies', subsection: 'other_parish_rectory_expenses' },
      { key: 'security', accountCode: 'D.5.06', label: 'Security Services', subsection: 'other_parish_rectory_expenses' },
      { key: 'liturgical', accountCode: 'D.5.07', label: 'Liturgical Paraphernalia', subsection: 'other_parish_rectory_expenses' },
      { key: 'real_properties', accountCode: 'D.5.08', label: 'Parish Real Properties', subsection: 'other_parish_rectory_expenses' },
      { key: 'repairs', accountCode: 'D.5.09', label: 'Repairs and Maintenance Expenses', subsection: 'other_parish_rectory_expenses' },
      { key: 'charitable', accountCode: 'D.5.10', label: 'Charitable Contributions', subsection: 'other_parish_rectory_expenses' },
      { key: 'subscriptions', accountCode: 'D.5.11', label: 'Subscriptions and Newspapers', subsection: 'other_parish_rectory_expenses' },
      { key: 'medical', accountCode: 'D.5.12', label: 'Hospital and Medicine Expenses', subsection: 'other_parish_rectory_expenses' },
      { key: 'other_expenses', accountCode: 'D.5.13', label: 'Other Expenses', subsection: 'other_parish_rectory_expenses' },
    ],
  },
  {
    code: 'E',
    title: 'Construction Receipts and Disbursements',
    description: 'Construction funding, borrowing, and project expenses.',
    fields: [
      { key: 'construction_donations', accountCode: 'E.1.01', label: 'Construction Donations', subsection: 'construction_receipts' },
      { key: 'bank_borrowings', accountCode: 'E.1.02', label: 'Borrowings from Banks', subsection: 'construction_receipts' },
      { key: 'parish_borrowings', accountCode: 'E.1.03', label: 'Borrowings from Other Parishes', subsection: 'construction_receipts' },
      { key: 'construction_other_receipts', accountCode: 'E.1.04', label: 'Construction Other Receipts', subsection: 'construction_receipts' },
      { key: 'labor_materials', accountCode: 'E.2.01', label: 'Labor and Materials', subsection: 'construction_expenses' },
      { key: 'bank_repayments', accountCode: 'E.2.02', label: 'Payment of Borrowings from Banks', subsection: 'construction_expenses' },
      { key: 'parish_repayments', accountCode: 'E.2.03', label: 'Payment of Borrowings from Other Parishes', subsection: 'construction_expenses' },
      { key: 'construction_other_expenses', accountCode: 'E.2.04', label: 'Construction Other Expenses', subsection: 'construction_expenses' },
    ],
  },
  {
    code: 'F',
    title: 'Remittances',
    description: "Diocesan, Bishop's Fund, and special-collection remittances.",
    fields: [
      { key: 'sacraments_diocese_share', accountCode: 'F.1.01', label: 'Sacraments - Diocese Share', subsection: 'remittance_to_diocese' },
      { key: 'confirmation_diocese_fund', accountCode: 'F.1.02', label: 'Confirmation - Diocese Fund', subsection: 'remittance_to_diocese' },
      { key: 'confirmation_pension_fund', accountCode: 'F.1.03', label: 'Confirmation - Pension Fund', subsection: 'remittance_to_diocese' },
      { key: 'progressive_tax_share', accountCode: 'F.1.04', label: 'Progressive Tax Collections - Diocese Share', subsection: 'remittance_to_diocese' },
      { key: 'five_percent_tax_share', accountCode: 'F.1.05', label: '5% Tax Collections - Diocese Share', subsection: 'remittance_to_diocese' },
      { key: 'confirmation_bishop_share', accountCode: 'F.2.01', label: "Confirmation - Bishop's Share", subsection: 'bishops_fund_share' },
      { key: 'confirmation_minister_bishop', accountCode: 'F.2.02', label: 'Confirmation Minister - Bishop', subsection: 'bishops_fund_share' },
      { key: 'other_bishop_share', accountCode: 'F.2.03', label: 'Others - Bishop Share', subsection: 'bishops_fund_share' },
      { key: 'other_special_collection', accountCode: 'F.3.02', label: 'Other Special Collections', subsection: 'special_collections' },
    ],
  },
];
