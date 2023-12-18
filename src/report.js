import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { MeasureValueType, TimeUnit, TimestreamWriteClient, WriteRecordsCommand } from '@aws-sdk/client-timestream-write';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'fs/promises';

const ajv = new Ajv({ verbose: true });

addFormats(ajv, ['date-time', 'uri', 'uuid']);

const gitHubPattern = '[A-Za-z0-9_.-]+';
const nonEmptyStringPattern = '^[^\\s].+[^\\s]$';
const schema = {
	type: 'object',
	properties: {
		reportId: { type: 'string', format: 'uuid' },
		reportVersion: { type: 'integer', const: 1 },
		summary: {
			type: 'object',
			properties: {
				githubOrganization: { type: 'string', pattern: gitHubPattern },
				githubRepository: { type: 'string', pattern: gitHubPattern },
				githubWorkflow: { type: 'string', pattern: nonEmptyStringPattern },
				githubRunId: { type: 'integer', minimum: 0 },
				githubRunAttempt: { type: 'integer', minimum: 1 },
				gitBranch: { type: 'string', pattern: nonEmptyStringPattern },
				gitSha: { type: 'string', pattern: '([A-Fa-f0-9]{40})' },
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
const databaseName = 'test-reporting';
const { TIMESTAMP, BIGINT, VARCHAR, MULTI } = MeasureValueType;
const { MILLISECONDS } = TimeUnit;

const validate = ajv.compile(schema);

const finalize = async(logger, context, inputs) => {
	logger.startGroup('Finalize test report');

	const { reportPath } = inputs;
	let report;

	try {
		const reportRaw = await fs.readFile(reportPath, 'utf8');

		report = JSON.parse(reportRaw);
	} catch {
		throw new Error('Report is not valid');
	}

	logger.info('Inject any missing GitHub context');

	report.summary = {
		...context,
		...report.summary
	};

	logger.info('Validate schema');

	if (!validate(report)) {
		const message = ajv.errorsText(validate.errors, { dataVar: 'report' });

		throw new Error(`Report does not conform to needed schema: ${message}`);
	}

	logger.endGroup();

	return report;
};

const makeSummaryRecord = (report) => {
	const { reportId, summary } = report;
	const {
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
	const time = Date.parse(started).toString();

	return {
		DatabaseName: databaseName,
		TableName: 'summary',
		Records: [{
			Version: 1,
			Time: time,
			TimeUnit: MILLISECONDS,
			MeasureType: MULTI,
			MeasureValues: [
				{ Name: 'started', Value: started, Type: TIMESTAMP },
				{ Name: 'total_duration', Value: totalDuration, Type: BIGINT },
				{ Name: 'status', Value: status, Type: VARCHAR },
				{ Name: 'count_passed', Value: countPassed, Type: BIGINT },
				{ Name: 'count_failed', Value: countFailed, Type: BIGINT },
				{ Name: 'count_skipped', Value: countSkipped, Type: BIGINT },
				{ Name: 'count_flaky', Value: countFlaky, Type: BIGINT }
			],
			Dimensions: [
				{ Name: 'report_id', Value: reportId },
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
		const time = Date.parse(started).toString();

		return {
			Time: time,
			TimeUnit: MILLISECONDS,
			MeasureValues: [
				{ Name: 'started', Value: started, Type: TIMESTAMP },
				{ Name: 'duration', Value: duration, Type: BIGINT },
				{ Name: 'total_duration', Value: totalDuration, Type: BIGINT },
				{ Name: 'retries', Value: retries, Type: BIGINT },
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
		CommonAttributes: [{
			Version: 1,
			MeasureType: MULTI,
			Dimensions: [
				{ Name: 'report_id', Value: reportId, Type: VARCHAR }
			]
		}]
	};
};

const assumeRole = async(region, credentials, arn, sessionName, duration, tags) => {
	// basic credentials valiation
	// validate region
	// validate role
	// validate session name
	// validate tags

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
	console.log(JSON.stringify(input, null, 2));
	// const client = new TimestreamWriteClient({ credentials, region });
	// const command = new WriteRecordsCommand(input);

	// await client.send(command);
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
			{
				accessKeyId,
				secretAccessKey,
				sessionToken
			},
			'arn:aws:iam::427469055187:role/test-reporting-github',
			`test-reporting-${(new Date()).getTime()}`,
			3600, // 1 hour
			[
				{ Key: 'Org', Value: org },
				{ Key: 'Repo', Value: repo }
			]
		);
	} catch (err) {
		throw new Error('Unable to assume required role');
	}

	logger.info('Submit summary record');

	await writeTimestreamRecords(region, credentials, summaryRecord);

	logger.info('Submit detail records');

	await writeTimestreamRecords(region, credentials, detailRecords);

	logger.endGroup();
};

export { finalize, submit };
