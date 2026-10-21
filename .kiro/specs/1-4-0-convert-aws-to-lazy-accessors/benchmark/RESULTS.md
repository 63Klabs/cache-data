# Benchmark results

Results from [lazy-accessor-coldstart.mjs](lazy-accessor-coldstart.mjs) for the [1-4-0-convert-aws-to-lazy-accessors](../design.md) spec (Requirement 10). The method is in design.md under "Benchmark design (Requirement 10)". Each time is measured inside a fresh child process and covers loading the package entry plus the listed accessor reads; Node.js startup is excluded.

## A/A validation (task 5.3)

Both sides ran the same code: the baseline was `HEAD` extracted with `git archive`, and the candidate was the working tree, whose `src/` matched `HEAD`. Every difference below is measurement noise.

```bash
node .kiro/specs/1-4-0-convert-aws-to-lazy-accessors/benchmark/lazy-accessor-coldstart.mjs --baseline HEAD
```

- Date: 2026-10-21T20:36:13.306Z
- Node.js: v24.13.0 (linux arm64)
- Baseline: `HEAD` (db7953c7c5a099722e031002de31314e3d9f9fd8)
- Candidate: the repository working tree; `src/` matches `HEAD`
- Runs: 20 per side and scenario, after one discarded warm-up per side

| Scenario | Side | Runs | Mean (ms) | Median (ms) | Min (ms) | Max (ms) |
|---|---|---|---|---|---|---|
| import only | baseline | 20 | 72.6 | 71.2 | 68.4 | 82.9 |
| import only | candidate | 20 | 74.9 | 71.4 | 70.1 | 103.1 |
| import + ssm | baseline | 20 | 73.6 | 71.7 | 69.7 | 91.5 |
| import + ssm | candidate | 20 | 73.1 | 72.1 | 70.3 | 92.4 |
| import + dynamo, s3, ssm | baseline | 20 | 72.2 | 71.8 | 69.6 | 80.6 |
| import + dynamo, s3, ssm | candidate | 20 | 74.0 | 72.5 | 70.0 | 85.5 |

| Scenario | Median: candidate minus baseline (ms) | Mean: candidate minus baseline (ms) |
|---|---|---|
| import only | 0.2 | 2.4 |
| import + ssm | 0.4 | -0.4 |
| import + dynamo, s3, ssm | 0.7 | 1.8 |

First-read cost (median of "import + dynamo, s3, ssm" minus median of "import only"): baseline 0.6 ms, candidate 1.1 ms.

### Reading

- **Medians agree within 0.7 ms**, about 1% of the 72 ms load time. Means differ by up to 2.4 ms because single runs spike to between 80 and 103 ms. Compare medians.
- **The result repeats.** A run one minute earlier, before a display fix for `-0.0` in the driver, gave median differences within 1.0 ms and mean differences within 2.8 ms.
- **Noise floor:** on this machine, treat a median difference under about 1 ms as noise.
- **Eager baseline:** loading the package entry takes about 72 ms, and reading all three accessors afterward adds about 1 ms, because the eager code builds every client at import.

## Before and after (task 11)

Not run yet. Task 11 compares the converted code against the last commit before the conversion, records the first-read cost, and says whether Q11 Option C (pre-warming in `Cache.init()`) looks warranted.
