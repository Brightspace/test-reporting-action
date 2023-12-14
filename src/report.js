import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'fs/promises';

const ajv = new Ajv({ verbose: true });

addFormats(ajv, ['date-time', 'uri', 'uuid' ]);

const schema = {
	type: 'object',
	properties: {
		reportId: { type: 'string', format: 'uuid' },
		reportVersion: { type: 'integer', const: 1 },
		summary: {
			type: 'object',
			properties: {
				githubOrganization: { type: 'string', pattern: '[A-Za-z0-9_.-]+' },
				githubRepository: { type: 'string', pattern: '[A-Za-z0-9_.-]+' },
				githubWorkflow: { type: 'string', pattern: '^[^\\s].+[^\\s]$' },
				githubRunId: { type: 'integer', minimum: 0 },
				githubRunAttempt: { type: 'integer', minimum: 1 },
				gitBranch: { type: 'string', pattern: '^[^\\s].+[^\\s]$' },
				gitSha: { type: 'string', pattern: '([A-Fa-f0-9]{40})' },
				lmsBuild: { type: 'string', pattern: '([0-9]{2}\\.){3}[0-9]{5}' },
				lmsInstance: { type: 'string', format: 'uri' },
				operatingSystem: { type: 'string', enum: ['windows', 'linux', 'mac'] },
				framework: { type: 'string', pattern: '^[^\\s].+[^\\s]$' },
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
					name: { type: 'string', pattern: '^[^\\s].+[^\\s]$' },
					location: { type: 'string', pattern: '^[^\\s].+[^\\s]$' },
					started: { type: 'string', format: 'date-time' },
					duration: { type: 'integer', minimum: 0 },
					totalDuration: { type: 'integer', minimum: 0 },
					status: { type: 'string', enum: ['passed', 'failed', 'skipped'] },
					tool: { type: 'string', pattern: '^[^\\s].+[^\\s]$' },
					experience: { type: 'string', pattern: '^[^\\s].+[^\\s]$' },
					type: { type: 'string', pattern: '^[^\\s].+[^\\s]$' },
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

	logger.info('Injecting any missing GitHub context');

	report.summary = {
		...context,
		...report.summary
	};

	logger.info('Validating schema');

	if (!validate(report)) {
		const message = ajv.errorsText(validate.errors, { dataVar: 'report' });

		throw new Error(`Report does not conform to needed schema: ${message}`);
	}

	logger.endGroup();

	return report;
};

const submit = async(/*logger, report*/) => {

};

export { finalize, submit };
