-- Create storage bucket for donation receipt files (receipts, images, PDFs)
-- This bucket stores proof-of-receipt files attached to project donations.
-- Files are uploaded from DonationEntryModal and the public URL is stored
-- in diocese.donations.receipt_proof_name.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'donation-receipts',
  'donation-receipts',
  true,
  10485760, -- 10 MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload receipt files
DROP POLICY IF EXISTS "Authenticated users can upload donation receipts" ON storage.objects;
CREATE POLICY "Authenticated users can upload donation receipts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'donation-receipts');

-- Allow authenticated users to read receipt files
DROP POLICY IF EXISTS "Authenticated users can read donation receipts" ON storage.objects;
CREATE POLICY "Authenticated users can read donation receipts"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'donation-receipts');

-- Allow public read since bucket is public (for direct URL access in the UI)
DROP POLICY IF EXISTS "Public read donation receipts" ON storage.objects;
CREATE POLICY "Public read donation receipts"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'donation-receipts');
