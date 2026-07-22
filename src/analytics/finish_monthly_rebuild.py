"""
One-off recovery script, step 2: monthly summary rebuild is already done
(via direct SQL, bypassing PostgREST's RPC statement_timeout). This just
runs the remaining Cohen's Kappa / Lin's CCC confidence upsert from the
full DB dataset.
"""
import sys
sys.path.insert(0, ".")

from app.services.weather_loader import confidence_from_db

print("Recomputing Cohen's Kappa / Lin's CCC from full DB dataset...")
n = confidence_from_db()
print(f"  {n} municipality-months updated")
print("Done.")
