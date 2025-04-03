-- Table for document metadata
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  math_type TEXT NOT NULL,
  prompt TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table for OCR results
CREATE TABLE ocr_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  original_text TEXT,
  corrected_text TEXT,
  latex_code TEXT,
  confidence FLOAT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_results ENABLE ROW LEVEL SECURITY;

-- Set up security policies for the tables
-- Documents table policies
CREATE POLICY "Allow users to select their own documents"
ON documents FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Allow users to insert their own documents"
ON documents FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Allow users to update their own documents"
ON documents FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Allow users to delete their own documents"
ON documents FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- OCR results table policies
CREATE POLICY "Allow users to select their own OCR results"
ON ocr_results FOR SELECT
TO authenticated
USING ((SELECT user_id FROM documents WHERE id = ocr_results.document_id) = auth.uid());

CREATE POLICY "Allow users to insert OCR results"
ON ocr_results FOR INSERT
TO authenticated
WITH CHECK ((SELECT user_id FROM documents WHERE id = ocr_results.document_id) = auth.uid());

CREATE POLICY "Allow users to update their own OCR results"
ON ocr_results FOR UPDATE
TO authenticated
USING ((SELECT user_id FROM documents WHERE id = ocr_results.document_id) = auth.uid());

CREATE POLICY "Allow users to delete their own OCR results"
ON ocr_results FOR DELETE
TO authenticated
USING ((SELECT user_id FROM documents WHERE id = ocr_results.document_id) = auth.uid());