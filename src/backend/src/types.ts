export type AppRole =
  | 'bishop'
  | 'admin'
  | 'parish_priest'
  | 'parish_secretary'
  | 'school'
  | 'school_registrar'
  | 'seminary'
  | 'seminary_rector'
  | 'diocese_admin';

export interface UserRole {
  id: string;
  name: string;
  color: string;
  permissions: {
    [key: string]: boolean;
  };
}

export interface AuthUser {
  id?: string;
  uid?: string;
  email?: string;
  role?: AppRole;
  accessRole?: string;
  roleId?: string;
  entityName?: string;
  entityType?: string;
  entityId?: string;
  displayName?: string;
  name?: string;
  status?: string;
  firstName?: string;
  lastName?: string;
  nickName?: string;
  contactNumber?: string;
  address?: string;
  position?: string;
  roleLabel?: string;
  emergencyContact?: string;
  notes?: string;
}

export type EntityClass = 'Class A' | 'Class B' | 'Class C' | 'Class D' | 'Class E';

export interface FinancialRecord {
  id?: string;
  month: string;
  year?: number;
  collections: number;
  consumableCollections: number;
  disbursements: number;

  sacraments_rate?: number;
  sacraments_arancel?: number;
  sacraments_parishShare?: number;
  sacraments_overAbove?: number;

  collections_mass?: number;
  collections_other?: number;
  collections_otherReceipts?: number;

  expenses_pastoral?: number;
  expenses_parish?: number;

  netReceipts?: number;

  others_massIntentionsNotClaimed?: number;
  others_massIntentionsClaimed?: number;
  others_specialCollections?: number;

  pastoralParishFundTotalNetReceipts?: number;

  timestamp?: any;
  entityId?: string;
  entityType?: 'parish' | 'school' | 'seminary' | 'diocese';
  entityClass?: EntityClass;
}

export interface Parish {
  id: string;
  name: string;
  district?: string;
  vicariate: string;
  class: EntityClass;
  pastor: string;
  address: string;
  contactNumber: string;
  email: string;
  collections?: number;
  lat?: number;
  lng?: number;
  primaryPatron?: string;
  secondaryPatron?: string;
  fiestaDate?: string;
  subsidyType?: 'subsidized' | 'independent';
}

export interface Seminary {
  id: string;
  name: string;
  district?: string;
  vicariate: string;
  class: EntityClass;
  rector: string;
  address: string;
  enrollment: number;
  capacity: number;
  staff: number;
  collections?: number;
  subsidyType?: 'subsidized' | 'independent';
}

export interface DiocesanSchool {
  id: string;
  name: string;
  district?: string;
  cluster: 1 | 2 | 3;
  class: EntityClass;
  principal: string;
  address: string;
  level: string;
  enrollment: number;
  capacity: number;
  staff: number;
  collections?: number;
  subsidyType?: 'subsidized' | 'independent';
}

export interface FinancialHealthScore {
  id?: string;
  entityId: string;
  entityType: 'parish' | 'seminary' | 'school' | 'diocese';
  entityClass?: EntityClass;
  compositeScore: number;
  dimensions: {
    liquidity: number;
    sustainability: number;
    efficiency: number;
    stability: number;
    growth: number;
  };
  trend: 'up' | 'down' | 'stable';
  percentageChange: number;
  analysis?: string;
  recommendations?: string[];
  timestamp: any;
}

export interface DiagnosticResult {
  id?: string;
  entityId: string;
  targetMonth: string;
  anomalyDetected: boolean;
  anomalyType?: string;
  severity?: 'low' | 'medium' | 'high';
  rootCauses?: {
    factor: string;
    contribution: number;
  }[];
  confidenceScore?: number;
  analysis?: string;
  timestamp: any;
}

export type ProjectCategory =
  | 'Building/Construction'
  | 'Equipment'
  | 'Programs/Outreach'
  | 'Education'
  | 'Emergency/Relief'
  | 'Liturgical'
  | 'Operational'
  | 'Infrastructure'
  | 'Heritage'
  | 'Charity'
  | 'Facilities';

export type EntityType = 'parish' | 'school' | 'seminary' | 'diocese';

export interface Project {
  id: string;
  name: string;
  description: string;
  fundUsage: string;
  targetAmount: number;
  currentAmount: number;
  startDate: string;
  endDate: string;
  category: ProjectCategory;
  status: 'active' | 'completed' | 'on-hold';
  beneficiaries?: string;
  coverImage?: string;
  contactPerson?: string;
  healthScore: number;
  successProbability: number;
  recommendation: string;
  totalExpenses?: number;
  entityId: string;
  entityName?: string;
  entityType: 'parish' | 'school' | 'seminary' | 'diocese';
}

export interface Donation {
  id: string;
  projectId: string;
  donorName?: string;
  amount: number;
  date: string;
  paymentMethod: 'Cash' | 'Check' | 'Online' | 'Bank Transfer';
  receiptIssued?: boolean;
  receiptProofName?: string;
  notes?: string;
}

export interface ProjectExpense {
  id: string;
  projectId: string;
  description: string;
  amount: number;
  date: string;
  paymentMethod: 'Cash' | 'Check' | 'Online' | 'Bank Transfer';
  notes?: string;
  receiptReference?: string;
  proofFileName?: string;
}
