"""
Shared column definitions for financial_records across all entity types.
All analytics services import from here — single source of truth.
"""

PARISH_RECEIPTS = [
    "mass_intentions_claimed",
    "confirmation_total",
    "charge_over_above",
    "mass_collection_weekday",
    "mass_collection_sunday",
    "mass_collection_saturday",
    "consumable_collections",
    "other_collections_total",
    "donations",
    "interest_income",
    "subsidy_inflow",
    "special_collections",
    "second_collections",
    "other_receipts",
    "construction_receipts",
]
PARISH_EXPENSES = [
    "priest_share",
    "mass_stipend",
    "other_pastoral_expenses",
    "salaries_wages_benefits",
    "govt_contributions",
    "utilities",
    "communications",
    "other_rectory_expenses",
    "construction_expenses",
]
PARISH_CONSUMABLE = "consumable_collections"

SCHOOL_RECEIPTS = ["tuition_revenues", "miscellaneous_fees", "other_income", "subsidy_inflow"]
SCHOOL_EXPENSES = [
    "faculty_payroll",
    "admin_staff_payroll",
    "utilities",
    "facilities_maintenance",
    "supplies",
    "other_expenses",
]
SCHOOL_CONSUMABLE = "tuition_revenues"

SEMINARY_RECEIPTS = [
    "donations",
    "seminary_fees",
    "mass_collections",
    "other_sources",
    "subsidy_from_rbscp",
    "tuition_fees",
    "board_lodging_fees",
    "drm_modules",
    "sra_reading_lab",
    "retreat",
    "honorarium_fee",
    "miscellaneous_fees",
]
SEMINARY_EXPENSES = [
    "daily_food",
    "food_others",
    "gasoline_seminary",
    "gasoline_vocation",
    "permits_licenses",
    "office_supplies",
    "kitchen_equipment",
    "medical_supplies",
    "liturgical_supplies",
    "construction_materials",
    "other_supplies",
    "lpg",
    "repairs_maintenance",
    "equipment_furniture",
]
SEMINARY_CONSUMABLE = "seminary_fees"

SCHEMA_MAP: dict[str, tuple[str, list[str], list[str], str]] = {
    "parish": ("parishes", PARISH_RECEIPTS, PARISH_EXPENSES, PARISH_CONSUMABLE),
    "school": ("schools", SCHOOL_RECEIPTS, SCHOOL_EXPENSES, SCHOOL_CONSUMABLE),
    "seminary": ("seminaries", SEMINARY_RECEIPTS, SEMINARY_EXPENSES, SEMINARY_CONSUMABLE),
}

# Private alias kept for backward-compat with health_scoring and any code that
# was written before the public SCHEMA_MAP name was introduced.
_SCHEMA_MAP = SCHEMA_MAP

MONTH_ORDER = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# KPI thresholds (Diocese of San Pablo benchmarks)
KPI_ANNUAL_COLLECTION_GROWTH_RATE_MIN = 0.1335  # 13.35%
KPI_DISBURSEMENT_COLLECTION_RATIO_MAX = 0.9347  # 93.47%
KPI_MOM_COLLECTION_CHANGE_MIN = 0.0984  # 9.84%
KPI_NET_RECEIPT_DEFICIT_RATE_MAX = 0.4883  # 48.83%
KPI_PARISH_UPGRADE_ACTIONABILITY_RATE_MIN = 0.70  # 70%


def safe_div(num: float, den: float, default: float = 0.0) -> float:
    return num / den if den != 0 else default


def clamp(val: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, val))


def month_sort_key(month_str: str) -> int:
    try:
        return MONTH_ORDER.index(month_str)
    except ValueError:
        return 0


def build_date_index(df) -> "pd.DatetimeIndex":  # noqa: F821
    """Convert year + month columns to a DatetimeIndex."""
    import pandas as pd

    month_to_num = {m: i + 1 for i, m in enumerate(MONTH_ORDER)}
    df = df.copy()
    df["month_num"] = df["month"].map(month_to_num).fillna(1).astype(int)
    df["date"] = pd.to_datetime(df["year"].astype(str) + "-" + df["month_num"].astype(str).str.zfill(2) + "-01")
    return df.sort_values("date").reset_index(drop=True)
