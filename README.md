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
    inject-github-context: auto # optional, defaults to 'auto'
    dry-run: false # optional, only needed for testing & debugging
...
```

> [!NOTE]
> This action assumes a report, conforming to the D2L report schema, has
> already been generated using a given test framework reporter or manually.

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
