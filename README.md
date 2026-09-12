# ABSmartly CLI

Command-line interface for AI agents and humans to manage experiments, feature flags, and A/B tests on the [ABSmartly](https://absmartly.com) platform.

## Install

```bash
bun install -g @absmartly/cli
```

Requires [Bun](https://bun.sh/) >= 1.0 (or Node.js >= 18 at runtime).

## Quick start

```bash
# Interactive setup wizard
abs setup

# Non-interactive setup
abs setup --api-key YOUR_KEY --endpoint https://your-instance.absmartly.com/v1
abs setup --api-key YOUR_KEY --endpoint https://staging.absmartly.com/v1 --profile staging

# Or authenticate manually
abs auth login --api-key YOUR_API_KEY --endpoint https://your-instance.absmartly.com/v1

# Verify configuration
abs doctor

# List experiments
abs experiments list

# Get experiment details
abs experiments get 123
```

## Authentication

The CLI stores credentials in your OS keychain (via keytar) and configuration in `~/.config/absmartly/config.yaml`. On headless systems without a keychain service, credentials fall back to `~/.config/absmartly/credentials.json` (chmod 600).

Two authentication methods are supported:

### API key authentication

```bash
# Login with API key
abs auth login --api-key YOUR_KEY --endpoint https://your-instance.absmartly.com/v1

# Login with a named profile
abs auth login --api-key YOUR_KEY --endpoint https://staging.absmartly.com/v1 --profile staging
```

### OAuth authentication

When no `--api-key` is provided, the CLI launches an OAuth browser flow. After authorization, it can either create a persistent API key (default) or use session-based JWT tokens.

```bash
# OAuth login (opens browser, creates persistent API key)
abs auth login --endpoint https://your-instance.absmartly.com/v1

# OAuth with session-based JWT tokens (no persistent key, expires in 24h)
abs auth login --endpoint https://your-instance.absmartly.com/v1 --session

# Skip prompt and always create persistent API key
abs auth login --endpoint https://your-instance.absmartly.com/v1 --persistent

# Headless environments (print URL instead of opening browser)
abs auth login --endpoint https://your-instance.absmartly.com/v1 --no-browser

# Allow self-signed TLS certificates
abs auth login --endpoint https://dev.local/v1 -k
```

> **Security note**: The `-k` flag disables TLS certificate verification. Only use in trusted development environments.

### Auth commands

```bash
# Check authentication status
abs auth status
abs auth status --show-key    # reveal full API key
abs auth status --profile staging

# Show current authenticated user
abs auth whoami
abs auth whoami --avatar       # display avatar inline (iTerm2, Kitty, Sixel)
abs auth whoami --avatar 30    # avatar at 30 columns wide

# Manage personal API keys
abs auth list-api-keys
abs auth create-api-key --name "CI Key" --description "For CI/CD pipelines"
abs auth get-api-key 1
abs auth update-api-key 1 --name "Renamed Key"
abs auth delete-api-key 1

# Edit your profile
abs auth edit-profile --first-name "Jonas" --last-name "Alves" --department "Engineering"

# Change your own password
abs auth reset-my-password

# Logout
abs auth logout
abs auth logout --profile staging
```

You can also override credentials per-command with global options:

```bash
abs experiments list --api-key YOUR_KEY --endpoint https://your-instance.absmartly.com/v1
```

## Global options

These options are available on every command:

| Option | Description |
|---|---|
| `--config <path>` | Config file path |
| `--api-key <key>` | Override API key |
| `--endpoint <url>` | Override API endpoint |
| `--app <name>` | Override default application |
| `--env <name>` | Override default environment |
| `-o, --output <format>` | Output format: `table` (default), `json`, `yaml`, `plain`, `markdown`, `rendered`, `vertical`, `template` |
| `--no-color` | Disable colored output |
| `-v, --verbose` | Verbose output |
| `-q, --quiet` | Minimal output |
| `--profile <name>` | Use a specific profile |
| `--terse` | Compact format with truncation |
| `--full` | Full text without truncation |
| `--raw` | Show raw API response without summarizing or transforming |

### Debugging API traffic

These flags write to **stderr** (so they don't pollute piped stdout) and respect `--no-color` and the `NO_COLOR` env var. Authorization headers and known sensitive body fields (`key`, `password`, `token`, `secret`, `access_token`, `refresh_token`, `api_key`) are redacted by default.

| Option | Description |
|---|---|
| `--show-request` | Print outgoing HTTP requests as a readable HTTP-style block. |
| `--show-response` | Print HTTP responses (success and error) as an HTTP-style block. |
| `--curl` | Print outgoing requests as runnable curl commands. |
| `--show-secrets` | Don't redact `Authorization` / `Set-Cookie` / sensitive body fields. Use with care. |
| `--headers-only` | Omit request and response bodies from `--show-request` / `--show-response` / `--curl` output. |
| `--status-only` | Print only the response status line, e.g. `← 200 OK (175ms)`. Implies `--show-response`. |

When stderr is a TTY, JSON bodies and HTTP headers are pretty-printed and syntax-highlighted. Polling loops that fire the same request repeatedly are deduped: each unique request is printed once and a `(N identical requests suppressed)` summary appears when the next distinct request arrives. Responses are always logged so that state transitions during polling stay visible.

Examples:

```bash
abs experiments get 1816 --show-request --show-response
abs experiments list --curl                            # paste-runnable curl
abs experiments get 1816 --show-response --status-only # just `← 200 OK (...)`
abs experiments export 5 --download --show-request --headers-only
```

## Commands

### Experiments

Full lifecycle management for A/B tests and feature flags.

Aliases: `experiments`, `experiment`, `exp`, `features`, `feature`

Use `abs features` instead of `abs experiments` to auto-filter by `type=feature`.

All experiment commands accept **names or IDs**. For example, `abs experiments get checkout_redesign` resolves the name to the latest iteration's ID automatically.

```bash
# List experiments with filters and pagination
abs experiments list
abs experiments list --state running --items 50 --sort created_at --desc
abs experiments list --app my-app --search "checkout" --page 2
abs experiments list --created-after 2025-01-01 --tags v1,mobile

# Find experiments that use a specific metric (by ID or name), in any role
abs experiments list --metric "Revenue"
abs experiments list --metric 42 --metric-role guardrail,primary
abs experiments list --metric 42 --type test,feature --state running -o ids

# Customize columns
abs experiments list --show experiment_report archived   # add extra columns
abs experiments list --exclude primary_metric owner      # hide columns

# Search by name
abs experiments search "onboarding"

# Get experiment details
abs experiments get 123                                  # summary table
abs experiments get 123 -o vertical                      # one field per line
abs experiments get 123 -o json                          # summary as JSON
abs experiments get 123 -o json --raw                    # full API response as JSON
abs experiments get 123 --show audience Hypothesis       # include extra fields
abs experiments get 123 --exclude owners tags            # hide fields from output
abs experiments get 123 --activity                       # include activity log

# Inline screenshots (iTerm2, Kitty, Sixel)
abs experiments get 123 --show-images                    # display variant screenshots
abs experiments get 123 --show-images 60                 # at 60 columns wide

# Template export (for cloning, editing, round-tripping)
abs experiments get 123 -o template                      # markdown template
abs experiments get 123 -o template --embed-screenshots  # with base64 screenshots
abs experiments get 123 -o template --screenshots-dir ./screenshots  # save screenshots as files

# Create an experiment
abs experiments create --name my-experiment --variants "control,treatment"
abs experiments create --name my-experiment --secondary-metrics "Revenue,Bookings"
abs experiments create --name my-experiment --teams "Product" --tags "v1"
abs experiments create --name my-experiment --audience '{"filter":[]}'
abs experiments create --name my-experiment --analysis-type fixed_horizon
abs experiments create --name my-experiment --hypothesis "We believe X"  # custom fields
abs experiments create --name my-experiment --field "Hypothesis=We believe X"  # generic fallback
abs experiments create --from-file experiment.md         # from template
abs experiments create --name my-experiment --dry-run    # preview payload
abs experiments create --name my-experiment --as-curl    # output as curl command
cat template.md | abs experiments create --from-file -   # from stdin

# Clone an experiment
abs experiments clone 123 --name my-clone                # clone with new name
abs experiments clone 123 --name my-clone --dry-run      # preview
abs experiments clone 123 --name my-clone --from-file overrides.md  # clone with changes

# Update an experiment
abs experiments update 123 --display-name "New Name"
abs experiments update 123 --name new_name --state running
abs experiments update 123 --percentage-of-traffic 50 --percentages 30,70
abs experiments update 123 --primary-metric 145 --unit-type 3 --application-id 5
abs experiments update 123 --variants "control,treatment,treatment2"
abs experiments update 123 --secondary-metrics "Revenue,Bookings"
abs experiments update 123 --guardrail-metrics "Error rate"
abs experiments update 123 --teams "Product,Engineering" --tags "v1,mobile"
abs experiments update 123 --audience '{"filter":[]}'
abs experiments update 123 --analysis-type fixed_horizon --required-alpha 0.05
abs experiments update 123 --owner 10 --owner 20
abs experiments update 123 --screenshot-id 0:376 --screenshot-id 1:378  # restore screenshots by upload ID
abs experiments update 123 --from-file experiment.md     # update from template
abs experiments update 123 --from-file experiment.md --dry-run
abs experiments update 123 -i                            # interactive editor

# Lifecycle transitions
abs experiments development 123                          # enter development mode
abs experiments start 123                                # start experiment
abs experiments start 123 --note "Ready for traffic"     # with activity note
abs experiments stop 123                                 # stop experiment
abs experiments stop 123 --reason hypothesis_rejected --note "Inconclusive results"
abs experiments restart 123 --reason other --reshuffle   # restart stopped experiment
abs experiments restart 123 --from-file changes.md       # restart with template changes
abs experiments restart 123 --as-type feature            # restart as feature flag
abs experiments full-on 123 --variant 1                  # set full-on variant

# Archive
abs experiments archive 123
abs experiments archive 123 --note "Cleaning up old experiments"
abs experiments archive 123 --unarchive

# Metric results (--from/--to accept all date formats, see [date formats](#date-formats))
abs experiments metrics list 123                         # list assigned metrics
abs experiments metrics results 123                      # show results with CI as [lower, upper]
abs experiments metrics results 123 --ci-bar             # visual CI bar ╌╌╌┊╌══●══╌╌╌
abs experiments metrics results 123 --variant-index      # use v0, v1, v2 instead of names
abs experiments metrics results 123 --metric 6           # any metric, even unassigned
abs experiments metrics results 123 --segment Device     # segment breakdown by name
abs experiments metrics results 123 --segment Device Country  # multiple segments
abs experiments metrics results 123 --filter '{"filter":[...]}' # raw segment filter JSON
abs experiments metrics results 123 --from 7d --to now   # time range filter
abs experiments metrics results 123 --cached             # use previewer cached results (fast)
abs experiments metrics results 123 -o json              # programmatic metric access
abs experiments metrics add 123 --metrics 1,2,3
abs experiments metrics confirm-impact 123 456
abs experiments metrics exclude 123 456
abs experiments metrics include 123 456

# Metric dependencies
abs experiments metrics deps 145                         # show experiments using metric
abs experiments metrics deps 145 -o json                 # as JSON
```

Impact values are colored by significance and metric effect direction:
- **Green**: significant positive outcome (e.g. conversion rate up, or cancellations down)
- **Red**: significant negative outcome (e.g. conversion rate down, or cancellations up)
- **Purple**: significant but metric has unknown expected direction
- **No color**: confidence interval crosses zero (result not statistically significant)

```bash

# Activity log
abs experiments activity list 123
abs experiments activity create 123 --note "Deployed to staging"
abs experiments activity edit 123 456 --note "Updated note"
abs experiments activity reply 123 456 --note "Looks good"

# Parent experiment
abs experiments parent 123                               # get parent experiment

# Follow/unfollow
abs experiments follow 123
abs experiments unfollow 123

# Annotations
abs experiments annotations list 123
abs experiments annotations create 123 --type global
abs experiments annotations update 456 --type local
abs experiments annotations archive 456

# Alerts and recommendations
abs experiments alerts list 123
abs experiments alerts dismiss 456
abs experiments recommendations list 123
abs experiments recommendations dismiss 456

# Analyze experiment design + signals + benchmarks (returns JSON by default)
abs experiments analyze 123                              # full structured analysis (JSON)
abs experiments analyze checkout_redesign                # by name
abs experiments analyze 123 -o table                     # flat one-row summary
abs experiments analyze 123 -o yaml                      # full analysis as YAML
abs experiments analyze 123 | jq .recommendation         # pluck a single section
abs experiments analyze 123 | jq '[.heuristic_output[] | select(.fired)]'

# Access control
abs experiments access list-users 123
abs experiments access grant-user 123 --user 1 --role 2
abs experiments access revoke-user 123 --user 1 --role 2
abs experiments access list-teams 123
abs experiments access grant-team 123 --team 1 --role 2
abs experiments access revoke-team 123 --team 1 --role 2

# Export data and request update
abs experiments export 123
abs experiments request-update 123
abs experiments request-update 123 --tasks preview_metrics,preview_summary
abs experiments request-update 123 --replace-gsa
abs experiments request-update 123 --tasks preview_group_sequential --replace-gsa

# Schedule future actions
abs experiments schedule create 123 --action start --at 2027-01-15T10:00:00Z
abs experiments schedule create 123 --action stop --at 2027-01-30T18:00:00+02:00 --reason testing
abs experiments schedule delete 123 456

# Compare experiments
abs experiments diff 22838 22839                         # diff two experiments
abs experiments diff 22838 --iteration 6                 # diff with a previous iteration
abs experiments diff 22838 22839 -o json                 # diff as JSON
abs experiments diff 22838 22839 --raw                   # diff full API response

# Watch live results
abs experiments watch 22838                              # poll metrics every 60s
abs experiments watch 22838 --interval 30                # poll every 30s
abs experiments watch 22838 --variant-index              # use v0, v1, v2 instead of names

# Bulk operations
abs experiments bulk start 123 456 789 --note "Resuming"
abs experiments bulk stop 123 456 --reason hypothesis_rejected --note "Results inconclusive"
abs experiments bulk archive 123 456 --yes
abs experiments bulk full-on 123 --variant 1 --note "Winner confirmed"
abs experiments bulk development 123 456 --note "Moving to dev"
abs experiments bulk stop --state running --app my-app --note "Maintenance"

# Unix pipe composition
# List outputs IDs when piped; action commands read IDs from stdin and pass them through
abs experiments list --state running | abs experiments stop --reason other --note "Stopping all"
abs experiments list --state stopped | abs experiments archive --note "Cleanup"
abs experiments list --search e2e- --state running | abs experiments stop --reason testing | abs experiments archive --note "Done"

# Pipe to bulk (auto-detects stdin)
abs experiments list --state running --app my-app | abs experiments bulk stop --reason other

# Interactive mode: prompts for note (uses dashboard config for defaults/required)
abs experiments stop 123 -i
abs experiments archive 123 -i

# Generate a markdown template for experiment creation
abs experiments generate-template -o experiment.md

# Refresh cached fields (custom fields + action dialog config for notes)
abs experiments refresh-fields

# Estimate maximum participants for an experiment
abs experiments estimate-participants --unit-type user_id
abs experiments estimate-participants --unit-type user_id --application absmartly.com
abs experiments estimate-participants --unit-type 42 --application 1 --application 2
abs experiments estimate-participants --unit-type user_id --from 90d
abs experiments estimate-participants --unit-type user_id --application absmartly.com --audience '{"filter":{"and":[{"eq":[{"var":{"path":"application"}},{"value":"absmartly.com"}]}]}}'
abs experiments estimate-participants --unit-type user_id -o json
```

#### Analyze experiment

`abs experiments analyze <id>` produces a single structured document that combines what you'd otherwise piece together from `get`, `metrics results`, `alerts list`, `recommendations list`, and `list --type`. It's designed to be consumed by an LLM-based analyzer or a human reviewer; the JSON shape is stable.

Default output is **JSON** (the `-o table` global default is overridden when `-o` is not explicitly set, since the data is deeply nested). `-o yaml` works the same way. `-o table`/`-o markdown`/`-o plain` switch to a flat one-row summary suitable for tabular display.

The output has nine top-level sections:

| Section | What it contains |
|---|---|
| `experiment` | Headline facts: `name`, `state`, `hypothesis`, `primary_metric_name`, `participant_count`, `leading_variant_*`, `current_recommended_action`, `report_note`. |
| `alerts` | Active alerts (`{id, type, dismissed}`): `srm`, `audience_mismatch`, `cleanup_needed`, etc. |
| `recommendation` | The single best deterministic recommendation (`{theme, title, details}`) picked from the heuristic rule set, or `null`. Warnings outrank successes. |
| `metric_signals` | Per-metric / per-variant rows from `metrics_snapshot` with `percent_change`, `p_value`, CI bounds, and a derived `status`: `improves` / `contradicts` / `flat` / `inconclusive`. |
| `related_experiments` | Up to 24 recent same-type experiments. For peers that share the primary metric, `leading_variant_impact_percent` is fetched and compared. |
| `analysis_confidence` | `high` / `medium` / `low` plus 5 boolean factors and human-readable reasons. Captures *whether there's enough signal to analyze*. |
| `design_readout` | Whether the experiment design fits the question: summary line, parameter pass-through, and a benchmark from related experiments when available. |
| `source_signals` | Audit trail mapping each derived field to its API source path (e.g. `experiment.metrics_snapshot.rows[*].percent_change`). Useful for verifying AI analyses. |
| `heuristic_output` | All 9 heuristic rules with `{rule, fired, theme, title, details, evidence}`. The starting point for an AI analysis when one is available. |

**Example output** (illustrative: a running experiment with a metric snapshot, two comparable peers, a primary-metric win, and a contradicting guardrail):

```json
{
  "experiment": {
    "id": 18234,
    "name": "checkout_redesign",
    "type": "test",
    "state": "running",
    "hypothesis": "Single-page checkout reduces drop-off by surfacing all required fields earlier.",
    "primary_metric_name": "Checkout Completion Rate",
    "unit_type_name": "user_id",
    "participant_count": 102450,
    "leading_variant_name": "treatment",
    "leading_variant_impact_percent": 3.8,
    "leading_variant_confidence": 0.987,
    "current_recommended_action": "review",
    "report_note": "Treatment is winning on primary metric; awaiting eng review of latency regression."
  },
  "alerts": [
    { "id": 1042, "type": "sample_size_reached", "dismissed": false }
  ],
  "recommendation": {
    "theme": "warning",
    "title": "Review guardrail regressions before rolling out treatment.",
    "details": "At least one guardrail metric is moving in the wrong direction, so the apparent win on the primary metric should not be treated as rollout-ready yet."
  },
  "metric_signals": [
    {
      "metric_id": 14, "metric_name": "Checkout Completion Rate", "metric_type": "primary",
      "variant_id": 1, "variant_name": "treatment",
      "percent_change": 3.8, "p_value": 0.013, "ci_low": 1.6, "ci_high": 6.0,
      "status": "improves"
    },
    {
      "metric_id": 18, "metric_name": "P95 Page Latency", "metric_type": "guardrail",
      "variant_id": 1, "variant_name": "treatment",
      "percent_change": 4.2, "p_value": 0.022, "ci_low": 0.9, "ci_high": 7.5,
      "status": "contradicts"
    },
    {
      "metric_id": 21, "metric_name": "Revenue per Visitor", "metric_type": "secondary",
      "variant_id": 1, "variant_name": "treatment",
      "percent_change": 0.4, "p_value": 0.61, "ci_low": -1.1, "ci_high": 1.9,
      "status": "flat"
    }
  ],
  "related_experiments": [
    {
      "id": 17988, "name": "checkout_steps_v2", "state": "stopped",
      "started_at": "2025-09-04T12:00:00Z", "stopped_at": "2025-10-02T16:00:00Z",
      "primary_metric_id": 14, "primary_metric_name": "Checkout Completion Rate",
      "leading_variant_impact_percent": 2.1
    },
    {
      "id": 18012, "name": "guest_checkout_default", "state": "stopped",
      "started_at": "2025-10-15T09:00:00Z", "stopped_at": "2025-11-12T09:00:00Z",
      "primary_metric_id": 14, "primary_metric_name": "Checkout Completion Rate",
      "leading_variant_impact_percent": 4.6
    },
    {
      "id": 18103, "name": "trust_badges_above_fold", "state": "running",
      "started_at": "2025-12-01T10:00:00Z", "stopped_at": null,
      "primary_metric_id": 14, "primary_metric_name": "Checkout Completion Rate",
      "leading_variant_impact_percent": null
    }
  ],
  "analysis_confidence": {
    "level": "high",
    "reasons": [],
    "factors": {
      "sample_size_reached": true,
      "hypothesis_present": true,
      "primary_metric_present": true,
      "guardrails_present": true,
      "no_blocking_alerts": true
    }
  },
  "design_readout": {
    "summary": "Designed to detect effects in the expected range; comparable experiments moved this metric by ~3.35%.",
    "notes": [],
    "parameters": {
      "analysis_type": "group_sequential",
      "required_alpha": 0.1,
      "required_power": 0.8,
      "minimum_detectable_effect": 2.5,
      "baseline_primary_metric_mean": 0.382,
      "baseline_participants_per_day": 7400,
      "percentage_of_traffic": 100
    },
    "benchmark": {
      "observed_impacts": [2.1, 4.6],
      "median_abs_impact": 3.35
    }
  },
  "source_signals": [
    { "covers": "experiment.participant_count",
      "source": "experiment.metrics_snapshot.rows[*].cum_unit_count" },
    { "covers": "experiment.leading_variant_impact_percent",
      "source": "experiment.metrics_snapshot.rows[*].percent_change" },
    { "covers": "alerts",
      "source": "experiment.alerts[*].type" },
    { "covers": "experiment.current_recommended_action",
      "source": "experiment.recommended_action.recommendation" },
    { "covers": "experiment.report_note",
      "source": "experiment.experiment_report.experiment_note.note" },
    { "covers": "related_experiments[17988].leading_variant_impact_percent",
      "source": "experiments/17988/metrics/main.percent_change" },
    { "covers": "related_experiments[18012].leading_variant_impact_percent",
      "source": "experiments/18012/metrics/main.percent_change" }
  ],
  "heuristic_output": [
    { "rule": "blocking_alert", "fired": false, "theme": "warning",
      "title": "Investigate the experiment before making a rollout decision.",
      "details": "Active health checks indicate that the current results may be misleading. Resolve the data-quality or assignment issue before acting on the outcome.",
      "evidence": { "alert_types": [] } },
    { "rule": "cleanup_needed", "fired": false, "theme": "warning",
      "title": "Clean up stale assignments before proceeding.",
      "details": "The experiment has cleanup_needed signals; old data may skew the analysis.",
      "evidence": { "alert_ids": [] } },
    { "rule": "guardrail_contradicts", "fired": true, "theme": "warning",
      "title": "Review guardrail regressions before rolling out treatment.",
      "details": "At least one guardrail metric is moving in the wrong direction, so the apparent win on the primary metric should not be treated as rollout-ready yet.",
      "evidence": { "metrics": ["P95 Page Latency"] } },
    { "rule": "primary_metric_significant_loss", "fired": false, "theme": "warning",
      "title": "Primary metric regressed at significance.",
      "details": "The leading variant moves the primary metric in the wrong direction with p-value below alpha. Do not roll out.",
      "evidence": { "variant": "treatment", "impact_percent": 3.8, "p_value": 0.013 } },
    { "rule": "primary_metric_significant_win", "fired": true, "theme": "success",
      "title": "Primary metric improved with treatment.",
      "details": "The leading variant beat baseline on the primary metric with p-value below alpha.",
      "evidence": { "variant": "treatment", "impact_percent": 3.8, "p_value": 0.013 } },
    { "rule": "sample_size_not_reached", "fired": false, "theme": "info",
      "title": "Sample size not reached.",
      "details": "Group-sequential analysis has not yet hit its planned sample size; treat results as interim.",
      "evidence": {} },
    { "rule": "hypothesis_missing", "fired": false, "theme": "info",
      "title": "No hypothesis recorded for this experiment.",
      "details": "Without a written hypothesis it is hard to judge whether the result answers the original question.",
      "evidence": {} },
    { "rule": "no_recommendation_overdue", "fired": false, "theme": "info",
      "title": "Experiment has been running long without a recommended action.",
      "details": "Consider whether to stop, full-on, or iterate; running indefinitely is rarely the best option.",
      "evidence": { "days_running": 18 } },
    { "rule": "snapshot_unavailable", "fired": false, "theme": "info",
      "title": "No metric snapshot is available yet.",
      "details": "The previewer may not have processed this experiment; analysis is limited to design parameters.",
      "evidence": {} }
  ]
}
```

Notice how the sections reinforce each other in this example:

- `metric_signals` shows the primary metric improving (`status: improves`) AND a guardrail contradicting (`status: contradicts`).
- That guardrail status drives `heuristic_output[guardrail_contradicts].fired = true` (theme `warning`).
- Both `guardrail_contradicts` (warning) and `primary_metric_significant_win` (success) fired. `recommendation` is the first fired warning, so the headline becomes "Review guardrail regressions…", even though the primary metric is winning.
- `analysis_confidence` is `high`: all five factors are true (sample size reached, hypothesis present, primary metric present, guardrails present, no blocking alerts).
- `design_readout.benchmark.median_abs_impact` (3.35%) is computed from the two comparable peers; the summary phrasing "designed to detect effects in the expected range" follows because the median is ≥ 1.5× the MDE (2.5%).
- `source_signals` records one entry per derived field plus per peer-fetch, the audit trail an LLM analyst can cite.

**Example: distilled view via jq:**

```bash
$ abs experiments analyze 18234 \
    | jq '{name: .experiment.name,
           confidence: .analysis_confidence.level,
           recommendation: .recommendation.title,
           fired: [.heuristic_output[] | select(.fired) | .rule]}'
```
```json
{
  "name": "checkout_redesign",
  "confidence": "high",
  "recommendation": "Review guardrail regressions before rolling out treatment.",
  "fired": [
    "guardrail_contradicts",
    "primary_metric_significant_win"
  ]
}
```

Useful jq slices:

```bash
# Headline only
abs experiments analyze 123 \
  | jq '{state: .experiment.state, confidence: .analysis_confidence.level, recommendation}'

# Just the rules that fired
abs experiments analyze 123 \
  | jq '[.heuristic_output[] | select(.fired) | {rule, theme, title}]'

# Audit trail of where each derived field came from
abs experiments analyze 123 | jq .source_signals

# Compare two experiments at a glance
for id in 123 456; do
  abs experiments analyze "$id" \
    | jq --arg id "$id" '{id: $id, name: .experiment.name,
                          confidence: .analysis_confidence.level,
                          fired: [.heuristic_output[] | select(.fired) | .rule]}'
done
```

The 9 heuristic rules, in evaluation order:

| Rule | Theme | Fires when |
|---|---|---|
| `blocking_alert` | warning | active alert in `{srm, audience_mismatch, assignment_conflict, experiments_interact}` |
| `cleanup_needed` | warning | active `cleanup_needed` alert |
| `guardrail_contradicts` | warning | any guardrail metric_signal status is `contradicts` |
| `primary_metric_significant_loss` | warning | leading-variant primary `p_value < alpha` and `impact_percent < 0` |
| `primary_metric_significant_win` | success | leading-variant primary `p_value < alpha` and `impact_percent > 0` |
| `sample_size_not_reached` | info | running, group_sequential, no `sample_size_reached` alert |
| `hypothesis_missing` | info | `experiment.hypothesis` empty/null |
| `no_recommendation_overdue` | info | running ≥ 21 days without a recommended action |
| `snapshot_unavailable` | info | `metrics_snapshot` not yet computed by the previewer |

`recommendation` is the first fired `warning` rule, falling back to the first fired `success`, else `null`. When no human/AI analyst is available, `heuristic_output` is the deterministic baseline analysis.

`analysis_confidence.level` is computed from five boolean factors (`sample_size_reached`, `hypothesis_present`, `primary_metric_present`, `guardrails_present`, `no_blocking_alerts`): `low` when any blocking alert is active OR ≥2 factors are missing, `medium` when exactly one factor is missing, `high` when all five hold.

#### Custom field options

After running `abs experiments refresh-fields`, custom fields from your ABsmartly instance appear as native CLI options:

```bash
abs experiments create --help
# Shows: --hypothesis <value>, --jira-url <value>, etc.

abs experiments create --name test --hypothesis "We believe X" --jira-url "https://jira.example.com/IT-1"
abs experiments update 123 --hypothesis "Updated hypothesis"
abs experiments restart 123 --hypothesis "New iteration"

# Generic fallback (works without cache)
abs experiments create --name test --field "Hypothesis=We believe X"
```

Custom field values are sent to the API as an object keyed by each field's numeric id (e.g. `{"75": {"type": "boolean", "value": "false"}}`), not as an array — the CLI builds this shape for you, so you never need to construct it by hand. If you're calling the API directly (e.g. from your own script or a custom MCP server) and want to see the exact payload the CLI sends, add `--show-request`:

```bash
abs experiments update 123 --field "Hypothesis=Updated hypothesis" --show-request
# → PUT https://your-instance.absmartly.io/experiments/123
#   Accept: application/json
#   Content-Type: application/json
#   Authorization: Api-Key ***
#   User-Agent: absmartly-cli/1.14.0
#
#   {
#     "id": 123,
#     "data": {
#       ...
#       "custom_section_field_values": {
#         "12": { "type": "string", "value": "Updated hypothesis" }
#       }
#     }
#   }
```

This is the fastest way to confirm the exact shape a working request has, if you're getting an "Unknown or read-only fields" or "custom field values are required" error while integrating directly against the REST API.

#### Summary output

All `list` and `get` commands return summarized output by default. Use `--raw` for the full API response.

```bash
abs experiments get 123 -o json                          # clean summary as JSON
abs experiments get 123 -o json --raw                    # full API response
abs experiments get 123 -o rendered                      # terminal-rendered markdown with styling
abs experiments list --show experiment_report archived    # add extra fields
abs experiments list --exclude owner impact confidence    # hide fields
abs metrics list --show description --exclude effect      # works on all entities
abs goals get 1 --show created_by_user_id
```

The `rendered` format outputs terminal-styled markdown with bold, tables, syntax-highlighted code blocks, ● bullets, and │ blockquotes.

JSON and YAML outputs include syntax highlighting by default. Use `--no-color` to disable it.

#### Unix pipe composition

Commands are composable via standard Unix pipes. When stdout is piped, `list` commands output one ID per line. Action commands (`stop`, `archive`, `start`, `development`, `full-on`) read IDs from stdin when piped, process each experiment, and pass IDs through to stdout for chaining.

```bash
# Stop all running experiments, then archive them
abs experiments list --state running | abs experiments stop --reason other --note "Cleanup" | abs experiments archive --note "Done"

# Archive stopped experiments matching a search term
abs experiments list --search e2e- --state stopped | abs experiments archive --note "Removing test experiments"

# Pipe into other tools
abs experiments list --state running | wc -l              # count running experiments
abs experiments list --state running | head -5 | abs experiments stop --reason other
```

When piped, status messages (✓ Experiment N stopped) go to stderr so they don't interfere with the ID stream on stdout. Use `-o json` or `-o yaml` to get full structured output even when piped.

By default, failed IDs are **not** passed through the pipe: only successfully processed IDs flow to the next command. Use `--pass-through` to pass all IDs (including failures) so a downstream command can attempt its own operation:

```bash
# Default: only successfully stopped experiments get archived
abs experiments list --state running | abs experiments stop --reason other | abs experiments archive

# With --pass-through: all IDs flow through even if stop fails
abs experiments list --state running | abs experiments stop --reason other --pass-through | abs experiments archive
```

#### Action dialog configuration

Action commands (`stop`, `start`, `archive`, etc.) respect the action dialog field configuration from your ABsmartly dashboard. After running `abs experiments refresh-fields`, the CLI will:

- Use the configured **default note text** when `--note` is not provided
- **Require** `--note` when the dashboard marks the note as mandatory
- Show the configured **description** as the prompt when using `-i` (interactive mode)

```bash
abs experiments refresh-fields                            # cache action dialog config
abs experiments stop 123                                  # uses default note from config
abs experiments stop 123 --note "Custom note"             # overrides default
abs experiments stop 123 -i                               # interactive prompt with config defaults
```

#### Experiment list filters

| Filter | Description |
|---|---|
| `--state <state>` | `created`, `ready`, `running`, `development`, `full_on`, `stopped`, `archived`, `scheduled` |
| `--type <type>` | `test`, `feature` |
| `--app <name>` | Filter by application name |
| `--applications <values>` | Filter by application names or IDs (comma-separated) |
| `--search <query>` | Search by name or display name |
| `--ids <ids>` | Filter by experiment IDs (comma-separated) |
| `--unit-types <values>` | Comma-separated unit type names or IDs |
| `--owners <values>` | Comma-separated owner names, emails, or IDs |
| `--teams <values>` | Comma-separated team names or IDs |
| `--tags <values>` | Comma-separated tag names or IDs |
| `--impact <min,max>` | Filter by impact range (e.g. `-5,50`) |
| `--confidence <min,max>` | Filter by confidence range (e.g. `90,100`) |
| `--significance <value>` | `positive`, `negative`, `neutral`, `inconclusive` |
| `--iterations <n>` | Filter by iteration count |
| `--iterations-of <id>` | Show all iterations of an experiment |
| `--created-after <ts>` | Filter by creation date (see [date formats](#date-formats)) |
| `--created-before <ts>` | Filter by creation date |
| `--started-after <ts>` | Filter by start date |
| `--started-before <ts>` | Filter by start date |
| `--stopped-after <ts>` | Filter by stop date |
| `--stopped-before <ts>` | Filter by stop date |
| `--analysis-type <type>` | `fixed_horizon`, `group_sequential` |
| `--running-type <type>` | `full_on`, `experiment` |
| `--alert-srm` | Has sample ratio mismatch alert (pass `0` for no alert) |
| `--alert-cleanup-needed` | Has cleanup needed alert |
| `--alert-sample-size-reached` | Sample size reached alert |
| `--items <n>` | Results per page (default: 20) |
| `--page <n>` | Page number (default: 1) |
| `--sort <field>` | Sort by field (e.g. `created_at`, `name`, `state`) |
| `--asc` | Sort ascending |
| `--desc` | Sort descending |
| `--show <fields...>` | Add extra columns (e.g. `experiment_report archived`) |
| `--exclude <fields...>` | Hide columns (e.g. `primary_metric owner`) |

#### Date formats

All `--from`, `--to`, `--since`, `--created-after`, `--started-before`, and other date/timestamp options across the CLI accept the same formats:

| Format | Example |
|---|---|
| Relative (short) | `7d`, `2w`, `1mo`, `24h`, `30m`, `1y` |
| Relative (with ago) | `7d ago`, `2 weeks ago`, `3 months ago` |
| Keywords | `today`, `yesterday`, `now` |
| Calendar | `month-start`, `last-month-start`, `last-month-end`, `year-start`, `last-year-start`, `last-year-end` |
| ISO 8601 date | `2024-01-01` |
| ISO 8601 datetime | `2024-01-01T00:00:00Z` |
| Epoch milliseconds | `1704067200000` |

Relative units: `m` (minutes), `h` (hours), `d` (days), `w` (weeks), `mo` (months), `y` (years). Case-insensitive.

Date inputs default to **your local timezone**. `today` and `yesterday` are calendar-aligned (00:00 local); `2024-01-01` is parsed as local midnight; calendar keywords resolve to local boundaries (`month-start` is 00:00 on the 1st of the current month in your local timezone; `last-month-end` is 1ms before the start of the current month). Explicit ISO datetimes with `Z` (e.g. `2024-01-01T00:00:00Z`) and epoch ms are taken as-is. For deterministic UTC boundaries in automation, run with `TZ=UTC`.

Commands using date formats:
- `abs experiments list --created-after`, `--created-before`, `--started-after`, `--started-before`, `--stopped-after`, `--stopped-before`
- `abs experiments metrics results --from`, `--to`
- `abs activity-feed list --since`
- `abs events list --from`, `--to`
- `abs events history --from`, `--to`
- `abs events json-values --from`, `--to`
- `abs events json-layouts --from`, `--to`
- `abs events summary --from`, `--to`

```bash
abs experiments list --created-after 7d                  # last 7 days
abs experiments list --stopped-after "30 days ago"       # stopped in last month
abs experiments list --started-after yesterday
abs experiments list --created-after 2024-01-01          # since Jan 1 2024
abs experiments metrics results 123 --from 7d --to now
abs activity-feed list --since 1h
abs events list --from 2w --to yesterday
abs events summary --from month-start                    # current calendar month
abs events summary --from last-month-start --to last-month-end   # exactly last calendar month
```

#### Valid reasons for stop and restart

The `--reason` option for `stop` and `restart` accepts these values:

| Reason | Description |
|---|---|
| `hypothesis_rejected` | Hypothesis was disproven |
| `hypothesis_iteration` | Iterating on the hypothesis |
| `user_feedback` | Based on user feedback |
| `data_issue` | Data quality problems |
| `implementation_issue` | Bug or implementation problem |
| `experiment_setup_issue` | Experiment configuration error |
| `guardrail_metric_impact` | Guardrail metric triggered |
| `secondary_metric_impact` | Secondary metric concern |
| `operational_decision` | Business/operational decision |
| `performance_issue` | Performance degradation |
| `testing` | Test or QA purposes |
| `tracking_issue` | Tracking/instrumentation problem |
| `code_cleaned_up` | Code has been cleaned up |
| `other` | Other reason |

#### Valid schedule actions

The `abs experiments schedule create --action` option accepts: `start`, `restart`, `development`, `stop`, `archive`, `full_on`.

The `--at` timestamp must include a timezone, either `Z` (UTC) or an offset like `+02:00`. The time must be in the future.

```bash
abs experiments schedule create 123 --action start --at 2027-01-15T10:00:00Z
abs experiments schedule create 123 --action stop --at 2027-01-30T18:00:00+02:00
```

#### Valid request-update tasks

The `abs experiments request-update --tasks` option accepts a comma-separated list of:

| Task | Description |
|---|---|
| `preview_metrics` | Refresh metric results |
| `preview_summary` | Refresh experiment summary |
| `preview_group_sequential` | Refresh group sequential analysis |
| `preview_report_metrics` | Refresh report metrics |
| `preview_participants_history` | Refresh participant history |
| `check_cleanup_needed` | Check if code cleanup is needed |
| `check_audience_mismatch` | Check for audience mismatch |
| `check_sample_size` | Check sample size reached |
| `check_sample_ratio_mismatch` | Check for SRM |
| `check_interactions` | Check for interactions |
| `check_assignment_conflict` | Check for assignment conflicts |
| `check_metric_threshold` | Check metric thresholds |

### Activity feed

Global activity feed across all experiments. Scans recent experiments and aggregates their activity notes. `--since` accepts all [date formats](#date-formats).

Aliases: `activity-feed`

```bash
# List recent activity
abs activity-feed list
abs activity-feed list --since 7d
abs activity-feed list --search checkout_redesign         # filter by experiment name
abs activity-feed list --state running --experiments 100   # scan more experiments
abs activity-feed list --limit 50                          # show more entries

# Show rendered markdown notes (bold, code, tables, mentions resolved to names)
abs activity-feed list --notes
abs activity-feed list --notes --show-images               # inline images in notes

# Watch activity in real-time
abs activity-feed watch --notes
abs activity-feed watch --interval 10 --notes
abs activity-feed watch --state running

# Per-experiment activity (also accepts names)
abs experiments activity list checkout_redesign --notes
abs experiments activity list checkout_redesign --notes --show-images
abs experiments activity create checkout_redesign --note "Deployed to staging"
```

Notes render with full markdown support via `marked-terminal`: **bold**, *italic*, `code`, tables, ● bullets, │ blockquotes, syntax-highlighted code blocks, and @mention resolution (user/team names).

### Feature flags

`abs features` is the same as `abs experiments` but auto-filters to `type=feature`.
All subcommands work identically.

```bash
abs features list
abs features get 123
abs features create --from-file flag.md
abs features clone 123 --name my-clone
abs features restart 123 --as-type experiment    # convert to experiment
```

### Goals

Aliases: `goals`, `goal`

```bash
abs goals list
abs goals get 123
abs goals create --name "Purchase completed"
abs goals update 123 --description "Updated description"

# Follow/unfollow
abs goals follow 123
abs goals unfollow 123

# Access control
abs goals access list-users 123
abs goals access grant-user 123 --user 1 --role 2
abs goals access revoke-user 123 --user 1 --role 2
```

### Segments

Aliases: `segments`, `segment`

```bash
abs segments list
abs segments get 123
abs segments create my-segment --attribute user_country
abs segments update 123 --description "Updated"
abs segments delete 123
```

### Metrics

Aliases: `metrics`, `metric`

```bash
abs metrics list
abs metrics list --search "revenue"
abs metrics list --owners 1,2 --teams 3                   # by IDs
abs metrics list --owners "jane@example.com" --teams Growth  # by name/email
abs metrics list --review-status pending
abs metrics list --sort name --asc
abs metrics list --ids 1,2,3

# Client-side filters (applied across all pages)
abs metrics list --metric-type goal_ratio,custom_sql
abs metrics list --goal purchase                          # name or ID, incl. denominator
abs metrics list --outlier-limiting                       # has limiting; --no-outlier-limiting for none
abs metrics list --outlier-method quantile,stdev
abs metrics list --has-property-filter                    # --no-property-filter for none
abs metrics list --property-filter-path page_name
abs metrics list --property-filter-contains BookingFullDetails
abs metrics list --impact-direction positive,negative
abs metrics list --cuped                                  # --no-cuped for none
abs metrics get 123
abs metrics create --name "Revenue" --type count
abs metrics update 123 --description "Updated"
abs metrics archive 123
abs metrics archive 123 --unarchive

# Follow/unfollow
abs metrics follow 123
abs metrics unfollow 123

# Reviews
abs metrics review status 123
abs metrics review request 123
abs metrics review approve 123
abs metrics review comments 123
abs metrics review comment 123 --message "Looks correct"
abs metrics review reply 123 456 --message "Thanks"

# Access control
abs metrics access list-users 123
abs metrics access grant-user 123 --user 1 --role 2
abs metrics access revoke-user 123 --user 1 --role 2
```

#### Metric list filters (client-side)

These filters run client-side: when any is set, the CLI fetches every metric and filters locally. They combine with AND across flags and OR within a comma-separated list. Because the full set is fetched and filtered, `--items`/`--page` do not apply while filtering, and every match is shown. (Server-side equivalents are a planned follow-up.)

| Filter | Description |
|---|---|
| `--metric-type <values>` | `goal_count`, `goal_unique_count`, `goal_time_to_achievement`, `goal_property`, `goal_property_unique_count`, `goal_ratio`, `goal_retention`, `goal_activity_period_count`, `custom_sql` |
| `--goal <values>` | Goal name (substring) or ID; matches numerator and denominator goals |
| `--outlier-limiting` / `--no-outlier-limiting` | Has / does not have outlier limiting (method other than `unlimited`) |
| `--outlier-method <values>` | `unlimited`, `quantile`, `stdev`, `fixed` |
| `--has-property-filter` / `--no-property-filter` | Has / does not have a goal property filter |
| `--property-filter-path <values>` | Property path(s) referenced inside the property filter (substring) |
| `--property-filter-contains <text>` | Substring anywhere in the serialized property filter |
| `--impact-direction <values>` | `positive`, `negative`, `unknown` |
| `--cuped` / `--no-cuped` | Has / does not have CUPED (variance reduction) enabled |

### Teams

Aliases: `teams`, `team`

```bash
abs teams list
abs teams list --include-archived
abs teams get 123
abs teams create --name "Growth"
abs teams update 123 --description "Updated"
abs teams archive 123
abs teams archive 123 --unarchive

# Team members
abs teams members list 123
abs teams members add 123 --users 1,2,3 --roles 1,2
abs teams members edit-roles 123 --users 1,2 --roles 3,4
abs teams members remove 123 --users 1,2
```

### Users

Aliases: `users`, `user`

```bash
abs users list
abs users list --include-archived
abs users list --search alice                          # server-side fuzzy search across name/email/department/job_title
abs users list --sort email --asc                     # sort by a field
abs users list --ids 1,2,3                             # filter by user IDs
abs users get 123
abs users create --email user@example.com --name "Jane Doe"
abs users update 123 --name "Jane Smith"
abs users archive 123
abs users archive 123 --unarchive

# Filter users by department, role, job title, email, or name (multi-value, exact by default)
abs users list --department Ancillaries                       # everyone in Ancillaries
abs users list --department Ancillaries,Finance              # Ancillaries OR Finance
abs users list --role "API User"                             # everyone with the API User role (name or numeric ID)
abs users list --role "API User",Admin --department Ancillaries  # role AND department
abs users list --job-title CEO --department Ancillaries
abs users list --email alice@acme.com,bob@acme.com
abs users list --name "Alice Smith"
abs users list --department anc --contains                  # substring match (case-insensitive) for department/job-title/email/name
# When a field filter is active, a `roles` column (global-team roles) is shown;
# the API has no server-side department/role filter, so client filters scan all
# users (200/page) and paginate the matched set.

# Reset password
abs users reset-password 123

# User API keys
abs users api-keys list --user 42                           # by user ID
abs users api-keys list --user "jane@example.com"            # by email
abs users api-keys list --user "Jane Doe"                    # by name
abs users api-keys get 1 --user 42
abs users api-keys create --user 42 --name "CI Key"
abs users api-keys create --user 42 --name "CI Key" --description "For CI/CD"
abs users api-keys update 1 --user 42 --name "Renamed"
abs users api-keys delete 1 --user 42
```

### Tags

Manage tags for experiments, goals, and metrics.

```bash
# Experiment tags (aliases: tags, tag, experiment-tags)
abs tags list
abs tags get 1
abs tags create --tag "pricing"
abs tags update 1 --tag "pricing-v2"
abs tags delete 1

# Goal tags (aliases: goal-tags, goaltags)
abs goal-tags list
abs goal-tags create --tag "revenue"
abs goal-tags delete 1

# Metric tags (aliases: metric-tags, metrictags)
abs metric-tags list
abs metric-tags create --tag "engagement"
abs metric-tags delete 1
```

### Metric categories

Aliases: `metric-categories`, `metriccategories`, `metric-cats`

```bash
abs metric-categories list
abs metric-categories get 1
abs metric-categories create --name "Revenue" --color "#FF5733"
abs metric-categories update 1 --name "Revenue Metrics"
abs metric-categories archive 1
```

### Applications

Aliases: `apps`, `app`, `application`

```bash
abs apps list
abs apps get 1
abs apps create --name "Mobile App"
abs apps update 1 --name "Mobile App v2"
abs apps archive 1
abs apps archive 1 --unarchive
```

### Environments

Aliases: `envs`, `env`, `environment`

```bash
abs envs list
abs envs get 1
abs envs create --name "staging"
abs envs update 1 --name "production"
abs envs archive 1
abs envs archive 1 --unarchive
```

### Unit types

Aliases: `units`, `unit`

```bash
abs units list
abs units get 1
abs units create --name "device_id"
abs units update 1 --name "user_id"
abs units archive 1
abs units archive 1 --unarchive
```

### Administration

#### Roles

Aliases: `roles`, `role`

```bash
abs roles list
abs roles get 1
abs roles create --name "Editor"
abs roles update 1 --description "Can edit experiments"
abs roles delete 1
```

#### Permissions

Aliases: `permissions`, `permission`, `perms`, `perm`

```bash
abs permissions list
abs permissions categories
abs permissions policies
```

#### API keys

Aliases: `api-keys`, `apikeys`, `apikey`, `api-key`

```bash
abs api-keys list
abs api-keys get 1
abs api-keys create --name "CI/CD Key"
abs api-keys update 1 --description "Updated"
abs api-keys delete 1
```

#### Webhooks

Aliases: `webhooks`, `webhook`

```bash
abs webhooks list
abs webhooks get 1
abs webhooks create --name "Slack" --url https://hooks.slack.com/... --max-retries 5
abs webhooks update 1 --enabled false
abs webhooks delete 1

# Webhook event types
abs webhooks events
```

### Favorites

Manage favorite experiments and metrics.

Aliases: `favorites`, `favorite`, `fav`

```bash
abs favorites add experiment 123
abs favorites add metric 456
abs favorites remove experiment 123
abs favorites remove metric 456
```

### Notifications

View and manage notifications.

Aliases: `notifications`, `notification`, `notif`

```bash
abs notifications list
abs notifications list --cursor 100
abs notifications mark-seen
abs notifications mark-read --ids 1,2,3
abs notifications check
```

### Asset roles

Manage global asset roles for access control.

Aliases: `asset-roles`, `assetroles`

```bash
abs asset-roles list
abs asset-roles get 1
abs asset-roles create --name "Reviewer"
abs asset-roles update 1 --name "Lead Reviewer"
abs asset-roles delete 1
```

### Custom sections

Manage experiment custom sections.

Aliases: `custom-sections`, `customsections`

```bash
abs custom-sections list
abs custom-sections create --name "Launch Checklist" --type test
abs custom-sections update 1 --name "Updated Checklist"
abs custom-sections archive 1
abs custom-sections archive 1 --unarchive
abs custom-sections reorder --sections "1:0,2:1,3:2"
```

### Events

View and manage event tracking data. `--from`/`--to` accept all [date formats](#date-formats).

Aliases: `events`, `event`

```bash
abs events list --from 7d --to now
abs events list --event-name my-experiment --event-type exposure --from 5h
abs events list --app 1 --unit-type 2 --event-type exposure --items 50
abs events list --unit-uid user123 --env-type production
abs events list --valid-exposures --from 1d                  # only assignment-changing exposures
abs events list --invalid-exposures --from 1d                # only ineffective exposures (filtered out)
abs events list --event-name exp1 --event-name exp2          # multiple names (all filters repeatable)
abs events history --from 7d --period 1d
abs events history --event-name my-experiment --env-type production
abs events unit-data 1:user123 2:device456
abs events delete-unit-data 1:user123
abs events json-values --event-type exposure --path "variant" --experiment-id 123
abs events json-values --event-type goal --path "items/0/segment_flight_number" --goal-id 164 --match "LA8186|LA8153"  # filter values (regex, client-side)
abs events json-layouts --source unit_attribute --phase after_enrichment
abs events json-layouts --source unit_goal_property --phase after_enrichment --source-id 164 --match segment_flight  # filter paths (regex)
abs events json-layouts --source unit_goal_property --phase after_enrichment --source-id 164 --top-level            # only top-level paths
abs events json-layouts --source unit_goal_property --phase after_enrichment --source-id 164 --max-depth 2          # paths up to 2 segments deep
abs events summary --from month-start                        # this month, weekly buckets, totals (default)
abs events summary --from last-month-start --to last-month-end --period month
abs events summary --from 30d --group-by team --cumulative
abs events summary --from 7d --visualization bar
abs events summary --from 30d --group-by team --transpose        # teams as rows (handy with many teams)
```

### Insights

View experiment velocity and decision analytics. `--from`/`--to` accept ISO dates (see [date formats](#date-formats)).

Aliases: `insights`, `insight`

```bash
abs insights velocity --from 2026-01-01 --to 2026-03-01 --aggregation month
abs insights decisions --from 2026-01-01 --to 2026-03-01 --aggregation week
abs insights velocity --from 2026-01-01 --to 2026-03-01 --aggregation day --teams Product,Engineering
abs insights velocity-detail --from 2026-01-01 --to 2026-03-01 --aggregation month
abs insights decisions-history --from 2026-01-01 --to 2026-03-01 --aggregation week
```

### Statistics

Statistical analysis tools for experiment planning.

Aliases: `statistics`, `stats`

```bash
abs statistics power-matrix --json-config '{"split":[0.5,0.5],"metric_mean":100,"metric_variance":25,"metric_type":"count","powers":[0.8,0.9]}'
```

### Storage configs

Manage storage destinations for data exports.

Aliases: `storage-configs`, `storageconfigs`

```bash
abs storage-configs list
abs storage-configs get 1
abs storage-configs create --json-config '{"type": "s3", ...}'
abs storage-configs update 1 --json-config '{"bucket": "new-bucket"}'
abs storage-configs test --json-config '{"type": "s3", ...}'
```

### Action dialog fields

Manage fields shown in experiment action dialogs (start, stop, etc.).

Aliases: `action-dialog-fields`, `actiondialogfields`

```bash
abs action-dialog-fields list
abs action-dialog-fields get 1
abs action-dialog-fields create --json-config '{"name": "Reason", "type": "text"}'
abs action-dialog-fields update 1 --json-config '{"required": true}'
```

### Platform configuration

Manage server-side platform settings (not local CLI config).

Aliases: `platform-config`, `platformconfig`, `platform-configs`

```bash
abs platform-config list
abs platform-config get 1
abs platform-config update 1 --value '{"key": "value"}'
```

### CORS origins

Manage allowed CORS origins.

```bash
abs cors list
abs cors get 1
abs cors create --origin "https://app.example.com"
abs cors update 1 --origin "https://new.example.com"
abs cors delete 1
```

### Datasources

Manage event data source configurations.

Aliases: `datasources`, `datasource`, `ds`

```bash
abs datasources list
abs datasources get 1
abs datasources create --json-config '{"type": "postgres", ...}'
abs datasources update 1 --json-config '{"host": "new-host"}'
abs datasources archive 1
abs datasources test --json-config '{"type": "postgres", ...}'
abs datasources introspect --json-config '{"type": "postgres", ...}'
abs datasources validate-query --json-config '{"query": "SELECT ..."}'
abs datasources preview-query --json-config '{"query": "SELECT ..."}'
abs datasources query 6 "SELECT experiment_id, COUNT(*) FROM exposures GROUP BY 1" --limit 20
abs datasources query 6 --sql - < my_query.sql
abs datasources set-default 1
abs datasources schema 1
```

By default, `query` and `preview-query` reshape the columnar API response (`columnNames`, `columnTypes`, `rows`) into row-objects so `-o table`, `-o vertical`, `-o json`, etc. render naturally. Pass `--raw` to get the original columnar payload.

### Export configurations

Manage scheduled data export configurations.

Aliases: `export-configs`, `exportconfigs`, `export-config`

```bash
abs export-configs list
abs export-configs get 1
abs export-configs create --json-config '{"destination": "s3", ...}'
abs export-configs update 1 --json-config '{"schedule": "daily"}'
abs export-configs archive 1
abs export-configs pause 1
abs export-configs histories 1
abs export-configs cancel-history 1 42 --reason "No longer needed"
```

### Update schedules

Manage experiment analysis update schedules.

Aliases: `update-schedules`, `updateschedules`

```bash
abs update-schedules list
abs update-schedules get 1
abs update-schedules create --json-config '{"interval": "1h"}'
abs update-schedules update 1 --json-config '{"interval": "30m"}'
abs update-schedules delete 1
```

### Raw API access

Make arbitrary API requests for endpoints not covered by dedicated commands.

```bash
# GET requests
abs api /experiments
abs api "/experiments?search=Bundle&items=5&previews=1"
abs api /metrics?archived=true -o json

# POST requests
abs api /experiments -X POST -d '{"name": "test", "type": "test"}'
abs api -X POST "/experiments/123/metrics/145" -o json   # fetch metric data

# Custom headers
abs api /experiments -H "X-Custom: value"
```

### Utilities

```bash
# Open the ABSmartly dashboard in your browser
abs open
abs open experiments
abs open experiments 123

# Diagnose configuration issues
abs doctor
```

`abs doctor` validates API connectivity, profile configuration, custom fields cache status, credentials file permissions, and warns about stale experiments stuck in "created" state.

```bash
# Show version and build info
abs version
```

#### Shell completions

Generate shell completions for Bash or Zsh with tab-completion for commands, subcommands, and options.

```bash
# Bash
eval "$(abs completion bash)"
# Or persist:
abs completion bash >> ~/.bashrc

# Zsh
eval "$(abs completion zsh)"
# Or persist:
abs completion zsh >> ~/.zshrc
```

## Configuration

Configuration is stored in `~/.config/absmartly/config.yaml` as YAML. API keys are stored securely in your OS keychain via [keytar](https://github.com/nicktomlin/keytar).

```bash
# View current configuration
abs config list

# Get/set individual values
abs config get output
abs config set output json
abs config unset output

# Manage profiles
abs config profiles list
abs config profiles use staging
abs config profiles delete old-profile
```

### Configuration file format

```yaml
default-profile: default
analytics-opt-out: false
output: table
profiles:
  default:
    api:
      endpoint: https://your-instance.absmartly.com/v1
    expctld:
      endpoint: https://ctl.absmartly.io/v1
    application: my-app
    environment: production
  staging:
    api:
      endpoint: https://staging.absmartly.com/v1
    expctld:
      endpoint: https://ctl.absmartly.io/v1
    environment: staging
```

### Environment variables

| Variable | Description |
|---|---|
| `ABSMARTLY_API_KEY` | API key (overrides keychain and credentials file) |
| `ABSMARTLY_API_ENDPOINT` | API endpoint URL (overrides profile config) |

API key resolution order: `--api-key` flag > `ABSMARTLY_API_KEY` env > OS keychain > `~/.config/absmartly/credentials.json`

> **Security note**: Environment variables may be visible in process listings and logs. For production, prefer OS keychain storage (default) or the credentials file on headless systems.

## Experiment templates

The CLI uses Markdown templates with YAML frontmatter for experiment round-trips.
All names (metrics, owners, teams, tags, applications) are resolved by name, so no IDs are needed.

```bash
# Generate a blank template
abs experiments generate-template -o experiment.md

# Export an existing experiment as a template
abs experiments get 123 -o template > experiment.md
abs experiments get 123 -o template --embed-screenshots > experiment.md  # with base64 screenshots
abs experiments get 123 -o template --screenshots-dir ./screenshots      # save screenshots as files

# Create from template
abs experiments create --from-file experiment.md
abs experiments create --from-file experiment.md --dry-run   # preview payload
cat experiment.md | abs experiments create --from-file -     # from stdin

# Update from template
abs experiments update 123 --from-file experiment.md

# Clone (shortcut)
abs experiments clone 123 --name my-clone

# Restart with changes
abs experiments restart 123 --from-file changes.md --reason hypothesis_iteration
```

### Template format

```markdown
---
name: my_experiment
display_name: "My Experiment"
unit_type: user_id
application: www
primary_metric: Net conversion rate
secondary_metrics:
  - Gross conversion rate
  - Product page views
guardrail_metrics:
  - Page load time (ms)
  - Error rate
percentages: 50/50
percentage_of_traffic: 100
owners:
  - Márcio Martins <marcio@absmartly.com>
  - Cal Courtney <cal@absmartly.com>
teams:
  - Product
  - Engineering
tags:
  - q1
  - homepage
analysis_type: group_sequential
required_alpha: 0.1
required_power: 0.8
baseline_participants: 143
---

## Audience

```json
{
  "filter": [
    { "and": [{ "eq": [{ "var": { "path": "language" } }, { "value": "en-GB" }] }] }
  ]
}
```

## Variants

### variant_0

name: Control
config: {}
![Control variant](./screenshots/control.png)

### variant_1

name: Treatment
config: {"feature_enabled": true}
![Treatment variant](./screenshots/treatment.png)

## Description

### Hypothesis

We believe changing X will improve Y by Z%.

### Implementation Details

Details here...

## JIRA

### JIRA URL

https://jira.example.com/IT-1234
```

Template features:
- **Metrics**: resolved by name, including archived metrics
- **Owners**: `Name <email>`, email, or user ID
- **Teams/tags**: resolved by name
- **Audience**: JSON code block, parsed and compacted for the API
- **Custom fields**: grouped by section name (matches UI sections)
- **User-type fields**: exported as email, converted back to `{"selected":[{"userId":N}]}`
- **Screenshots**: local file paths, URLs, or base64 data URIs
- **Type**: inferred from command (`abs experiments` → test, `abs features` → feature)

## Programmatic usage

The package exports a framework-free core layer that can be used programmatically without Commander.js or any CLI dependencies. The core functions are tree-shakeable, so you import only what you need.

### Exports

| Import path | Description |
|---|---|
| `@absmartly/cli/core/experiments` | Experiment lifecycle, metrics, bulk operations |
| `@absmartly/cli/core/goals` | Goal CRUD and access control |
| `@absmartly/cli/core/metrics` | Metric CRUD, reviews, access control |
| `@absmartly/cli/core/teams` | Team CRUD and member management |
| `@absmartly/cli/core/users` | User CRUD and API key management |
| `@absmartly/cli/core/events` | Event tracking data |
| `@absmartly/cli/core/insights` | Velocity and decision analytics |
| `@absmartly/cli/core/auth` | Auth operations (whoami, API keys, profile) |
| `@absmartly/cli/core/<module>` | Any other core module (tags, roles, segments, etc.) |
| `@absmartly/cli/api-client` | Lower-level API client with typed methods |
| `@absmartly/cli/formatting` | Output formatting utilities |

### Example

```typescript
import { createAPIClient } from '@absmartly/cli/api-client';
import { listExperiments, startExperiment, stopExperiment, ExperimentId } from '@absmartly/cli/core/experiments';

const client = createAPIClient({
  endpoint: 'https://your-instance.absmartly.com/v1',
  apiKey: 'YOUR_API_KEY',
});

// List running experiments
const { data, pagination } = await listExperiments(client, {
  state: 'running',
  items: 50,
  page: 1,
});

// Start an experiment
const result = await startExperiment(client, {
  experimentId: ExperimentId(123),
  note: 'Starting from script',
});

if (result.data.skipped) {
  console.log('Skipped:', result.data.skipReason);
}

// Stop with validated reason
await stopExperiment(client, {
  experimentId: ExperimentId(123),
  reason: 'hypothesis_rejected',
  note: 'Results conclusive',
});
```

> **Note**: `ExperimentId()` is a branded type constructor for type safety. In JavaScript, you can pass plain numeric IDs instead.

#### Create from template

```typescript
import { createExperimentFromTemplate } from '@absmartly/cli/core/experiments';
import { readFileSync } from 'fs';

const templateContent = readFileSync('experiment.md', 'utf8');

const { data, warnings } = await createExperimentFromTemplate(client, {
  templateContent,
  name: 'my-new-experiment',        // optional override
  displayName: 'My New Experiment',  // optional override
  defaultType: 'test',              // 'test' or 'feature'
});

console.log(`Created experiment ${data.id}: ${data.name}`);
for (const w of warnings) console.warn(w);
```

### Core API conventions

All core functions follow a consistent pattern:

```typescript
function operation(client: APIClient, params: OperationParams): Promise<CommandResult<T>>
```

- **First argument** is always the `APIClient` instance
- **Second argument** is a typed params object
- **Return value** is always `CommandResult<T>` with:
  - `data: T`, the primary result
  - `warnings?: string[]`, optional warnings
  - `pagination?: { page, items, hasMore }`, for list operations
  - `rows?: Record<string, unknown>[]`, optional tabular view
  - `detail?: Record<string, unknown>`, optional detail view

Validation errors throw with descriptive messages listing valid values (e.g., stop reasons, schedule actions).

## Development

### Setup

```bash
bun install
```

### Build

```bash
bun run build          # compile TypeScript
bun run build:watch    # watch mode
```

### Run in development

```bash
bun run dev -- experiments list
```

### Testing

```bash
bun test               # watch mode
bun run test:run       # run once
bun run test:ui        # Vitest UI
bun run test:coverage  # coverage report
```

Tests use [MSW](https://mswjs.io/) (Mock Service Worker) for API mocking. Run against a live API with:

```bash
USE_LIVE_API=1 bun run test:run
```

The test suite includes:
- **Command-layer tests** (`src/commands/`) test CLI behavior through Commander.js
- **Core-layer tests** (`src/core/`) test business logic with mocked API clients
- **API client tests** (`src/api-client/`) test request building and response parsing
- **Library tests** (`src/lib/`) test utilities, config, auth, and formatting

### Linting and formatting

```bash
bun run lint           # ESLint
bun run format         # Prettier
bun run typecheck      # tsc --noEmit
```

## License

MIT
