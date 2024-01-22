# Test Reporting (Action)

> [!WARNING]
> This is still a work in progress. Any usage of this action is subject to
> change without notice.

GitHub Action for uploading D2L format test reports to back-end visualization
and querying infrastructure.

## Usage

```yml
- name: Upload test report
  uses: Brightspace/test-reporting-action@main
  with:
    aws-access-key-id: ${{secrets.AWS_ACCESS_KEY_ID}}
    aws-secret-access-key: ${{secrets.AWS_SECRET_ACCESS_KEY}}
    aws-session-token: ${{secrets.AWS_SESSION_TOKEN}}
    report-path: ./d2l-test-report.json # optional, defaults to shown path
    inject-github-context: auto # optional, defaults to 'auto'
    dry-run: false # optional, only needed for testing & debugging
```

> [!NOTE]
> This action assumes a report, conforming to the D2L report schema, has
> already been generated using a given test framework reporter or manually.
