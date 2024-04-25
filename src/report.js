import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { MeasureValueType, TimestreamWriteClient, TimeUnit, WriteRecordsCommand } from '@aws-sdk/client-timestream-write';
import { Report } from 'd2l-test-reporting/helpers/report.js';

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

const finalize = async(logger, context, inputs) => {
	logger.startGroup('Finalize test report');

	const { reportPath, injectGitHubContext, lmsBuildNumber, lmsInstanceUrl, debug } = inputs;
	const lmsInfo = {};

	if (lmsBuildNumber) {
		lmsInfo.buildNumber = lmsBuildNumber;
	}

	if (lmsInstanceUrl) {
		lmsInfo.instanceUrl = lmsInstanceUrl;
	}

	let reportOptions = { lmsInfo };

	if (injectGitHubContext === 'force') {
		logger.info('Forcefully inject GitHub context');

		reportOptions = {
			...reportOptions,
			context,
			overrideContext: true
		};
	} else if (injectGitHubContext === 'auto') {
		logger.info('Allow injection of GitHub context');

		reportOptions = {
			...reportOptions,
			context
		};
	} else {
		logger.info('Not injecting GitHub context');
	}

	const report = new Report(reportPath, reportOptions);

	if (debug) {
		logger.info('Loaded report\n');
		logger.info(`${JSON.stringify(report, null, 2)}\n`);
	}

	logger.info(`Report ID: ${report.getId()}`);

	const originalVersion = report.getVersionOriginal();
	const version = report.getVersion();

	if (originalVersion !== version) {
		logger.info(`Report Version: ${version} (Upgrade from ${originalVersion})`);
	} else {
		logger.info(`Report Version: ${version}`);
	}

	logger.endGroup();

	return report.toJSON();
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
		const { github: { organization, repository } } = context;
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
				{ Key: 'Org', Value: organization },
				{ Key: 'Repo', Value: repository }
			]
		);
	} catch ({ message }) {
		if (message.includes('is not authorized to perform')) {
			throw new Error('Unable to assume required role. Possibly missing repo-settings set-up. Please see https://github.com/Brightspace/repo-settings/blob/main/docs/test-reporting.md for details');
		}

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
