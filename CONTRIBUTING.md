# Contributing

## Production database hygiene

Never leave verification artifacts in the production (Supabase) database.

When verifying end-to-end against live data:

1. Use the two seeded accounts only:
   - `admin@unithera.com`
   - `prithvi@unithera.com`
2. If a test genuinely requires a throwaway account, booking, or pathway, delete it
   immediately afterward in the same task and confirm the deletion in your report.
3. Never create records with placeholder names like "Verify Patient", "Test User",
   or `Conc-<hex>`. If a name like that appears in the UI, something leaked.

Seed (`python -m scripts.seed` from `backend/`) must leave exactly:

| Table | Count |
|-------|------:|
| users | 2 |
| resources | 3 |
| pathways | 0 |
| bookings | 0 |
| booking_slots | 0 |
| availability_blocks | 0 |
