import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { MeasureValueType, TimestreamWriteClient, TimeUnit, WriteRecordsCommand } from '@aws-sdk/client-timestream-write';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'fs/promises';

const ajv = new Ajv({ verbose: true });

addFormats(ajv, ['date-time', 'uri', 'uuid']);

const gitHubPattern = '[A-Za-z0-9_.-]+';
const nonEmptyStringPattern = '^[^\\s].+[^\\s]$';
const githubContextItems = {
	githubOrganization: { type: 'string', pattern: gitHubPattern },
	githubRepository: { type: 'string', pattern: gitHubPattern },
	githubWorkflow: { type: 'string', pattern: nonEmptyStringPattern },
	githubRunId: { type: 'integer', minimum: 0 },
	githubRunAttempt: { type: 'integer', minimum: 1 },
	gitBranch: { type: 'string', pattern: nonEmptyStringPattern },
	gitSha: { type: 'string', pattern: '([A-Fa-f0-9]{40})' }
};
const githubContextSchema = {
	type: 'object',
	properties: githubContextItems,
	required: [
		'githubOrganization',
		'githubRepository',
		'githubWorkflow',
		'githubRunId',
		'githubRunAttempt',
		'gitBranch',
		'gitSha'
	],
	additionalProperties: true
};
const fullReportSchema = {
	type: 'object',
	properties: {
		reportId: { type: 'string', format: 'uuid' },
		reportVersion: { type: 'integer', const: 1 },
		summary: {
			type: 'object',
			properties: {
				...githubContextItems,
				lmsBuild: { type: 'string', pattern: '([0-9]{2}\\.){3}[0-9]{5}' },
				lmsInstance: { type: 'string', format: 'uri' },
				operatingSystem: { type: 'string', enum: ['windows', 'linux', 'mac'] },
				framework: { type: 'string', pattern: nonEmptyStringPattern },
				started: { type: 'string', format: 'date-time' },
				totalDuration: { type: 'integer', minimum: 0 },
				status: { type: 'string', enum: ['passed', 'failed'] },
				countPassed: { type: 'integer', minimum: 0 },
				countFailed: { type: 'integer', minimum: 0 },
				countSkipped: { type: 'integer', minimum: 0 },
				countFlaky: { type: 'integer', minimum: 0 }
			},
			required: [
				'githubOrganization',
				'githubRepository',
				'githubWorkflow',
				'githubRunId',
				'githubRunAttempt',
				'gitBranch',
				'gitSha',
				'operatingSystem',
				'framework',
				'started',
				'totalDuration',
				'status',
				'countPassed',
				'countFailed',
				'countSkipped',
				'countFlaky'
			],
			additionalProperties: false
		},
		details: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					name: { type: 'string', pattern: nonEmptyStringPattern },
					location: { type: 'string', pattern: nonEmptyStringPattern },
					started: { type: 'string', format: 'date-time' },
					duration: { type: 'integer', minimum: 0 },
					totalDuration: { type: 'integer', minimum: 0 },
					status: { type: 'string', enum: ['passed', 'failed', 'skipped'] },
					tool: { type: 'string', pattern: nonEmptyStringPattern },
					experience: { type: 'string', pattern: nonEmptyStringPattern },
					type: { type: 'string', pattern: nonEmptyStringPattern },
					browser: { type: 'string', enum: ['chromium', 'firefox ', 'webkit'] },
					retries: { type: 'integer', minimum: 0 }
				},
				required: [
					'name',
					'location',
					'started',
					'duration',
					'totalDuration',
					'status',
					'retries'
				],
				additionalProperties: false
			}
		}
	},
	required: [
		'reportId',
		'reportVersion',
		'summary',
		'details'
	],
	additionalProperties: false
};
const region = 'us-east-1';
const databaseName = 'test_reporting';
const { BIGINT, VARCHAR, MULTI } = MeasureValueType;
const { MILLISECONDS } = TimeUnit;

const validateFullReport = ajv.compile(fullReportSchema);
const validateGitHubContext = ajv.compile(githubContextSchema);

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
		countFlaky
	} = summary;

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
			Dimensions: [
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
			]
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
			duration
		} = detail;

		return {
			Time: `${Date.parse(started)}`,
			TimeUnit: MILLISECONDS,
			MeasureValues: [
				{ Name: 'duration', Value: `${duration}`, Type: BIGINT },
				{ Name: 'total_duration', Value: `${totalDuration}`, Type: BIGINT },
				{ Name: 'retries', Value: `${retries}`, Type: BIGINT },
				{ Name: 'status', Value: status, Type: VARCHAR }
			],
			Dimensions: [
				{ Name: 'name', Value: name },
				{ Name: 'location', Value: location }
			]
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
		logger.warning('GitHub context missing or incomplete');
		logger.info('Inject missing GitHub context');

		report.summary = {
			...summary,
			...context
		};
	} else if (!validateGitHubContext(summary)) {
		if (injectGitHubContext === 'auto') {
			logger.warning('GitHub context missing or incomplete');
			logger.info('Inject missing GitHub context');

			report.summary = {
				...summary,
				...context
			};
		} else if (injectGitHubContext === 'off') {
			throw new Error('GitHub context missing or incomplete');
		}
	}

	logger.info('Validate schema');

	if (!validateFullReport(report)) {
		const { errors } = validateFullReport;
		const message = ajv.errorsText(errors, { dataVar: 'report' });

		throw new Error(`Report does not conform to needed schema: ${message}`);
	}

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
