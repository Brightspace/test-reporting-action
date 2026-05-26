import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { finalize, submit } from '../src/report.js';
import { TimestreamWriteClient, WriteRecordsCommand } from '@aws-sdk/client-timestream-write';
import { createSandbox } from 'sinon';
import { expect } from 'chai';
import fs from 'fs';
import { mockClient } from 'aws-sdk-client-mock';
import { Report } from 'd2l-test-reporting/helpers/report.js';

const testContext = {
	github: {
		organization: 'TestOrganization',
		repository: 'test-repository',
		workflow: 'test-workflow.yml',
		runId: 12345,
		runAttempt: 1
	},
	git: {
		branch: 'test/branch',
		sha: '0000000000000000000000000000000000000000'
	}
};
const testOtherContext = {
	github: {
		organization: 'TestOrganizationOther',
		repository: 'test-repository-other',
		workflow: 'test-workflow-other.yml',
		runId: 67890,
		runAttempt: 2
	},
	git: {
		branch: 'test/branch/other',
		sha: '1111111111111111111111111111111111111111'
	}
};
const lmsInfo = {
	lmsBuildNumber: '20.24.1.12345',
	lmsInstanceUrl: 'https://cd2024112345.devlms.desire2learn.com'
};
const testInputsNoLmsInfo = {
	awsAccessKeyId: 'test-access-key-id',
	awsSecretAccessKey: 'test-secret-access-key',
	awsSessionToken: 'test-session-token',
	injectGitHubContext: 'auto',
	reportPath: './d2l-test-report.json',
	dryRun: false,
	debug: true
};
const testInputsFull = {
	...testInputsNoLmsInfo,
	...lmsInfo
};
const testInputsForceInject = {
	...testInputsNoLmsInfo,
	...lmsInfo,
	injectGitHubContext: 'force'
};
const testInputsDisableInject = {
	...testInputsNoLmsInfo,
	...lmsInfo,
	injectGitHubContext: 'off'
};
const testReportV1Minimal = {
	reportId: '00000000-0000-0000-0000-000000000000',
	reportVersion: 1,
	summary: {
		operatingSystem: 'linux',
		framework: 'mocha',
		started: (new Date()).toISOString(),
		totalDuration: 23857,
		status: 'passed',
		countPassed: 2,
		countFailed: 0,
		countSkipped: 1,
		countFlaky: 1
	},
	details: [{
		name: 'test suite > flaky test',
		location: 'test/test-suite.js',
		started: (new Date()).toISOString(),
		duration: 237,
		totalDuration: 549,
		status: 'passed',
		retries: 1
	}, {
		name: 'test suite > passing test',
		location: 'test/test-suite.js',
		started: (new Date()).toISOString(),
		duration: 237,
		totalDuration: 237,
		status: 'passed',
		retries: 0
	}, {
		name: 'test suite > skipped test',
		location: 'test/test-suite.js',
		started: (new Date()).toISOString(),
		duration: 0,
		totalDuration: 0,
		status: 'skipped',
		retries: 0
	}]
};
const testReportV1NoLmsInfo = {
	reportId: testReportV1Minimal.reportId,
	reportVersion: testReportV1Minimal.reportVersion,
	summary: {
		...testReportV1Minimal.summary,
		githubOrganization: testContext.github.organization,
		githubRepository: testContext.github.repository,
		githubWorkflow: testContext.github.workflow,
		githubRunId: testContext.github.runId,
		githubRunAttempt: testContext.github.runAttempt,
		gitBranch: testContext.git.branch,
		gitSha: testContext.git.sha
	},
	details: testReportV1Minimal.details.map(detail => ({
		...detail,
		browser: 'chromium',
		type: 'unit',
		tool: 'Tool',
		experience: 'Experience'
	}))
};
const testReportV1Full = {
	...testReportV1NoLmsInfo,
	summary: {
		...testReportV1NoLmsInfo.summary,
		...lmsInfo
	},
	details: testReportV1NoLmsInfo.details.map(detail => ({
		...detail,
		browser: 'chromium',
		type: 'unit',
		tool: 'Tool',
		experience: 'Experience'
	}))
};
const testReportV2Minimal = {
	id: '00000000-0000-0000-0000-000000000000',
	version: 2,
	summary: {
		operatingSystem: 'linux',
		framework: 'mocha',
		started: (new Date()).toISOString(),
		duration: {
			total: 23857
		},
		status: 'passed',
		count: {
			passed: 2,
			failed: 0,
			skipped: 1,
			flaky: 1
		}
	},
	details: [{
		name: 'test suite > flaky test',
		location: { file: 'test/test-suite.js', line: 10, column: 4 },
		started: (new Date()).toISOString(),
		duration: { final: 237, total: 549 },
		status: 'passed',
		retries: 1,
		timeout: 5000
	}, {
		name: 'test suite > passing test',
		location: { file: 'test/test-suite.js', line: 20, column: 4 },
		started: (new Date()).toISOString(),
		duration: { final: 237, total: 237 },
		status: 'passed',
		retries: 0,
		timeout: 5000
	}, {
		name: 'test suite > skipped test',
		location: { file: 'test/test-suite.js', line: 30, column: 4 },
		started: (new Date()).toISOString(),
		duration: { final: 0, total: 0 },
		status: 'skipped',
		retries: 0,
		timeout: 5000
	}]
};
const testReportV2NoLmsInfo = {
	id: testReportV2Minimal.id,
	version: testReportV2Minimal.version,
	summary: {
		...testReportV2Minimal.summary,
		github: {
			organization: testContext.github.organization,
			repository: testContext.github.repository,
			workflow: testContext.github.workflow,
			runId: testContext.github.runId,
			runAttempt: testContext.github.runAttempt
		},
		git: {
			branch: testContext.git.branch,
			sha: testContext.git.sha
		}
	},
	details: testReportV2Minimal.details.map(detail => ({
		...detail,
		browser: 'chromium',
		type: 'unit',
		tool: 'Tool',
		experience: 'Experience'
	}))
};
const testReportV2Full = {
	...testReportV2NoLmsInfo,
	summary: {
		...testReportV2NoLmsInfo.summary,
		lms: {
			buildNumber: lmsInfo.lmsBuildNumber,
			instanceUrl: lmsInfo.lmsInstanceUrl
		}
	},
	details: testReportV2NoLmsInfo.details.map(detail => ({
		...detail,
		browser: 'chromium',
		type: 'unit',
		tool: 'Tool',
		experience: 'Experience'
	}))
};
const testCodeowners = ['@brightspace/test-reporting-action', '@brightspace/reporting'];
const testReportV3Minimal = {
	id: '00000000-0000-0000-0000-000000000000',
	version: 3,
	summary: {
		operatingSystem: 'linux',
		framework: 'mocha',
		started: (new Date()).toISOString(),
		duration: {
			total: 23857
		},
		status: 'passed',
		count: {
			passed: 2,
			failed: 0,
			skipped: 1,
			flaky: 1
		}
	},
	details: [{
		name: 'test suite > flaky test',
		location: { file: 'test/test-suite.js', line: 10, column: 4 },
		started: (new Date()).toISOString(),
		duration: { final: 237, total: 549 },
		status: 'passed',
		retries: 1,
		config: { timeout: 5000 }
	}, {
		name: 'test suite > passing test',
		location: { file: 'test/test-suite.js', line: 20, column: 4 },
		started: (new Date()).toISOString(),
		duration: { final: 237, total: 237 },
		status: 'passed',
		retries: 0,
		config: { timeout: 5000 }
	}, {
		name: 'test suite > skipped test',
		location: { file: 'test/test-suite.js', line: 30, column: 4 },
		started: (new Date()).toISOString(),
		duration: { final: 0, total: 0 },
		status: 'skipped',
		retries: 0,
		config: { timeout: 5000 }
	}]
};
const testReportV3NoLmsInfo = {
	id: '00000000-0000-0000-0000-000000000000',
	version: 3,
	summary: {
		operatingSystem: 'linux',
		framework: 'mocha',
		started: (new Date()).toISOString(),
		duration: {
			total: 23857
		},
		status: 'passed',
		count: {
			passed: 2,
			failed: 0,
			skipped: 1,
			flaky: 1
		},
		github: {
			organization: testContext.github.organization,
			repository: testContext.github.repository,
			workflow: testContext.github.workflow,
			runId: testContext.github.runId,
			runAttempt: testContext.github.runAttempt
		},
		git: {
			branch: testContext.git.branch,
			sha: testContext.git.sha
		}
	},
	details: [{
		name: 'test suite > flaky test',
		location: { file: 'test/test-suite.js', line: 10, column: 4 },
		started: (new Date()).toISOString(),
		duration: { final: 237, total: 549 },
		status: 'passed',
		retries: 1,
		browser: 'chromium',
		config: { timeout: 5000 },
		taxonomy: { tool: 'Tool', type: 'unit' },
		github: { codeowners: testCodeowners }
	}, {
		name: 'test suite > passing test',
		location: { file: 'test/test-suite.js', line: 20, column: 4 },
		started: (new Date()).toISOString(),
		duration: { final: 237, total: 237 },
		status: 'passed',
		retries: 0,
		browser: 'chromium',
		config: { timeout: 5000 },
		taxonomy: { tool: 'Tool', type: 'unit' },
		github: { codeowners: testCodeowners }
	}, {
		name: 'test suite > skipped test',
		location: { file: 'test/test-suite.js', line: 30, column: 4 },
		started: (new Date()).toISOString(),
		duration: { final: 0, total: 0 },
		status: 'skipped',
		retries: 0,
		browser: 'chromium',
		config: { timeout: 5000 },
		taxonomy: { tool: 'Tool', type: 'unit' },
		github: { codeowners: testCodeowners }
	}]
};
const testReportV3Full = {
	id: '00000000-0000-0000-0000-000000000000',
	version: 3,
	summary: {
		operatingSystem: 'linux',
		framework: 'mocha',
		started: (new Date()).toISOString(),
		duration: {
			total: 23857
		},
		status: 'passed',
		count: {
			passed: 2,
			failed: 0,
			skipped: 1,
			flaky: 1
		},
		github: {
			organization: testContext.github.organization,
			repository: testContext.github.repository,
			workflow: testContext.github.workflow,
			runId: testContext.github.runId,
			runAttempt: testContext.github.runAttempt
		},
		git: {
			branch: testContext.git.branch,
			sha: testContext.git.sha
		},
		lms: {
			buildNumber: lmsInfo.lmsBuildNumber,
			instanceUrl: lmsInfo.lmsInstanceUrl
		}
	},
	details: [{
		name: 'test suite > flaky test',
		location: { file: 'test/test-suite.js', line: 10, column: 4 },
		started: (new Date()).toISOString(),
		duration: { final: 237, total: 549 },
		status: 'passed',
		retries: 1,
		browser: 'chromium',
		config: { timeout: 5000 },
		taxonomy: { tool: 'Tool', type: 'unit' },
		github: { codeowners: testCodeowners }
	}, {
		name: 'test suite > passing test',
		location: { file: 'test/test-suite.js', line: 20, column: 4 },
		started: (new Date()).toISOString(),
		duration: { final: 237, total: 237 },
		status: 'passed',
		retries: 0,
		browser: 'chromium',
		config: { timeout: 5000 },
		taxonomy: { tool: 'Tool', type: 'unit' },
		github: { codeowners: testCodeowners }
	}, {
		name: 'test suite > skipped test',
		location: { file: 'test/test-suite.js', line: 30, column: 4 },
		started: (new Date()).toISOString(),
		duration: { final: 0, total: 0 },
		status: 'skipped',
		retries: 0,
		browser: 'chromium',
		config: { timeout: 5000 },
		taxonomy: { tool: 'Tool', type: 'unit' },
		github: { codeowners: testCodeowners }
	}]
};
const testAwsStsCredentials = {
	Credentials: {
		AccessKeyId: 'test-access-key-id',
		SecretAccessKey: 'test-secret-access-key',
		SessionToken: 'test-session-token'
	}
};
const upgradeTestCases = [{
	sourceVersion: 1,
	expectedReportId: testReportV1Minimal.reportId,
	testReportMinimal: testReportV1Minimal,
	testReportNoLmsInfo: testReportV1NoLmsInfo,
	testReportFull: testReportV1Full
}, {
	sourceVersion: 2,
	expectedReportId: testReportV2Minimal.id,
	testReportMinimal: testReportV2Minimal,
	testReportNoLmsInfo: testReportV2NoLmsInfo,
	testReportFull: testReportV2Full
}, {
	sourceVersion: 3,
	expectedReportId: testReportV3Minimal.id,
	testReportMinimal: testReportV3Minimal,
	testReportNoLmsInfo: testReportV3NoLmsInfo,
	testReportFull: testReportV3Full
}];

const expectFinalizedReport = (report, options) => {
	const { id, version, summary, details } = report.toJSON();
	const {
		sourceReport,
		sourceVersion,
		reportId, context,
		hasBrowser,
		hasTaxonomy
	} = options;
	const { github, git, lms, duration, count } = summary;
	const { github: expectedGithub, git: expectedGit } = context;
	const sourceDetails = sourceReport.details;
	const extendedLocationAvailable = sourceVersion >= 2;
	const codeownersAvailable = sourceVersion >= 3;
	const timeoutAvailable = sourceVersion >= 2;

	expect(id).to.eq(reportId);
	expect(version).to.eq(3);
	expect(github.organization).to.eq(expectedGithub.organization);
	expect(github.repository).to.eq(expectedGithub.repository);
	expect(github.workflow).to.eq(expectedGithub.workflow);
	expect(github.runId).to.eq(expectedGithub.runId);
	expect(github.runAttempt).to.eq(expectedGithub.runAttempt);
	expect(git.branch).to.eq(expectedGit.branch);
	expect(git.sha).to.eq(expectedGit.sha);
	expect(lms.buildNumber).to.eq(lmsInfo.lmsBuildNumber);
	expect(lms.instanceUrl).to.eq(lmsInfo.lmsInstanceUrl);
	expect(summary.operatingSystem).to.eq('linux');
	expect(summary.framework).to.eq('mocha');
	expect(summary.started).to.eq(sourceReport.summary.started);
	expect(duration.total).to.eq(23857);
	expect(summary.status).to.eq('passed');
	expect(count.passed).to.eq(2);
	expect(count.failed).to.eq(0);
	expect(count.skipped).to.eq(1);
	expect(count.flaky).to.eq(1);
	expect(details).to.have.lengthOf(3);
	expect(details[0].name).to.eq('test suite > flaky test');
	expect(details[0].status).to.eq('passed');
	expect(details[0].retries).to.eq(1);
	expect(details[0].duration.final).to.eq(237);
	expect(details[0].duration.total).to.eq(549);
	expect(details[0].started).to.eq(sourceReport.details[0].started);
	expect(details[1].name).to.eq('test suite > passing test');
	expect(details[1].status).to.eq('passed');
	expect(details[1].retries).to.eq(0);
	expect(details[1].duration.final).to.eq(237);
	expect(details[1].duration.total).to.eq(237);
	expect(details[1].started).to.eq(sourceReport.details[1].started);
	expect(details[2].name).to.eq('test suite > skipped test');
	expect(details[2].status).to.eq('skipped');
	expect(details[2].retries).to.eq(0);
	expect(details[2].duration.final).to.eq(0);
	expect(details[2].duration.total).to.eq(0);
	expect(details[2].started).to.eq(sourceReport.details[2].started);

	for (const [index, detail] of details.entries()) {
		const sourceDetail = sourceDetails[index];
		const { location } = detail;
		const hasExtendedLocation = extendedLocationAvailable &&
			typeof sourceDetail.location === 'object';
		const hasCodeowners = codeownersAvailable &&
			sourceDetail.github?.codeowners != null;
		const hasTimeout = timeoutAvailable &&
			(sourceDetail.config?.timeout != null || sourceDetail.timeout != null);

		expect(location.file).to.eq('test/test-suite.js');

		if (hasExtendedLocation) {
			const expectedLocation = sourceDetail.location;
			const { line, column } = expectedLocation;

			expect(location.line).to.eq(line);
			expect(location.column).to.eq(column);
		} else {
			expect(location.line).to.be.undefined;
			expect(location.column).to.be.undefined;
		}

		if (hasBrowser) {
			expect(detail.browser).to.eq('chromium');
		} else {
			expect(detail.browser).to.be.undefined;
		}

		if (hasTaxonomy) {
			expect(detail.taxonomy.tool).to.eq('Tool');
			expect(detail.taxonomy.type).to.eq('unit');
		} else {
			expect(detail.taxonomy).to.be.undefined;
		}

		expect(detail.tool).to.be.undefined;
		expect(detail.type).to.be.undefined;
		expect(detail.experience).to.be.undefined;

		if (hasCodeowners) {
			expect(detail.github.codeowners).to.deep.eq(testCodeowners);
		} else {
			expect(detail.github).to.be.undefined;
		}

		if (hasTimeout) {
			expect(detail.config.timeout).to.eq(sourceDetail.config?.timeout ?? sourceDetail.timeout);
		} else {
			expect(detail.config).to.be.undefined;
		}

		expect(detail.timeout).to.be.undefined;
	}
};

describe('report', () => {
	let sandbox;
	let logger;

	const makeDummyLogger = () => ({
		startGroup: sandbox.stub(),
		endGroup: sandbox.stub(),
		info: sandbox.stub(),
		warning: sandbox.stub(),
		error: sandbox.stub()
	});

	before(() => sandbox = createSandbox());

	beforeEach(() => logger = makeDummyLogger());

	afterEach(() => sandbox.restore());

	describe('finalize', () => {
		for (const testCase of upgradeTestCases) {
			const {
				sourceVersion,
				expectedReportId,
				testReportMinimal,
				testReportNoLmsInfo,
				testReportFull
			} = testCase;

			describe(`v${sourceVersion} source`, () => {
				it('minimal', async() => {
					sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportMinimal));

					const report = await finalize(logger, testContext, testInputsFull);
					const options = {
						sourceReport: testReportMinimal,
						sourceVersion,
						reportId: expectedReportId,
						context: testContext,
						hasBrowser: false,
						hasTaxonomy: false
					};

					expectFinalizedReport(report, options);
				});

				it('no lms info', async() => {
					sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportNoLmsInfo));

					const report = await finalize(logger, testContext, testInputsFull);
					const options = {
						sourceReport: testReportNoLmsInfo,
						sourceVersion,
						reportId: expectedReportId,
						context: testContext,
						hasBrowser: true,
						hasTaxonomy: true
					};

					expectFinalizedReport(report, options);
				});

				it('full', async() => {
					sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportFull));

					const report = await finalize(logger, testContext, testInputsNoLmsInfo);
					const options = {
						sourceReport: testReportFull,
						sourceVersion,
						reportId: expectedReportId,
						context: testContext,
						hasBrowser: true,
						hasTaxonomy: true
					};

					expectFinalizedReport(report, options);
				});

				it('force inject context', async() => {
					const options = {
						sourceReport: testReportNoLmsInfo,
						sourceVersion,
						reportId: expectedReportId,
						context: testOtherContext,
						hasBrowser: true,
						hasTaxonomy: true
					};

					sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportNoLmsInfo));

					const report = await finalize(logger, testOtherContext, testInputsForceInject);

					expectFinalizedReport(report, options);
				});

				it('disable inject context', async() => {
					sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportNoLmsInfo));

					const report = await finalize(logger, testOtherContext, testInputsDisableInject);
					const options = {
						sourceReport: testReportNoLmsInfo,
						sourceVersion,
						reportId: expectedReportId,
						context: testContext,
						hasBrowser: true,
						hasTaxonomy: true
					};

					expectFinalizedReport(report, options);
				});
			});
		}

		describe('fails', () => {
			it('file read', async() => {
				sandbox.stub(fs, 'readFileSync').throws();

				try {
					await finalize(logger, testContext, testInputsFull);
				} catch ({ message }) {
					expect(message).to.contain('Unable to read/parse report');

					return;
				}

				throw new Error('failed');
			});

			it('not json', async() => {
				sandbox.stub(fs, 'readFileSync').returns('this is not json');

				try {
					await finalize(logger, testContext, testInputsFull);
				} catch ({ message }) {
					expect(message).to.contain('Unable to read/parse report');

					return;
				}

				throw new Error('failed');
			});

			it('validation', async() => {
				sandbox.stub(fs, 'readFileSync').returns('{}');

				try {
					await finalize(logger, testContext, testInputsFull);
				} catch ({ message }) {
					expect(message).to.contain('Unable to determine report version');

					return;
				}

				throw new Error('failed');
			});

			describe('already present', () => {
				it('lms build number', async() => {
					const report = {
						...testReportV1NoLmsInfo,
						summary: {
							...testReportV1NoLmsInfo.summary,
							lmsBuildNumber: lmsInfo.lmsBuildNumber
						}
					};

					sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(report));

					try {
						await finalize(logger, testContext, testInputsFull);
					} catch ({ message }) {
						expect(message).to.contain('LMS build number already present');

						return;
					}

					throw new Error('failed');
				});

				it('lms instance url', async() => {
					const report = {
						...testReportV1NoLmsInfo,
						summary: {
							...testReportV1NoLmsInfo.summary,
							lmsInstanceUrl: lmsInfo.lmsInstanceUrl
						}
					};

					sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(report));

					try {
						await finalize(logger, testContext, testInputsFull);
					} catch ({ message }) {
						expect(message).to.contain('LMS instance URL already present');

						return;
					}

					throw new Error('failed');
				});
			});
		});
	});

	describe('submit', () => {
		let stsClientMock;
		let timestreamWriteClientMock;

		before(() => {
			stsClientMock = mockClient(STSClient);
			timestreamWriteClientMock = mockClient(TimestreamWriteClient);
		});

		afterEach(() => {
			stsClientMock.reset();
			timestreamWriteClientMock.reset();
		});

		for (const testCase of upgradeTestCases) {
			const {
				sourceVersion,
				testReportNoLmsInfo,
				testReportFull
			} = testCase;

			describe(`v${sourceVersion} source`, () => {
				it('full', async() => {
					stsClientMock.on(AssumeRoleCommand).resolves(testAwsStsCredentials);
					timestreamWriteClientMock.on(WriteRecordsCommand).resolves();
					sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportFull));

					const report = new Report('dummy-report-path');

					await submit(logger, testContext, testInputsFull, report);

					expect(stsClientMock.calls().length).to.eq(1);
					expect(timestreamWriteClientMock.calls().length).to.eq(2);
				});

				it('dry run', async() => {
					const dryRunInputs = {
						...testInputsFull,
						dryRun: true
					};

					stsClientMock.on(AssumeRoleCommand).resolves(testAwsStsCredentials);
					sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportFull));

					const report = new Report('dummy-report-path');

					await submit(logger, testContext, dryRunInputs, report);

					expect(stsClientMock.calls().length).to.eq(1);
					expect(timestreamWriteClientMock.calls().length).to.eq(0);
				});

				it('debug', async() => {
					const debugInputs = {
						...testInputsFull,
						debug: true
					};

					stsClientMock.on(AssumeRoleCommand).resolves(testAwsStsCredentials);
					timestreamWriteClientMock.on(WriteRecordsCommand).resolves();
					sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportNoLmsInfo));

					const report = new Report('dummy-report-path');

					await submit(logger, testContext, debugInputs, report);

					expect(stsClientMock.calls().length).to.eq(1);
					expect(timestreamWriteClientMock.calls().length).to.eq(2);
				});
			});
		}

		describe('backwards compatible experience dimension', () => {
			const getDetailDimensions = () => {
				const calls = timestreamWriteClientMock.calls();
				const detailCall = calls.find(call => call.args[0].input.TableName === 'details');

				return detailCall.args[0].input.Records.map(record => record.Dimensions);
			};

			beforeEach(() => {
				stsClientMock.on(AssumeRoleCommand).resolves(testAwsStsCredentials);
				timestreamWriteClientMock.on(WriteRecordsCommand).resolves();
			});

			describe('emitted', () => {
				it('v1 source', async() => {
					sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportV1Full));

					const report = await finalize(logger, testContext, testInputsNoLmsInfo);

					await submit(logger, testContext, testInputsNoLmsInfo, report);

					for (const dimensions of getDetailDimensions()) {
						expect(dimensions).to.deep.include({ Name: 'experience', Value: 'Experience' });
					}
				});

				it('v2 source', async() => {
					sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportV2Full));

					const report = await finalize(logger, testContext, testInputsNoLmsInfo);

					await submit(logger, testContext, testInputsNoLmsInfo, report);

					for (const dimensions of getDetailDimensions()) {
						expect(dimensions).to.deep.include({ Name: 'experience', Value: 'Experience' });
					}
				});
			});

			describe('not emitted', () => {
				it('v3 source', async() => {
					sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportV3Full));

					const report = await finalize(logger, testContext, testInputsNoLmsInfo);

					await submit(logger, testContext, testInputsNoLmsInfo, report);

					for (const dimensions of getDetailDimensions()) {
						expect(dimensions.some(d => d.Name === 'experience')).to.be.false;
					}
				});

				it('map not attached', async() => {
					sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportV2Full));

					const report = new Report('dummy-report-path');

					await submit(logger, testContext, testInputsNoLmsInfo, report);

					for (const dimensions of getDetailDimensions()) {
						expect(dimensions.some(d => d.Name === 'experience')).to.be.false;
					}
				});
			});
		});

		describe('fails', () => {
			describe('invalid credentials', () => {
				it('generic error', async() => {
					stsClientMock.on(AssumeRoleCommand).rejects(new Error('failed'));
					sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportV1NoLmsInfo));

					const report = new Report('dummy-report-path');

					try {
						await submit(logger, testContext, testInputsNoLmsInfo, report);
					} catch ({ message }) {
						expect(message).to.contain('Unable to assume required role');
						expect(message).to.not.contain('Possibly missing repo-settings set-up');

						const headline = logger.error.firstCall.args[0];

						expect(headline).to.contain('HTTP [unknown]');
						expect(headline).to.contain('request [unknown]');
						expect(stsClientMock.calls().length).to.eq(1);
						expect(timestreamWriteClientMock.calls().length).to.eq(0);

						return;
					}

					throw new Error('failed');
				});

				it('permission error', async() => {
					const accessDeniedError = Object.assign(new Error('User: is not authorized to perform'), {
						name: 'AccessDenied',
						$metadata: { httpStatusCode: 403, requestId: 'sts-request-id' }
					});

					stsClientMock.on(AssumeRoleCommand).rejects(accessDeniedError);
					sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportV1NoLmsInfo));

					const report = new Report('dummy-report-path');

					try {
						await submit(logger, testContext, testInputsNoLmsInfo, report);
					} catch ({ message }) {
						expect(message).to.contain('Unable to assume required role');
						expect(logger.error.calledOnce).to.be.true;

						const headline = logger.error.firstCall.args[0];

						expect(headline).to.contain('AccessDenied');
						expect(headline).to.contain('HTTP 403');
						expect(headline).to.contain('sts-request-id');
						expect(headline).to.contain('User: is not authorized to perform');

						const hintCalls = logger.info.getCalls().map(call => call.args[0]);

						expect(hintCalls.some(line => line.includes('Possibly missing repo-settings set-up'))).to.be.true;
						expect(stsClientMock.calls().length).to.eq(1);
						expect(timestreamWriteClientMock.calls().length).to.eq(0);

						return;
					}

					throw new Error('failed');
				});
			});

			describe('sending write requests', () => {
				it('generic error', async() => {
					stsClientMock.on(AssumeRoleCommand).resolves(testAwsStsCredentials);
					timestreamWriteClientMock
						.on(WriteRecordsCommand)
						.rejects(new Error('failed'));
					sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportV1NoLmsInfo));

					const report = new Report('dummy-report-path');

					try {
						await submit(logger, testContext, testInputsNoLmsInfo, report);
					} catch ({ message }) {
						expect(message).to.contain('Unable to submit write requests');

						const headline = logger.error.firstCall.args[0];

						expect(headline).to.contain('HTTP [unknown]');
						expect(headline).to.contain('request [unknown]');
						expect(stsClientMock.calls().length).to.eq(1);
						expect(timestreamWriteClientMock.calls().length).to.eq(1);

						return;
					}

					throw new Error('failed');
				});

				it('rejected records', async() => {
					const rejectedRecordsError = Object.assign(new Error('One or more records have been rejected'), {
						name: 'RejectedRecordsException',
						$metadata: { httpStatusCode: 419, requestId: 'write-request-id' },
						RejectedRecords: [
							{ RecordIndex: 0, Reason: 'Multi value records have multiple values', ExistingVersion: 1 },
							{ RecordIndex: 2, Reason: 'Records was older than the data retention period' }
						]
					});

					stsClientMock.on(AssumeRoleCommand).resolves(testAwsStsCredentials);
					timestreamWriteClientMock
						.on(WriteRecordsCommand)
						.rejects(rejectedRecordsError);
					sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportV1NoLmsInfo));

					const report = new Report('dummy-report-path');

					try {
						await submit(logger, testContext, testInputsNoLmsInfo, report);
					} catch ({ message }) {
						expect(message).to.contain('Unable to submit write requests');

						const errorCalls = logger.error.getCalls().map(call => call.args[0]);
						const headline = errorCalls[0];

						expect(headline).to.contain('RejectedRecordsException');
						expect(headline).to.contain('batch 1/');
						expect(headline).to.contain('HTTP 419');
						expect(headline).to.contain('write-request-id');
						expect(errorCalls.some(line => line.includes('Rejected record 0') && line.includes('Multi value records have multiple values'))).to.be.true;
						expect(errorCalls.some(line => line.includes('Rejected record 2') && line.includes('Records was older than the data retention period'))).to.be.true;

						return;
					}

					throw new Error('failed');
				});
			});
		});
	});
});
