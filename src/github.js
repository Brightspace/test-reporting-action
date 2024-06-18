import { endGroup, error, info, startGroup, summary, warning } from '@actions/core';
import { getContext as getGitHubContext } from 'd2l-test-reporting/helpers/github.js';
import fs from 'fs/promises';
import { getInput, getBooleanInput, setFailed } from '@actions/core';
import { resolve } from 'path';

const testReportingBaseUrl = 'https://test-reporting.d2l.dev';

const makeLogger = () => ({ startGroup, endGroup, info, warning, error });

const getStringInput = (name, { required = true, lowerCase = false } = {}) => {
	const input = getInput(name, { required });

	if (input === '' && required) {
		throw new Error(`Input '${name}' must be a non-empty string`);
	}

	return lowerCase ? input.toLowerCase() : input;
};

const getContext = (logger) => {
	logger.startGroup('Gather GitHub context');

	let context;

	try {
		context = getGitHubContext();
	} catch {
		throw new Error('Unable to gather github context');
	}

	const { github, git } = context;
	const { organization, repository, workflow, runId, runAttempt } = github;
	const { branch, sha } = git;

	logger.info(`GitHub organization: ${organization}`);
	logger.info(`GitHub repository: ${repository}`);
	logger.info(`GitHub workflow: ${workflow}`);
	logger.info(`GitHub run ID: ${runId}`);
	logger.info(`GitHub run attempt: ${runAttempt}`);
	logger.info(`Git branch: ${branch}`);
	logger.info(`Git SHA: ${sha}`);
	logger.endGroup();

	return context;
};

const getInputs = async(logger) => {
	logger.startGroup('Gather GitHub inputs');
	logger.info('Gather credentials');

	const awsAccessKeyId = getStringInput('aws-access-key-id');
	const awsSecretAccessKey = getStringInput('aws-secret-access-key');
	const awsSessionToken = getStringInput('aws-session-token');

	logger.info('Determine report path');

	const reportPath = resolve(getStringInput('report-path'));

	try {
		await fs.access(reportPath);
	} catch {
		throw new Error('Report path must exists');
	}

	logger.info(`Report path: ${reportPath}`);
	logger.info('Determine LMS information');

	let lmsBuildNumber = getStringInput('lms-build-number', { required: false });
	let lmsInstanceUrl = getStringInput('lms-instance-url', { required: false });

	if (lmsBuildNumber !== '') {
		logger.info(`LMS build number: ${lmsBuildNumber}`);
	} else {
		lmsBuildNumber = undefined;
	}

	if (lmsInstanceUrl !== '') {
		logger.info(`LMS instance URL: ${lmsInstanceUrl}`);
	} else {
		lmsInstanceUrl = undefined;
	}

	logger.info('Determine inject context mode');

	const injectGitHubContext = getStringInput('inject-github-context', { lowerCase: true });

	if (!['auto', 'force', 'off'].includes(injectGitHubContext)) {
		throw new Error('Inject context mode invalid');
	}

	logger.info(`Inject context mode: ${injectGitHubContext}`);

	const dryRun = getBooleanInput('dry-run', { required: true });

	logger.info(`Dry run: ${dryRun}`);

	const debug = getBooleanInput('debug', { required: true });

	logger.info(`Debug: ${debug}`);
	logger.endGroup();

	return {
		awsAccessKeyId,
		awsSecretAccessKey,
		awsSessionToken,
		reportPath,
		lmsBuildNumber,
		lmsInstanceUrl,
		injectGitHubContext,
		dryRun,
		debug
	};
};

const updateSummary = (logger, context, inputs) => {
	logger.startGroup('Update GitHub Actions summary');

	summary.addHeading('Test Reporting', 2);
	summary.addRaw('The overview of data submitted can be found ');

	const metricsUrl = new URL('metrics', testReportingBaseUrl);
	const { searchParams: overviewSearchParams } = metricsUrl;
	const { github: { organization, repository } } = context;

	overviewSearchParams.set('var-githubOrganizations', organization);
	overviewSearchParams.set('var-githubRepositories', repository);

	summary.addLink('here', metricsUrl.toString());
	summary.addEOL();
	summary.addRaw('A more detailed view of data submitted can be found ');

	const drillDownUrl = new URL('drill-down', testReportingBaseUrl);

	const { searchParams: drillDownSearchParams } = drillDownUrl;

	drillDownSearchParams.set('var-githubOrganizations', organization);
	drillDownSearchParams.set('var-githubRepositories', repository);

	summary.addLink('here', drillDownUrl.toString());
	summary.addEOL();

	const { debug, dryRun } = inputs;

	if (debug) {
		logger.info('Generated summary\n');
		logger.info(`${summary.stringify()}\n`);
	}

	if (dryRun) {
		logger.info('Dry run, skipping GitHub Action summary update');

		return;
	}

	summary.write();
};

export { getContext, getInputs, makeLogger, setFailed, updateSummary };
