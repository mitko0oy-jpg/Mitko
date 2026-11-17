-- 1) "Sent" in the shop means a waybill number or an explicit "shipped" mark. The courier name alone is only
--    the courier the client chose at checkout (EduBel writes "dpd-courier" into every new order).
UPDATE orders SET cb_shipped = (
    coalesce(raw->'fulfillment'->>'trackingNo', raw->'fulfillment'->>'tracking_no', raw->'fulfillment'->>'trackingNumber', '') <> ''
    OR coalesce(raw->>'shipped', '') = 'true' OR coalesce(raw->>'shippedAt', '') <> '' OR coalesce(raw->>'fulfilled', '') = 'true')
 WHERE raw ? 'id';

-- 2) Digital products (PDFs, online tests) are marked, so they are not counted as things to pack.
UPDATE orders o SET items = sub.items
  FROM (
    SELECT o2.id,
           jsonb_agg(CASE WHEN x.ri IS NOT NULL AND ((x.ri->>'shippingRequired') = 'false' OR x.ri->>'type' = 'digital')
                          THEN a.i || '{"digital": true}'::jsonb ELSE a.i END ORDER BY a.n) AS items
      FROM orders o2
      CROSS JOIN LATERAL jsonb_array_elements(o2.items) WITH ORDINALITY a(i, n)
      LEFT JOIN LATERAL (
        SELECT r.ri FROM jsonb_array_elements(o2.raw->'items') WITH ORDINALITY r(ri, m)
         WHERE r.m = a.n AND r.ri->>'name' = a.i->>'name'
      ) x ON true
     WHERE jsonb_typeof(o2.items) = 'array' AND jsonb_typeof(o2.raw->'items') = 'array'
     GROUP BY o2.id
  ) sub
 WHERE sub.id = o.id;
