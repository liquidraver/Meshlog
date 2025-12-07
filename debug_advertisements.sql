-- Show all columns from advertisements table to determine which timestamp to use
SELECT 
    id,
    contact_id,
    reporter_id,
    hash,
    name,
    lat,
    lon,
    country_code,
    path,
    type,
    flags,
    snr,
    sent_at,
    received_at,
    created_at,
    -- Show differences between all timestamp fields
    TIMESTAMPDIFF(MINUTE, sent_at, created_at) AS sent_vs_created_minutes,
    TIMESTAMPDIFF(MINUTE, received_at, created_at) AS received_vs_created_minutes,
    TIMESTAMPDIFF(MINUTE, sent_at, received_at) AS sent_vs_received_minutes
FROM advertisements
ORDER BY created_at DESC, id DESC
LIMIT 20;

