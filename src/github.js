import { info, error, startGroup, endGroup } from '@actions/core';
import fs from 'fs/promises';
import { context as gitHubContext } from '@actions/github';
import { getInput, setFailed } from '@actions/core';
import { resolve } from 'path';

const makeLogger = () => ({ startGroup, endGroup, info, error });

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
		const {
			env: {
				GITHUB_WORKFLOW_REF,
				GITHUB_RUN_ATTEMPT,
				GITHUB_HEAD_REF,
				GITHUB_SHA
			}
		} = process;
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
		throw new Error('Failed getting GitHub context');
	}

	logger.info(`GitHub Organization: ${githubOrganization}`);
	logger.info(`GitHub Repository: ${githubRepository}`);
	logger.info(`GitHub Workflow: ${githubWorkflow}`);
	logger.info(`GitHub RunId: ${githubRunId}`);
	logger.info(`GitHub Run Attempt: ${githubRunAttempt}`);
	logger.info(`Git Branch: ${gitBranch}`);
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

const getStringInput = (name) => {
	const input = getInput(name, { required: true });

	if (input === '') {
		throw new Error(`Input must be a non-empty string and is not: ${name}`);
	}

	return input;
};

const getInputs = async(logger) => {
	logger.startGroup('Gather GitHub inputs');

	const awsAccessKeyId = getStringInput('aws-access-key-id');
	const awsSecretAccessKey = getStringInput('aws-secret-access-key');
	const awsSessionToken = getStringInput('aws-session-token');

	logger.info('Credentials gathered');

	const reportPath = resolve(getStringInput('report-path'));

	try {
		await fs.access(reportPath);
	} catch (err) {
		throw new Error('Report path must exists');
	}

	logger.info(`Report Path: ${reportPath}`);
	logger.endGroup();

	return {
		awsAccessKeyId,
		awsSecretAccessKey,
		awsSessionToken,
		reportPath
	};
};

export { getContext as getContext, getInputs, makeLogger, setFailed };
