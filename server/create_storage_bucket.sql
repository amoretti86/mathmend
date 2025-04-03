You're absolutely right - we should leverage Supabase for storage rather than storing files locally. Let me walk you through how to properly set up Supabase for file storage and OCR processing results.
1. Setting Up Supabase Storage Bucket
First, let's create a storage bucket in Supabase to store the uploaded math documents.
SQL to Create Storage Bucket
sqlCopy-- Create a storage bucket for math documents
INSERT INTO storage.buckets (id, name, public, avif_autodetection)
VALUES (
  'math_documents',
  'math_documents',
  false,  -- Set to false for non-public access
  false
);

-- Set up security policies for the bucket
-- Allow authenticated users to upload files
CREATE POLICY "Allow authenticated users to upload" 
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'math_documents');

-- Allow users to read their own files
CREATE POLICY "Allow users to read their own files" 
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'math_documents' AND auth.uid() = owner);

-- Allow users to update their own files
CREATE POLICY "Allow users to update their own files" 
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'math_documents' AND auth.uid() = owner);

-- Allow users to delete their own files
CREATE POLICY "Allow users to delete their own files" 
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'math_documents' AND auth.uid() = owner);