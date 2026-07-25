import subprocess, sys

result = subprocess.run(
    [sys.executable, r'C:\Users\caist\testing\CAPSTONE\backfill_gfs_weathercode.py'],
    capture_output=True,
    text=True,
)
print("=== BACKFILL ===")
print(result.stdout[-2000:])
if result.stderr:
    print("STDERR:", result.stderr[-500:])

result2 = subprocess.run(
    [sys.executable, 'confidence_matrix.py'],
    capture_output=True,
    text=True,
    cwd=r'C:\Users\caist\testing\CAPSTONE\src\analytics'
)

out = result2.stdout
if result2.stderr:
    out += "\nSTDERR:\n" + result2.stderr[-2000:]

with open(r'C:\Users\caist\testing\CAPSTONE\confidence_output.txt', 'w', encoding='utf-8') as f:
    f.write(out)

print("=== MATRIX ===")
print("Saved. Lines:", len(out.splitlines()))
print(out[-500:])
