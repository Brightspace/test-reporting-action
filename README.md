# Test Reporting (GitHub Action)

A GitHub Action for uploading D2L format test reports to back-end visualization
and querying infrastructure. This action is meant to be used in conjunction with
reporters from [node reporters].

> [!NOTE]
> If you have any questions, concerns or just want to chat feel free to reach
> out in [#test-reporting] (D2L employee accessible only).

## Set-Up

In order for your repository to be able to submit test report you must first
enable the `test_reporting` option for you repository in [repo-settings] (D2L
employee accessible only). This will give your repository access to have the
GitHub Action submit test reporting data to the framework.

> [!CAUTION]
> Without this set-up you will see errors about being `unable to assume required
> role` in the GitHub Action logs and the action will fail to run.

## Usage

```yml
- name: Upload test report
  uses: Brightspace/test-reporting-action@main
  if: >
    (failure() || success()) &&
    github.triggering_actor != 'dependabot[bot]'
  with:
    aws-access-key-id: ${{secrets.AWS_ACCESS_KEY_ID}}
    aws-secret-access-key: ${{secrets.AWS_SECRET_ACCESS_KEY}}
    aws-session-token: ${{secrets.AWS_SESSION_TOKEN}}
```

> [!IMPORTANT]
> This action assumes a report, conforming to the D2L report schema, has already
> been generated using a given test framework reporter or manually. For
> available reporters please see [node reporters].

### Inputs

* `aws-access-key-id` (required): Specifies an AWS access key associated with an
  IAM account.
* `aws-secret-access-key` (required): Specifies the secret key associated with
  the access key. This is essentially the "password" for the access key.
* `aws-access-key-id` (required): Specifies an AWS access key associated with an
  IAM account.
* `role-to-assume` ([see below]): The Amazon Resource Name (ARN) of the role to
  assume.
* `report-path` (default: `./d2l-test-report.json`): Path to report D2L format
  test report JSON file.
* `lms-build-number`: The LMS build number of the site used to generate this
  report. Will throw an error if provided and already present in the report.
* `lms-instance-url`: The LMS instance URL of the site used to generate this
  report. Will throw an error if provided and already present in the report.
* `inject-github-context` (default: `auto`): Change mode for injection of GitHub
  Actions context at report submission time.
  * `auto`: Injects GitHub Actions context into report if missing
  * `force`: Injects GitHub Actions context into report always
  * `off`: Will not inject GitHub Actions context into report even if missing,
    can result in validation failure if not present
* `dry-run` (default: `false`): Enable or disable dry run mode. Will perform all
  operations except final submission of report data to backend. Only really
  useful for debugging and testing.
* `debug` (default: `false`): Enable or disable debug mode. Will enable
  additional log messages. Does not stop final submission of report data to
  backend. Only really useful for debugging and testing.

## Authentication

By default this action assumes you are using the default setup for sending to
test reporting via [repo-settings] (D2L employee accessible only) which means it
will infer the role to assume based on your repository information. There is
really no reason to change this but it has been exposed via `role-to-assume` in
the rare case we need them in the future. As long as you've followed the
instructions outlined in [repo-settings] (D2L employee accessible only) this
should work as expected.

## Storage Schema

For details on what columns are available in [AWS Timestream] for analysis and
dashboard building please see [Storage Schema](./docs/storage-schema.md).

## Developing

After cloning the repository make sure to install dependencies.

```console
npm ci
```

### Building

This will be done automatically on each pull request submitted. If you need to
refresh the built files locally you can run the following.

```console
npm run build
```

### Linting

```console
# currently only eslint
npm run lint

# eslint only
npm run lint:eslint
```

### Fixing

```console
# currently only eslint
npm run fix

# eslint only
npm run fix:eslint
```

### Testing

```console
# lint and unit tests
npm test

# unit tests only
npm run test:unit
```

<!-- links -->
[repo-settings]: https://github.com/Brightspace/repo-settings/blob/-/docs/test-reporting.md
[node reporters]: https://github.com/Brightspace/test-reporting-node?tab=readme-ov-file#reporters
[AWS Timestream]: https://aws.amazon.com/timestream
[see below]: #authentication
[#test-reporting]: https://d2l.slack.com/archives/C05MMC7H7EK
