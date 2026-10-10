-- Fix Database: Remove BID-SUB-004 (test bidder with NULL data)
-- Run this in Supabase SQL Editor

-- 1. Delete all documents for BID-SUB-004
DELETE FROM documents WHERE bidder_id = 'BID-SUB-004';

-- 2. Delete BID-SUB-004 bidder record
DELETE FROM bids WHERE bidder_id = 'BID-SUB-004';

-- 3. Verify remaining bidders
SELECT id, tender_id, bidder_id, bidder_name FROM bids ORDER BY id;

-- 4. Verify no orphaned documents
SELECT id, bidder_id, filename FROM documents ORDER BY bidder_id;
