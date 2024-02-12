import { endGroup, error, info, startGroup, warning } from '@actions/core';
import { getContext as getGitHubContext } from 'd2l-test-reporting/helpers/github.js';
import fs from 'fs/promises';
import { getInput, getBooleanInput, setFailed } from '@actions/core';
import { resolve } from 'path';

const makeLogger = () => ({ startGroup, endGroup, info, warning, error });

const getStringInput = (name, lowerCase = false) => {
	const input = getInput(name, { required: true });

	if (input === '') {
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
	logger.info('Determine inject context mode');

	const injectGitHubContext = getStringInput('inject-github-context', true);

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
		injectGitHubContext,
		dryRun,
		debug
	};
};

export { getContext, getInputs, makeLogger, setFailed };
