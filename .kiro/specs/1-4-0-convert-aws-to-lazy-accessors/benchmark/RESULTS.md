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

The baseline was `HEAD`, the last commit before the conversion, extracted with `git archive`. The candidate was the working tree with the converted `src/lib/tools/AWS.classes.js`, not yet committed.

```bash
node .kiro/specs/1-4-0-convert-aws-to-lazy-accessors/benchmark/lazy-accessor-coldstart.mjs --baseline HEAD
```

- Date: 2026-10-21T23:10:17.040Z
- Node.js: v24.15.0 (linux x64)
- Baseline: `HEAD` (617d638be073e56665dc00694642b8faf78c3bff), eager accessors
- Candidate: the repository working tree; `src/` has the uncommitted conversion from task 6
- Runs: 20 per side and scenario, after one discarded warm-up per side

| Scenario | Side | Runs | Mean (ms) | Median (ms) | Min (ms) | Max (ms) |
|---|---|---|---|---|---|---|
| import only | baseline | 20 | 77.1 | 77.4 | 74.2 | 80.2 |
| import only | candidate | 20 | 22.0 | 21.2 | 20.5 | 24.8 |
| import + ssm | baseline | 20 | 77.2 | 77.8 | 73.1 | 80.5 |
| import + ssm | candidate | 20 | 57.6 | 58.3 | 54.7 | 60.4 |
| import + dynamo, s3, ssm | baseline | 20 | 77.3 | 76.9 | 73.7 | 82.8 |
| import + dynamo, s3, ssm | candidate | 20 | 79.7 | 80.3 | 75.3 | 83.2 |

| Scenario | Median: candidate minus baseline (ms) | Mean: candidate minus baseline (ms) |
|---|---|---|
| import only | -56.2 | -55.0 |
| import + ssm | -19.6 | -19.6 |
| import + dynamo, s3, ssm | 3.4 | 2.4 |

First-read cost (median of "import + dynamo, s3, ssm" minus median of "import only"): baseline -0.5 ms, candidate 59.1 ms.

A repeat with `--runs 40` gave median differences of -56.5 ms, -19.5 ms, and +1.6 ms, and a candidate first-read cost of 57.8 ms.

### Noise floor on this machine

This run's platform differs from the task 5.3 A/A run (linux x64 and Node.js v24.15.0, against linux arm64 and v24.13.0), so the A/A check was repeated here with `HEAD` on both sides. Medians agreed within 0.6 ms.

```bash
aa=$(mktemp -d)
git archive --format=tar -o "$aa/head.tar" HEAD src package.json && tar -xf "$aa/head.tar" -C "$aa" && rm "$aa/head.tar"
node .kiro/specs/1-4-0-convert-aws-to-lazy-accessors/benchmark/lazy-accessor-coldstart.mjs --baseline HEAD --candidate "$aa"
rm -rf "$aa"
```

| Scenario | Median: candidate minus baseline (ms) | Mean: candidate minus baseline (ms) |
|---|---|---|
| import only | -0.6 | -0.5 |
| import + ssm | -0.1 | -0.7 |
| import + dynamo, s3, ssm | -0.5 | -0.5 |

### Reading

- **Import only: 77 ms to 21 ms.** A function that loads the package and reads no converted accessor saves about 56 ms, 73% of the load time.
- **One service: 78 ms to 58 ms.** A parameters-only function that reads `ssm` saves about 20 ms. One service costs about 37 ms at first read and all three about 58 ms, so most of the first-read cost appears to be SDK code the clients share, paid once by whichever accessor is read first.
- **All three: 1.6 to 3.4 ms slower than eager.** The work is the same, only later. The candidate was 3.4 ms slower at 20 runs and 1.6 ms slower at 40: above this machine's noise floor, but under 5% of the total.
- **First-read cost: about 58 ms** (57.8 to 59.1 ms) for `dynamo`, `s3`, and `ssm` together, which the eager code paid at import.

### Q11 Option C (pre-warming in `Cache.init()`)

On these numbers, revisiting Option C doesn't look warranted. For an on-demand cold start, the init phase and the first invocation are both on the first request's path, so the total is unchanged to within about 3 ms. Only environments initialized ahead of traffic, such as those using provisioned concurrency, move up to about 58 ms from init into their first invocation, and the documented module-scope read (`tools.AWS.dynamo; tools.AWS.s3;`, Q11 Option A) keeps that work in init. The decision belongs to the maintainer.

These are local measurements in fresh Node.js processes, not Lambda cold starts: there's no init-phase CPU allocation, no network, and no credential resolution (design.md "Known limitations", item 4).
