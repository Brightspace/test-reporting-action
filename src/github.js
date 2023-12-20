import { endGroup, error, info, startGroup, warning } from '@actions/core';
import fs from 'fs/promises';
import { context as gitHubContext } from '@actions/github';
import { getInput, setFailed } from '@actions/core';
import { resolve } from 'path';

const makeLogger = () => ({ startGroup, endGroup, info, warning, error });

const getStringInput = (name, lowerCase = false) => {
	const input = getInput(name, { required: true });

	if (input === '') {
		throw new Error(`Input '${name}' must be a non-empty string`);
	}

	return lowerCase ? input.toLowerCase() : input;
};

const getContext = (logger) => {
	logger.startGroup('Gather GitHub context');

	let githubOrganization;
	let githubRepository;
	let githubWorkflow;
	let githubRunId;
	let githubRunAttempt;
	let gitBranch;
	let gitSha;

	try {
		const { repo: { owner, repo }, ref, runId } = gitHubContext;
		const { env: {
			GITHUB_WORKFLOW_REF,
			GITHUB_RUN_ATTEMPT,
			GITHUB_HEAD_REF,
			GITHUB_SHA
		} } = process;
		const [workflowPath] = GITHUB_WORKFLOW_REF.split('@');
		const workflowRegex = new RegExp(`^${owner}/${repo}/.github/workflows/`);
		const branchRef = GITHUB_HEAD_REF || ref;

		githubOrganization = owner;
		githubRepository = repo;
		githubWorkflow = workflowPath.replace(workflowRegex, '');
		githubRunId = runId;
		githubRunAttempt = parseInt(GITHUB_RUN_ATTEMPT, 10);
		gitBranch = branchRef.replace(/^refs\/heads\//i, '');
		gitSha = GITHUB_SHA;
	} catch {
		throw new Error('Unable to gather GitHub context');
	}

	logger.info(`GitHub organization: ${githubOrganization}`);
	logger.info(`GitHub repository: ${githubRepository}`);
	logger.info(`GitHub workflow: ${githubWorkflow}`);
	logger.info(`GitHub run ID: ${githubRunId}`);
	logger.info(`GitHub run attempt: ${githubRunAttempt}`);
	logger.info(`Git branch: ${gitBranch}`);
	logger.info(`Git SHA: ${gitSha}`);
	logger.endGroup();

	return {
		githubOrganization,
		githubRepository,
		githubWorkflow,
		githubRunId,
		githubRunAttempt,
		gitBranch,
		gitSha
	};
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
	} catch (err) {
		throw new Error('Report path must exists');
	}

	logger.info(`Report path: ${reportPath}`);
	logger.info('Determine inject context mode');

	const injectGitHubContext = getStringInput('inject-github-context', true);

	if (!['auto', 'force', 'off'].includes(injectGitHubContext)) {
		throw new Error('Inject context mode invalid');
	}

	logger.info(`Inject context mode '${injectGitHubContext}' invalid`);
	logger.endGroup();

	return {
		awsAccessKeyId,
		awsSecretAccessKey,
		awsSessionToken,
		reportPath,
		injectGitHubContext
	};
};

export { getContext as getContext, getInputs, makeLogger, setFailed };
