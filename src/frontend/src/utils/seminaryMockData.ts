/**
 * Mock Data for Seminary Financial Analytics
 * Matches the requested column structure:
 * INCOME: Donations, Fees, Mass Collections, Other, Subsidy
 * FEES BREAKDOWN: Tuition, Board, DRM, SRA, Retreat, Honorarium, Misc
 * EXPENSES: Construction, Supplies, LPG, Repairs, Purchases, Utilities, Labor, Prof Fee, Salaries, Benefits, Incentives, Bank Charges, Others
 */

export const MONTHS = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];

export const generateSeminaryData = () => {
  return MONTHS.map((month, index) => {
    // Realistic base values with some seasonal variation
    const enrollment = 85;
    const baseFee = 25000; // PHP
    
    // Income
    const tuitionFees = enrollment * baseFee * (month === 'Jun' || month === 'Nov' ? 0.6 : 0.05); // Spikes at start of sem
    const boardFees = enrollment * 15000 * (month === 'Jun' || month === 'Nov' ? 0.6 : 0.05);
    const drm = enrollment * 500;
    const sra = enrollment * 300;
    const retreat = month === 'Mar' ? enrollment * 5000 : 0;
    const honorariumFee = enrollment * 1000;
    const miscFees = enrollment * 2000;

    const totalFees = tuitionFees + boardFees + drm + sra + retreat + honorariumFee + miscFees;
    const donations = 50000 + Math.random() * 150000;
    const massCollections = 20000 + Math.random() * 30000;
    const otherSources = 10000 + Math.random() * 20000;
    const subsidyRCBSP = 500000; // Fixed monthly subsidy

    const totalIncome = totalFees + donations + massCollections + otherSources + subsidyRCBSP;

    // Expenses
    const salaries = 450000;
    const benefits = salaries * 0.2;
    const labor = 80000;
    const utilities = 120000 + Math.random() * 40000;
    const repairs = 30000 + (month === 'May' ? 200000 : Math.random() * 50000); // Summer repairs
    const construction = month === 'Apr' || month === 'May' ? 300000 : 0;
    const lpg = 15000 + Math.random() * 5000;
    const supplies = 40000 + Math.random() * 20000;
    const profFee = 50000;
    const incentives = month === 'Dec' ? salaries : 0; // 13th month
    const bankCharges = 2000;
    const purchases = 20000 + Math.random() * 30000;
    const othersExpenses = 15000;

    const totalExpenses = salaries + benefits + labor + utilities + repairs + construction + lpg + supplies + profFee + incentives + bankCharges + purchases + othersExpenses;

    return {
      month,
      // Income
      donations,
      fees: totalFees,
      massCollections,
      otherSources,
      subsidyRCBSP,
      totalIncome,
      // Fee Breakdown
      tuitionFees,
      boardFees,
      drm,
      sra,
      retreat,
      honorariumFee,
      miscFees,
      // Expenses
      construction,
      supplies,
      lpg,
      repairs,
      purchases,
      utilities,
      labor,
      profFee,
      salaries,
      benefits,
      incentives,
      bankCharges,
      othersExpenses,
      totalExpenses,
      netSurplus: totalIncome - totalExpenses,
      dependencyRatio: (donations + subsidyRCBSP) / totalIncome
    };
  });
};

export const seminaryMockData = generateSeminaryData();

export const CHART_COLORS = [
  '#1a472a', // churchGreen
  '#D4AF37', // gold
  '#10B981', // success
  '#3B82F6', // info
  '#F59E0B', // warning
  '#EF4444', // error
  '#0d2818', // churchGreenDark
  '#B5952F', // goldDark
];
