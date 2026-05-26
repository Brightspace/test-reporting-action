import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { MeasureValueType, TimestreamWriteClient, TimeUnit, WriteRecordsCommand } from '@aws-sdk/client-timestream-write';
import fs from 'node:fs';
import { Report } from 'd2l-test-reporting/helpers/report.js';

const region = 'us-east-1';
const databaseName = 'test_reporting';
const repoSettingsDocUrl = 'https://github.com/Brightspace/repo-settings/blob/main/docs/test-reporting.md#analytics';
const { BIGINT, VARCHAR, MULTI } = MeasureValueType;
const { MILLISECONDS } = TimeUnit;

// --------------------------------------------------------------------------
// `experience` was dropped from the v3 report schema but consumers still rely
// on the `experience` Timestream dimension. We snapshot it from the raw report
// JSON before the upgrade and inject it onto the outgoing detail records.
// Delete this block (and its two call sites in `finalize`/`submit`) once the
// dimension is no longer needed.
const experienceMaps = new WeakMap();

const captureExperience = (report, reportPath) => {
	const raw = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
	const version = raw.version ?? raw.reportVersion;

	if (version !== 1 && version !== 2) {
		return;
	}

	const map = new Map();

	for (const detail of raw.details) {
		const { name, location, experience } = detail;

		if (!experience) {
			continue;
		}

		const locationFile = typeof location === 'string' ? location : location.file;

		map.set(`${name}|${locationFile}`, experience);
	}

	if (map.size > 0) {
		experienceMaps.set(report, map);
	}
};

const applyExperienceDimensions = (report, detailWriteRequests) => {
	const map = experienceMaps.get(report);

	if (!map) {
		return;
	}

	experienceMaps.delete(report);

	for (const request of detailWriteRequests) {
		for (const record of request.Records) {
			const name = record.Dimensions.find(d => d.Name === 'name')?.Value;
			const locationFile = record.Dimensions.find(d => d.Name === 'location_file')?.Value;
			const experience = map.get(`${name}|${locationFile}`);

			if (experience) {
				record.Dimensions.push({ Name: 'experience', Value: experience });
			}
		}
	}
};
// --------------------------------------------------------------------------

const makeSummaryWriteRequest = (report) => {
	const { id, version, summary } = report;
	const {
		github: {
			organization,
			repository,
			workflow,
			runId,
			runAttempt
		},
		git: {
			branch,
			sha
		},
		operatingSystem,
		framework,
		started,
		duration: {
			total
		},
		status,
		count: {
			passed,
			failed,
			skipped,
			flaky
		},
		lms
	} = summary;

	const dimensions = [
		{ Name: 'report_id', Value: id },
		{ Name: 'github_organization', Value: organization },
		{ Name: 'github_repository', Value: repository },
		{ Name: 'github_workflow', Value: workflow },
		{ Name: 'github_run_id', Value: runId.toString() },
		{ Name: 'github_run_attempt', Value: runAttempt.toString() },
		{ Name: 'git_branch', Value: branch },
		{ Name: 'git_sha', Value: sha },
		{ Name: 'operating_system', Value: operatingSystem },
		{ Name: 'framework', Value: framework }
	];

	if (lms) {
		const { buildNumber, instanceUrl } = lms;

		if (buildNumber) {
			dimensions.push({ Name: 'lms_build_number', Value: buildNumber });
		}

		if (instanceUrl) {
			dimensions.push({ Name: 'lms_instance_url', Value: instanceUrl });
		}
	}

	return {
		DatabaseName: databaseName,
		TableName: 'summary',
		Records: [{
			Version: 1,
			Time: (Date.parse(started)).toString(),
			TimeUnit: MILLISECONDS,
			// `_bc` suffix matches the `details` table and signals that the
			// records are emitted alongside deprecated detail dimensions. Drop the
			// suffix once the deprecated dimensions are removed.
			MeasureName: `report_v${version}_bc`,
			MeasureValueType: MULTI,
			MeasureValues: [
				{ Name: 'duration_total', Value: total.toString(), Type: BIGINT },
				{ Name: 'status', Value: status, Type: VARCHAR },
				{ Name: 'count_passed', Value: passed.toString(), Type: BIGINT },
				{ Name: 'count_failed', Value: failed.toString(), Type: BIGINT },
				{ Name: 'count_skipped', Value: skipped.toString(), Type: BIGINT },
				{ Name: 'count_flaky', Value: flaky.toString(), Type: BIGINT }
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
		config,
		github,
		duration: {
			total,
			final
		},
		status,
		browser,
		taxonomy
	} = detail;
	const { file, line, column } = location;
	const { timeout } = config ?? {};
	const { codeowners } = github ?? {};
	const { type, tool } = taxonomy ?? {};
	const measures = [
		{ Name: 'duration_final', Value: final.toString(), Type: BIGINT },
		{ Name: 'duration_total', Value: total.toString(), Type: BIGINT },
		{ Name: 'retries', Value: retries.toString(), Type: BIGINT },
		{ Name: 'status', Value: status, Type: VARCHAR }
	];
	const dimensions = [
		{ Name: 'name', Value: name },
		{ Name: 'location_file', Value: file }
	];

	if (timeout) {
		// kept for backwards compat. Once all dashboards are updated will be removed
		dimensions.push({ Name: 'timeout', Value: timeout.toString() });
		/////////////////////////////////////////////////////////////////////////////
		measures.push({ Name: 'config_timeout', Value: timeout.toString(), Type: BIGINT });
	}

	if (line) {
		dimensions.push({ Name: 'location_line', Value: line.toString() });
	}

	if (column) {
		dimensions.push({ Name: 'location_column', Value: column.toString() });
	}

	if (browser) {
		dimensions.push({ Name: 'browser', Value: browser });
	}

	if (type) {
		// kept for backwards compat. Once all dashboards are updated will be removed
		dimensions.push({ Name: 'type', Value: type });
		/////////////////////////////////////////////////////////////////////////////
		dimensions.push({ Name: 'taxonomy_type', Value: type });
	}

	if (tool) {
		// kept for backwards compat. Once all dashboards are updated will be removed
		dimensions.push({ Name: 'tool', Value: tool });
		/////////////////////////////////////////////////////////////////////////////
		dimensions.push({ Name: 'taxonomy_tool', Value: tool });
	}

	if (codeowners) {
		dimensions.push({ Name: 'github_codeowners', Value: codeowners.join(',') });
	}

	return {
		Time: (Date.parse(started)).toString(),
		TimeUnit: MILLISECONDS,
		MeasureValues: measures,
		Dimensions: dimensions
	};
};

const makeDetailWriteRequests = (report) => {
	const { id, version, details } = report;
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
					// `_bc` suffix signals that records still carry deprecated
					// dimensions (`experience`, `type`, `tool`) for backwards
					// compatibility. Drop the suffix once those are removed.
					MeasureName: `report_v${version}_bc`,
					MeasureValueType: MULTI,
					Dimensions: [
						{ Name: 'report_id', Value: id, Type: VARCHAR }
					]
				}
			};
		}
	);

	return writeRequests;
};

const assumeRole = async(logger, region, credentials, arn, sessionName, duration, tags) => {
	const client = new STSClient({ region, credentials });
	const command = new AssumeRoleCommand({
		RoleArn: arn,
		RoleSessionName: sessionName,
		DurationSeconds: duration,
		Tags: tags
	});

	let response;

	try {
		response = await client.send(command);
	} catch (err) {
		const { name, message, $metadata = {} } = err;
		const { httpStatusCode = '[unknown]', requestId = '[unknown]' } = $metadata;

		logger.error(`AWS ${name} (HTTP ${httpStatusCode}, request ${requestId}): ${message}`);

		if (name === 'AccessDenied') {
			logger.info(`Hint: Possibly missing repo-settings set-up. See ${repoSettingsDocUrl} for details`);
		}

		throw new Error('Unable to assume required role');
	}

	const { AccessKeyId, SecretAccessKey, SessionToken } = response.Credentials;

	return {
		accessKeyId: AccessKeyId,
		secretAccessKey: SecretAccessKey,
		sessionToken: SessionToken
	};
};

const writeTimestream = async(logger, context, region, credentials, requests) => {
	const { debug } = context;
	const client = new TimestreamWriteClient({ credentials, region });

	for (const [index, request] of requests.entries()) {
		try {
			logger.info(`Sending batch ${index + 1} of ${requests.length} (${request.Records.length} records)`);

			if (debug) {
				logger.info(`${JSON.stringify(request, null, 2)}\n`);
			}

			const command = new WriteRecordsCommand(request);

			await client.send(command);
		} catch (err) {
			const { name, message, $metadata = {}, RejectedRecords } = err;
			const { httpStatusCode = '[unknown]', requestId = '[unknown]' } = $metadata;

			logger.error(`AWS ${name} on batch ${index + 1}/${requests.length} (HTTP ${httpStatusCode}, request ${requestId}): ${message}`);

			if (Array.isArray(RejectedRecords)) {
				for (const rejected of RejectedRecords) {
					const record = JSON.stringify(request.Records[rejected.RecordIndex]);

					logger.error(`Rejected record ${rejected.RecordIndex} (${rejected.Reason}): ${record}`);
				}
			}

			throw new Error('Unable to submit write requests');
		}
	}
};

const finalize = (logger, context, inputs) => {
	logger.startGroup('Finalize test report');

	const { reportPath, injectGitHubContext, lmsBuildNumber, lmsInstanceUrl, debug } = inputs;
	const lmsInfo = {};

	if (lmsBuildNumber) {
		lmsInfo.buildNumber = lmsBuildNumber;
	}

	if (lmsInstanceUrl) {
		lmsInfo.instanceUrl = lmsInstanceUrl;
	}

	let reportOptions = { lmsInfo, upgradeToLatest: true };

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

	captureExperience(report, reportPath);

	if (experienceMaps.has(report)) {
		logger.info('Captured experience dimension from source report for backwards compatibility');

		if (debug) {
			const map = experienceMaps.get(report);

			logger.info(`Experience map (${map.size} entries)\n`);
			logger.info(`${JSON.stringify(Object.fromEntries(map), null, 2)}\n`);
		}
	}

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

	return report;
};

const submit = async(logger, context, inputs, report) => {
	logger.startGroup('Submit report');
	logger.info('Generate summary write request');

	const reportJson = report.toJSON();
	const summaryWriteRequest = makeSummaryWriteRequest(reportJson);

	logger.info('Generate detail write requests');

	const detailWriteRequests = makeDetailWriteRequests(reportJson);

	if (experienceMaps.has(report)) {
		logger.info('Restoring experience dimension onto detail records');
	}

	applyExperienceDimensions(report, detailWriteRequests);

	logger.info('Merge write requests');

	const writeRequests = [
		summaryWriteRequest,
		...detailWriteRequests
	];

	logger.info('Assume required role');

	const { github: { organization, repository } } = context;
	const {
		awsAccessKeyId: accessKeyId,
		awsSecretAccessKey: secretAccessKey,
		awsSessionToken: sessionToken,
		roleToAssume: roleArn
	} = inputs;
	const credentials = await assumeRole(
		logger,
		region,
		{ accessKeyId, secretAccessKey, sessionToken },
		roleArn,
		`test-reporting-${(new Date()).getTime()}`,
		3600, // 1 hour
		[
			{ Key: 'Org', Value: organization },
			{ Key: 'Repo', Value: repository }
		]
	);

	const { dryRun } = inputs;

	if (dryRun) {
		logger.info('Dry run, skipping records submit');

		return;
	}

	logger.info('Executing write requests');

	await writeTimestream(logger, inputs, region, credentials, writeRequests);

	logger.endGroup();
};

export { finalize, submit };
