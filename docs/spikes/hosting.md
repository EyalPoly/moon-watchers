# Hosting decision

Status: **undecided**. Next check: when the organizers' resource page lists what they provide (the plan says this does not block G1 on code).

- Event-mode host: undecided. Needs a GPU or a precomputed bundle; the horizon computation runs on the team's Windows PC (RTX 4060) in the meantime.
- Judging-mode host: undecided. A static preview needs no server (all sources `sample`); a live API needs a free host (spec §10.4).
- API memory: not measured yet. `create_app()` imports no torch; torch is only imported inside `build/gpu_spike.py`. Measure on the chosen host.
- The integrated preview stays on `sample` until an API host exists.
