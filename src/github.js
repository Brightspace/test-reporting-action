import { endGroup, error, info, startGroup, summary, warning } from '@actions/core';
import { getContext as getGitHubContext } from 'd2l-test-reporting/helpers/github.js';
import fs from 'fs/promises';
import { getInput, getBooleanInput, setFailed } from '@actions/core';
import { resolve } from 'path';

const testReportingUrl = 'https://test-reporting.d2l.dev';

const makeLogger = () => ({ startGroup, endGroup, info, warning, error });

const getStringInput = (name, { required = true, lowerCase = false } = {}) => {
	const input = getInput(name, { required });

	if (input === '' && required) {
		throw new Error(`input '${name}' must be a non-empty string`);
	}

	return lowerCase ? input.toLowerCase() : input;
};

const getContext = (logger) => {
	logger.startGroup('Gather GitHub context');

	let context;

	try {
		context = getGitHubContext();
	} catch {
		throw new Error('unable to gather github context');
	}

	logger.info(`GitHub organization: ${context.githubOrganization}`);
	logger.info(`GitHub repository: ${context.githubRepository}`);
	logger.info(`GitHub workflow: ${context.githubWorkflow}`);
	logger.info(`GitHub run ID: ${context.githubRunId}`);
	logger.info(`GitHub run attempt: ${context.githubRunAttempt}`);
	logger.info(`Git branch: ${context.gitBranch}`);
	logger.info(`Git SHA: ${context.gitSha}`);
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
		throw new Error('report path must exists');
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
		throw new Error('inject context mode invalid');
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

	const overviewHref = new URL('', testReportingUrl);
	const { searchParams: overviewSearchParams } = overviewHref;
	const { githubOrganization, githubRepository } = context;

	overviewSearchParams.set('var-githubOrganizations', githubOrganization);
	overviewSearchParams.set('var-githubRepositories', githubRepository);

	summary.addLink('here', overviewHref.toString());
	summary.addEOL();
	summary.addRaw('A more detailed view of data submitted can be found ');

	const testReportingDrillDown = new URL('drill-down', testReportingUrl);

	const { searchParams: drillDownSearchParams } = testReportingDrillDown;

	drillDownSearchParams.set('var-githubOrganizations', githubOrganization);
	drillDownSearchParams.set('var-githubRepositories', githubRepository);

	summary.addLink('here', testReportingDrillDown.toString());
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
