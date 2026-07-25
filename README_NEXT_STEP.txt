ACTION NEEDED — run this in VS Code terminal:

    python add_icon_column_and_run_matrix.py

This script (already saved to CAPSTONE root) will:
  1. Add gfs_weathercode column to AWS RDS
  2. Backfill DWD ICON weathercodes for all 30 municipalities (~2-5 min)
  3. Run confidence_matrix.py and save results to confidence_output.txt

After it finishes, the severe weather kappa scores will be populated
and you can delete this file.
