import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { MeasureValueType, TimestreamWriteClient, TimeUnit, WriteRecordsCommand } from '@aws-sdk/client-timestream-write';
import fs from 'fs/promises';
import { validateContext } from 'd2l-test-reporting/helpers/github.js';
import { validateReport } from 'd2l-test-reporting/helpers/report.js';

const region = 'us-east-1';
const databaseName = 'test_reporting';
const { BIGINT, VARCHAR, MULTI } = MeasureValueType;
const { MILLISECONDS } = TimeUnit;

const makeSummaryRecord = (report) => {
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
		lmsBuild,
		lmsInstance
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

	if (lmsBuild) {
		dimensions.push({ Name: 'lms_build', Value: lmsBuild });
	}

	if (lmsInstance) {
		dimensions.push({ Name: 'lms_instance', Value: lmsInstance });
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

const makeDetailRecords = (report) => {
	const { reportId, details } = report;
	const records = details.map(detail => {
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
	});

	return {
		DatabaseName: databaseName,
		TableName: 'details',
		Records: records,
		CommonAttributes: {
			Version: 1,
			MeasureName: 'single_test_run',
			MeasureValueType: MULTI,
			Dimensions: [
				{ Name: 'report_id', Value: reportId, Type: VARCHAR }
			]
		}
	};
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

const writeTimestreamRecords = async(region, credentials, input) => {
	const client = new TimestreamWriteClient({ credentials, region });
	const command = new WriteRecordsCommand(input);

	await client.send(command);
};

const finalize = async(logger, context, inputs) => {
	logger.startGroup('Finalize test report');

	const { reportPath, injectGitHubContext } = inputs;
	let report;

	try {
		const reportRaw = await fs.readFile(reportPath, 'utf8');

		report = JSON.parse(reportRaw);
	} catch {
		throw new Error('Report is not valid');
	}

	const { summary } = report;

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

	logger.info('Validate schema');

	validateReport(report);

	logger.endGroup();

	return report;
};

const submit = async(logger, context, inputs, report) => {
	logger.startGroup('Submit report');
	logger.info('Generate summary record');

	const summaryRecord = makeSummaryRecord(report);

	logger.info('Generate detail records');

	const detailRecords = makeDetailRecords(report);

	logger.info('Assume required role');

	let credentials;

	try {
		const { githubOrganization: org, githubRepository: repo } = context;
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
				{ Key: 'Org', Value: org },
				{ Key: 'Repo', Value: repo }
			]
		);
	} catch {
		throw new Error('Unable to assume required role');
	}

	logger.info('Submit summary record');

	try {
		await writeTimestreamRecords(region, credentials, summaryRecord);
	} catch {
		throw new Error('Unable to submit summary record');
	}

	logger.info('Submit detail records');

	try {
		await writeTimestreamRecords(region, credentials, detailRecords);
	} catch {
		throw new Error('Unable to submit detail records');
	}

	logger.endGroup();
};

export { finalize, submit };
