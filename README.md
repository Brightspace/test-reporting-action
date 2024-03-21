# Test Reporting (GitHub Action)

> [!WARNING]
> This is still a work in progress. Any usage of this action is subject to
> change without notice.

A GitHub Action for uploading D2L format test reports to back-end visualization
and querying infrastructure.

## Set-Up

In order for your repository to be able to submit test report you must first
enable the `test_reporting` option for you repository in [repo-settings]. This
will give your repository access to have the GitHub Action submit test reporting
data to the framework.

> [!CAUTION]
> Without this set-up you will see errors about being `unable to assume required
> role` and the action will fail to run.

## Usage

```yml
...
- name: Upload test report
  uses: Brightspace/test-reporting-action@main
  with:
    aws-access-key-id: ${{secrets.AWS_ACCESS_KEY_ID}} # required
    aws-secret-access-key: ${{secrets.AWS_SECRET_ACCESS_KEY}} # required
    aws-session-token: ${{secrets.AWS_SESSION_TOKEN}} # required
    report-path: ./d2l-test-report.json # optional, defaults to shown path
    lms-build-number: '20.24.1.123456' # optional
    lms-instance-url: https://cd2024112345.devlms.desire2learn.com # optional
    inject-github-context: auto # optional, defaults to 'auto'
    dry-run: false # optional, only needed for testing & debugging
    debug: false # optional, only needed for testing & debugging
...
```

> [!IMPORTANT]
> This action assumes a report, conforming to the D2L report schema, has
> already been generated using a given test framework reporter or manually. For
> available reporters please see [node reporters].

### Inputs

* `aws-access-key-id`: Specifies an AWS access key associated with an IAM
  account. **Required**
* `aws-secret-access-key`: Specifies the secret key associated with the access
  key. This is essentially the "password" for the access key. **Required**
* `aws-access-key-id`: Specifies an AWS access key associated with an IAM
  account. **Required**
* `report-path`: Path to report D2L format test report JSON file. **Optional**.
  Defaults to `./d2l-test-report.json`
* `lms-build-number`: The LMS build number of the site used to generate this
  report. Will result in failure if already present in report. **Optional**
* `lms-instance-url`: The LMS instance URL of the site used to generate this
  report. Will result in failure if already present in report. **Optional**
* `inject-github-context`: Change mode for injection of GitHub Actions context
  at report submission time. **Optional**. Defaults to `auto`
  * `auto`: Injects GitHub Actions context into report if missing
  * `force`: Injects GitHub Actions context into report always
  * `off`: Will not inject GitHub Actions context into report even if missing,
    can result in validation failure if not present
* `dry-run`: Enable or disable dry run mode. Will perform all operations except
  final submission of report data to backend. **Optional**. Defaults to `false`
* `debug`: Enable or disable debug mode. Will enable additional log messages.
  Does not stop final submission of report data to backend. **Optional**.
  Defaults to `false`

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
