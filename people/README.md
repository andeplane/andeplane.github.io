# Offline passenger voyage (#878)

Run `npm run people:bake` to generate the fictional population, plans, moods, stories and social
ledger read by `?people=1`. Generated JSON is ignored by git; the public build bakes it when missing and
copies it (the owner's decision, 2026-10-23).
This directory is registered as our generated content. Historical identity reference data remains
separate in `content/people/historical/`; it is not the active population.
