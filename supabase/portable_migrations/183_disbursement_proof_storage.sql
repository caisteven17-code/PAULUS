-- Create storage bucket for disbursement proof files (receipts, images, PDFs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'disbursement-proofs',
  'disbursement-proofs',
  true,
  10485760, -- 10 MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload proof files
DROP POLICY IF EXISTS "Authenticated users can upload disbursement proofs" ON storage.objects;
CREATE POLICY "Authenticated users can upload disbursement proofs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'disbursement-proofs');

-- Allow authenticated users to read proof files
DROP POLICY IF EXISTS "Authenticated users can read disbursement proofs" ON storage.objects;
CREATE POLICY "Authenticated users can read disbursement proofs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'disbursement-proofs');

-- Allow public read since bucket is public (for direct URL access)
DROP POLICY IF EXISTS "Public read disbursement proofs" ON storage.objects;
CREATE POLICY "Public read disbursement proofs"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'disbursement-proofs');
