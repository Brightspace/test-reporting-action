# Storage Schema

All report data once submitted to the back-end is stored in [AWS Timestream].
The data is split across 2 tables ([`summary`](#summary) and
[`details`](#details)) to better store common items, reduce duplication and
allow for more targeted queries. Below are a breakdown of the various tables and
there columns as well as the corresponding JSON path within the report format
the data is sourced from.

## Tables

### `summary`

This table contains all of the information that is common to a test run as well
as some rolled up counts of various test statuses.

#### Measures

* `duration_total` (`BIGINT`): Stored as **milliseconds** from report JSON
  `report.summary.duration.total`.
* `total_duration` (`BIGINT`) **[deprecated]**: Stored as **milliseconds**,
  sourced from report JSON `report.summary.duration.total`.
* `status` (`VARCHAR`): Will either be `passed` or `failed`, sourced rom report
  JSON `report.summary.status`.
* `count_passed` (`BIGINT`): Sourced from report JSON
  `report.summary.count.passed`.
* `count_failed` (`BIGINT`): Sourced from report JSON
  `report.summary.count.failed`.
* `count_skipped` (`BIGINT`): Sourced from report JSON
  `report.summary.count.skipped`.
* `count_flaky` (`BIGINT`): Sourced from report JSON
  `report.summary.count.flaky`.

> [!WARNING]
  Anything marked with **[deprecated]** should be moved away from. Sending of
  this column will be removed in the near future.

#### Dimensions

> [!NOTE]
  All dimensions are stored as `VARCHAR` as it is the only format available.

* `report_id`: Sourced from report JSON `report.id`.
* `github_organization`: Sourced from report JSON
  `report.summary.github.organization`.
* `github_repository`: Sourced from report JSON
  `report.summary.github.repository`.
* `github_workflow`: Sourced from report JSON `report.summary.github.workflow`.
* `github_run_id`: Sourced from report JSON `report.summary.github.runId`.
* `github_run_attempt`: Sourced from report JSON
  `report.summary.github.runAttempt`.
* `git_branch`: Sourced from report JSON `report.summary.git.branch`.
* `git_sha`: Sourced from report JSON `report.summary.git.sha`.
* `operating_system`: Will be one of `windows`, `linux` or `mac`, sourced from
  report JSON `report.summary.operatingSystem`.
* `framework`: Sourced from report JSON `report.summary.framework`.
* `lms_build_number` (`NULLABLE`): Sourced from report JSON
  `report.summary.lms.buildNumber`.
* `lms_instance_url` (`NULLABLE`): Sourced from report JSON
  `report.summary.lms.instanceUrl`.

### `details`

This table contains information about each individual test that was run. A
mapping to the [`summary`](#summary) data can be done via the `report_id` if a
combination of the data is desired.

#### Measures

* `duration_final` (`BIGINT`): Stored as **milliseconds**, sourced from report
  JSON `report.details[].duration.final`.
* `duration` (`BIGINT`) **[deprecated]**: Stored as **milliseconds**, sourced
  from report JSON `report.details[].duration.final`.
* `duration_total` (`BIGINT`): Stored as **milliseconds**, sourced from report
  `JSON report.details[].duration.total`.
* `total_duration` (`BIGINT`) **[deprecated]**: Stored as **milliseconds**,
  sourced from report JSON `report.details[].duration.total`.
* `retries` (`BIGINT`): Sourced from report JSON `report.details[].retries`.
* `status` (`VARCHAR`): Will be one of `passed`, `skipped` or `failed`, sourced
  from report JSON `report.details[].status`.

> [!WARNING]
  Anything marked with **[deprecated]** should be moved away from. Sending of
  this column will be removed in the near future.

#### Dimensions

> [!NOTE]
  All dimensions are stored as `VARCHAR` as it is the only format available.

* `report_id`: Sourced from report JSON `report.id`.
* `name`: Sourced from report JSON `report.details[].name`.
* `location` **[deprecated]**: Sourced from report JSON
  `report.details[].location.file`.
* `location_file`: Sourced from report JSON `report.details[].location.file`.
* `location_line`: Sourced from report JSON `report.details[].location.line`.
* `location_column`: Sourced from report JSON
  `report.details[].location.column`.
* `browser` (`NULLABLE`): Can be one of `chrome`, `chromium`, `firefox`,
  `webkit`, `safari` or `edge`, sourced from report JSON
  `report.details[].browser`.
* `type` (`NULLABLE`): Sourced from report JSON `report.details[].type`.
* `experience` (`NULLABLE`): Sourced from report JSON
  `report.details[].experience`.
* `tool` (`NULLABLE`): Sourced from report JSON `report.details[].tool`.
* `timeout`: Stored as **milliseconds**, sourced from report JSON
  `report.details[].timeout`.

> [!WARNING]
  Anything marked with **[deprecated]** should be moved away from. Sending of
  this column will be removed in the near future.

<!-- links -->
[AWS Timestream]: https://aws.amazon.com/timestream
