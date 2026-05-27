import { chartPalette } from '../constants/theme.js';

export const seminaryIncomeColumns = [
  'Receipts from Donations',
  'Seminary Fees',
  'Mass Collections',
  'Other Sources',
  'Subsidy from RCBSP',
];

export const seminaryFeeSubColumns = [
  'Tuition Fees',
  'Board & Lodging Fees',
  'DRM',
  'SRA',
  'Retreat',
  'Honorarium Fee',
  'Miscellaneous Fees',
];

export const seminaryExpenseColumns = [
  'Construction Supplies/Materials',
  'Others Supplies Expense',
  'Liquified Petroluem Gas',
  'Repairs and Maintainance',
  'Purchases (Other Equipment and Furnitures)',
  'Utilities Expense',
  'Labor Expense',
  "Professional Fee & Driver's Fee",
  'Salaries & Wages and Remuneration',
  'Contribution Benefits',
  'Cash Incentives',
  'Transportation/Parking Fee/Bank Charges',
  'Others Expenses',
];

const monthKeys = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const tuitionFees = [332000, 318000, 321000, 312000, 309000, 368000, 358000, 351000, 341000, 336000, 329000, 333000];
const boardAndLodgingFees = [224000, 223000, 224000, 223000, 224000, 226000, 227000, 228000, 229000, 230000, 231000, 232000];
const drmFees = [42000, 40000, 43000, 41000, 42000, 45000, 46000, 46000, 47000, 47000, 48000, 49000];
const sraFees = [26000, 25000, 26000, 26000, 27000, 28000, 29000, 29000, 30000, 30000, 31000, 32000];
const retreatFees = [18000, 14000, 32000, 22000, 18000, 12000, 36000, 17000, 14000, 28000, 20000, 19000];
const honorariumFees = [16000, 16000, 17000, 16000, 16000, 17000, 17000, 17000, 18000, 18000, 18000, 19000];
const miscellaneousFees = [29000, 27000, 28000, 28000, 29000, 32000, 33000, 33000, 34000, 35000, 35000, 36000];

const donations = [188000, 181000, 195000, 189000, 205000, 198000, 214000, 210000, 226000, 232000, 243000, 257000];
const massCollections = [54000, 52000, 56000, 55000, 59000, 61000, 60000, 59000, 62000, 65000, 69000, 74000];
const otherSources = [76000, 73000, 78000, 75000, 79000, 82000, 85000, 86000, 87000, 89000, 91000, 94000];
const rcbspSubsidy = [348000, 346000, 344000, 342000, 340000, 338000, 336000, 334000, 332000, 330000, 328000, 326000];
const enrollment = [118, 118, 119, 119, 120, 123, 124, 124, 125, 126, 126, 127];

const expenseBase = {
  'Construction Supplies/Materials': 118000,
  'Others Supplies Expense': 56000,
  'Liquified Petroluem Gas': 21000,
  'Repairs and Maintainance': 77000,
  'Purchases (Other Equipment and Furnitures)': 86000,
  'Utilities Expense': 98000,
  'Labor Expense': 72000,
  "Professional Fee & Driver's Fee": 46000,
  'Salaries & Wages and Remuneration': 314000,
  'Contribution Benefits': 62000,
  'Cash Incentives': 19000,
  'Transportation/Parking Fee/Bank Charges': 17000,
  'Others Expenses': 61000,
};

const expenseFactors = [0.96, 0.95, 1.01, 1.03, 1.07, 1.1, 1.13, 1.12, 1.11, 1.13, 1.15, 1.18];

const categoryAdjustments = {
  'Construction Supplies/Materials': [0.03, 0.02, 0.05, 0.08, 0.1, 0.14, 0.16, 0.15, 0.12, 0.14, 0.16, 0.2],
  'Repairs and Maintainance': [0.01, 0.0, 0.04, 0.06, 0.08, 0.08, 0.1, 0.08, 0.07, 0.07, 0.08, 0.1],
  'Purchases (Other Equipment and Furnitures)': [0.0, 0.0, 0.03, 0.05, 0.07, 0.09, 0.12, 0.11, 0.08, 0.09, 0.1, 0.12],
  'Utilities Expense': [0.02, 0.0, 0.01, 0.03, 0.05, 0.08, 0.12, 0.12, 0.11, 0.09, 0.06, 0.05],
  'Transportation/Parking Fee/Bank Charges': [0.01, 0.0, 0.02, 0.02, 0.04, 0.05, 0.05, 0.05, 0.04, 0.03, 0.04, 0.05],
};

const toExpenseRecord = (index) => {
  return seminaryExpenseColumns.reduce((acc, key) => {
    const adjustmentSeries = categoryAdjustments[key] || Array(12).fill(0);
    const value = expenseBase[key] * expenseFactors[index] * (1 + adjustmentSeries[index]);
    acc[key] = Math.round(value);
    return acc;
  }, {});
};

export const seminaryMonthlyData = monthKeys.map((month, index) => {
  const feeBreakdown = {
    'Tuition Fees': tuitionFees[index],
    'Board & Lodging Fees': boardAndLodgingFees[index],
    DRM: drmFees[index],
    SRA: sraFees[index],
    Retreat: retreatFees[index],
    'Honorarium Fee': honorariumFees[index],
    'Miscellaneous Fees': miscellaneousFees[index],
  };

  const seminaryFees = Object.values(feeBreakdown).reduce((sum, value) => sum + value, 0);
  const expenseBreakdown = toExpenseRecord(index);
  const totalExpenses = Object.values(expenseBreakdown).reduce((sum, value) => sum + value, 0);

  const incomeBreakdown = {
    'Receipts from Donations': donations[index],
    'Seminary Fees': seminaryFees,
    'Mass Collections': massCollections[index],
    'Other Sources': otherSources[index],
    'Subsidy from RCBSP': rcbspSubsidy[index],
  };

  const totalIncome = Object.values(incomeBreakdown).reduce((sum, value) => sum + value, 0);

  return {
    month,
    label: `${month} 2026`,
    monthIndex: index,
    enrollment: enrollment[index],
    income: incomeBreakdown,
    feeBreakdown,
    expenses: expenseBreakdown,
    totalIncome,
    totalExpenses,
    net: totalIncome - totalExpenses,
  };
});

export const seminaryCapexTimeline = [
  { initiative: 'Dormitory Roof Retrofit', start: 0, duration: 3, budget: 540000, owner: 'Facilities Office' },
  { initiative: 'Chapel Audio Upgrade', start: 2, duration: 2, budget: 180000, owner: 'Liturgy & IT' },
  { initiative: 'Kitchen Equipment Refresh', start: 4, duration: 2, budget: 240000, owner: 'Operations' },
  { initiative: 'Water Line Rehabilitation', start: 6, duration: 3, budget: 420000, owner: 'Engineering' },
  { initiative: 'Library Aircon Replacement', start: 8, duration: 2, budget: 265000, owner: 'Academic Affairs' },
  { initiative: 'Solar Lighting Pilot', start: 10, duration: 2, budget: 310000, owner: 'Finance Council' },
];

export const seminaryDiversificationTargets = [
  { source: 'Donations', current: 15, target: 18 },
  { source: 'Seminary Fees', current: 57, target: 52 },
  { source: 'Mass Collections', current: 5, target: 7 },
  { source: 'Other Sources', current: 7, target: 13 },
  { source: 'RCBSP Subsidy', current: 16, target: 10 },
];

export const seminaryBudgetReallocation = [
  { category: 'Construction Supplies/Materials', urgency: 'High', action: 'Phase noncritical masonry works into dry months', shiftTo: 'Utilities resilience reserve', suggestedMove: 65000 },
  { category: 'Purchases (Other Equipment and Furnitures)', urgency: 'High', action: 'Bundle furniture replacement with annual procurement cycle', shiftTo: 'Scholarship contingency', suggestedMove: 48000 },
  { category: 'Others Expenses', urgency: 'Medium', action: 'Tighten discretionary hospitality and event spend', shiftTo: 'Formation program buffer', suggestedMove: 26000 },
  { category: 'Transportation/Parking Fee/Bank Charges', urgency: 'Medium', action: 'Route collections through fewer settlement windows', shiftTo: 'Minor repairs reserve', suggestedMove: 12000 },
  { category: 'Cash Incentives', urgency: 'Low', action: 'Align incentives with surplus months only', shiftTo: 'Emergency cash buffer', suggestedMove: 9000 },
];

export const seminaryRoadmap = [
  { year: '2026', subsidy: 4.0, ownSource: 9.1, targetSurplus: 0.45 },
  { year: '2027', subsidy: 3.4, ownSource: 10.3, targetSurplus: 0.72 },
  { year: '2028', subsidy: 2.9, ownSource: 11.7, targetSurplus: 1.08 },
];

export const seminaryMockMeta = {
  currency: 'PHP',
  year: 2026,
  palette: chartPalette,
};
