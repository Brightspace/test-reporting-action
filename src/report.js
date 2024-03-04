import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { MeasureValueType, TimestreamWriteClient, TimeUnit, WriteRecordsCommand } from '@aws-sdk/client-timestream-write';
import fs from 'fs/promises';
import { validateContext } from 'd2l-test-reporting/helpers/github.js';
import { validateReport } from 'd2l-test-reporting/helpers/report.js';

const region = 'us-east-1';
const databaseName = 'test_reporting';
const { BIGINT, VARCHAR, MULTI } = MeasureValueType;
const { MILLISECONDS } = TimeUnit;

const makeSummaryWriteRequest = (report) => {
	const { reportId, summary } = report;
	const {
		githubOrganization,
		githubRepository,
		githubWorkflow,
		githubRunId,
		githubRunAttempt,
		gitBranch,
		gitSha,
		operatingSystem,
		framework,
		started,
		totalDuration,
		status,
		countPassed,
		countFailed,
		countSkipped,
		countFlaky,
		lmsBuildNumber,
		lmsInstanceUrl
	} = summary;

	const dimensions = [
		{ Name: 'report_id', Value: reportId },
		{ Name: 'github_organization', Value: githubOrganization },
		{ Name: 'github_repository', Value: githubRepository },
		{ Name: 'github_workflow', Value: githubWorkflow },
		{ Name: 'github_run_id', Value: `${githubRunId}` },
		{ Name: 'github_run_attempt', Value: `${githubRunAttempt}` },
		{ Name: 'git_branch', Value: gitBranch },
		{ Name: 'git_sha', Value: gitSha },
		{ Name: 'operating_system', Value: operatingSystem },
		{ Name: 'framework', Value: framework }
	];

	if (lmsBuildNumber) {
		dimensions.push({ Name: 'lms_build_number', Value: lmsBuildNumber });
	}

	if (lmsInstanceUrl) {
		dimensions.push({ Name: 'lms_instance_url', Value: lmsInstanceUrl });
	}

	return {
		DatabaseName: databaseName,
		TableName: 'summary',
		Records: [{
			Version: 1,
			Time: `${Date.parse(started)}`,
			TimeUnit: MILLISECONDS,
			MeasureName: 'overall_test_run',
			MeasureValueType: MULTI,
			MeasureValues: [
				{ Name: 'total_duration', Value: `${totalDuration}`, Type: BIGINT },
				{ Name: 'status', Value: status, Type: VARCHAR },
				{ Name: 'count_passed', Value: `${countPassed}`, Type: BIGINT },
				{ Name: 'count_failed', Value: `${countFailed}`, Type: BIGINT },
				{ Name: 'count_skipped', Value: `${countSkipped}`, Type: BIGINT },
				{ Name: 'count_flaky', Value: `${countFlaky}`, Type: BIGINT }
			],
			Dimensions: dimensions
		}]
	};
};

const makeDetailRecord = (detail) => {
	const {
		name,
		started,
		location,
		retries,
		totalDuration,
		status,
		duration,
		browser,
		type,
		experience,
		tool
	} = detail;

	const dimensions = [
		{ Name: 'name', Value: name },
		{ Name: 'location', Value: location }
	];

	if (browser) {
		dimensions.push({ Name: 'browser', Value: browser });
	}

	if (type) {
		dimensions.push({ Name: 'type', Value: type });
	}

	if (experience) {
		dimensions.push({ Name: 'experience', Value: experience });
	}

	if (tool) {
		dimensions.push({ Name: 'tool', Value: tool });
	}

	return {
		Time: `${Date.parse(started)}`,
		TimeUnit: MILLISECONDS,
		MeasureValues: [
			{ Name: 'duration', Value: `${duration}`, Type: BIGINT },
			{ Name: 'total_duration', Value: `${totalDuration}`, Type: BIGINT },
			{ Name: 'retries', Value: `${retries}`, Type: BIGINT },
			{ Name: 'status', Value: status, Type: VARCHAR }
		],
		Dimensions: dimensions
	};
};

const makeDetailWriteRequests = (report) => {
	const { reportId, details } = report;
	const batchSize = 100;
	const writeRequests = Array.from(
		{ length: Math.ceil(details.length / batchSize) },
		(v, i) => {
			const detailRecordBatch = details
				.slice(i * batchSize, i * batchSize + batchSize)
				.map(makeDetailRecord);

			return {
				DatabaseName: databaseName,
				TableName: 'details',
				Records: detailRecordBatch,
				CommonAttributes: {
					Version: 1,
					MeasureName: 'single_test_run',
					MeasureValueType: MULTI,
					Dimensions: [
						{ Name: 'report_id', Value: reportId, Type: VARCHAR }
					]
				}
			};
		}
	);

	return writeRequests;
};

const assumeRole = async(region, credentials, arn, sessionName, duration, tags) => {
	const client = new STSClient({ region, credentials });
	const command = new AssumeRoleCommand({
		RoleArn: arn,
		RoleSessionName: sessionName,
		DurationSeconds: duration,
		Tags: tags
	});
	const { Credentials } = await client.send(command);
	const { AccessKeyId, SecretAccessKey, SessionToken } = Credentials;

	return {
		accessKeyId: AccessKeyId,
		secretAccessKey: SecretAccessKey,
		sessionToken: SessionToken
	};
};

const writeTimestream = async(region, credentials, requests) => {
	const client = new TimestreamWriteClient({ credentials, region });

	for (const request of requests) {
		const command = new WriteRecordsCommand(request);

		await client.send(command);
	}
};

const processGitHubContext = (logger, context, inputs, report) => {
	const { injectGitHubContext } = inputs;
	const { summary = {} } = report;

	if (injectGitHubContext === 'force') {
		logger.info('Inject GitHub context');

		report.summary = {
			...summary,
			...context
		};
	} else {
		try {
			validateContext(summary);
		} catch {
			if (injectGitHubContext === 'auto') {
				logger.warning('GitHub context missing, incomplete or invalid');
				logger.info('Inject GitHub context');

				report.summary = {
					...summary,
					...context
				};
			} else if (injectGitHubContext === 'off') {
				throw new Error('GitHub context missing, incomplete or invalid');
			} else {
				throw new Error('Unknown GitHub context injection mode');
			}
		}
	}

	return report;
};

const processLmsInfo = (inputs, report) => {
	const { lmsBuildNumber, lmsInstanceUrl } = inputs;

	report.summary = report.summary ?? {};

	if (lmsBuildNumber) {
		if (!report.summary.lmsBuildNumber) {
			report.summary.lmsBuildNumber = lmsBuildNumber;
		} else {
			throw new Error('LMS build number already present, will not override');
		}
	}

	if (lmsInstanceUrl) {
		if (!report.summary.lmsInstanceUrl) {
			report.summary.lmsInstanceUrl = lmsInstanceUrl;
		} else {
			throw new Error('LMS instance URL already present, will not override');
		}
	}

	return report;
};

const finalize = async(logger, context, inputs) => {
	logger.startGroup('Finalize test report');

	const { reportPath, debug } = inputs;
	let report;

	try {
		const reportRaw = await fs.readFile(reportPath, 'utf8');

		report = JSON.parse(reportRaw);
	} catch {
		throw new Error('report is not valid');
	}

	if (debug) {
		logger.info('Loaded report\n');
		logger.info(`${JSON.stringify(report, null, 2)}\n`);
	}

	report = processGitHubContext(logger, context, inputs, report);
	report = processLmsInfo(inputs, report);

	if (debug) {
		logger.info('Finalized report\n');
		logger.info(`${JSON.stringify(report, null, 2)}\n`);
	}

	logger.info('Validate schema');

	validateReport(report);

	const { reportId } = report;

	logger.info(`Report ID: ${reportId}`);
	logger.endGroup();

	return report;
};

const submit = async(logger, context, inputs, report) => {
	logger.startGroup('Submit report');
	logger.info('Generate summary write request');

	const { debug } = inputs;
	const summaryWriteRequest = makeSummaryWriteRequest(report);

	if (debug) {
		logger.info('Generated summary write request\n');
		logger.info(`${JSON.stringify(summaryWriteRequest, null, 2)}\n`);
	}

	logger.info('Generate detail write requests');

	const detailWriteRequests = makeDetailWriteRequests(report);

	if (debug) {
		logger.info('Generated detail write requests\n');
		logger.info(`${JSON.stringify(detailWriteRequests, null, 2)}\n`);
	}

	logger.info('Merge write requests');

	const writeRequests = [
		summaryWriteRequest,
		...detailWriteRequests
	];

	logger.info('Assume required role');

	let credentials;

	try {
		const { githubOrganization, githubRepository } = context;
		const {
			awsAccessKeyId: accessKeyId,
			awsSecretAccessKey: secretAccessKey,
			awsSessionToken: sessionToken
		} = inputs;

		credentials = await assumeRole(
			region,
			{ accessKeyId, secretAccessKey, sessionToken },
			'arn:aws:iam::427469055187:role/test-reporting-github',
			`test-reporting-${(new Date()).getTime()}`,
			3600, // 1 hour
			[
				{ Key: 'Org', Value: githubOrganization },
				{ Key: 'Repo', Value: githubRepository }
			]
		);
	} catch ({ message }) {
		throw new Error(`Unable to assume required role: ${message}`);
	}

	const { dryRun } = inputs;

	if (dryRun) {
		logger.info('Dry run, skipping records submit');

		return;
	}

	logger.info('Executing write requests');

	try {
		await writeTimestream(region, credentials, writeRequests);
	} catch ({ message }) {
		throw new Error(`Unable to submit write requests: ${message}`);
	}

	logger.endGroup();
};

export { finalize, submit };
