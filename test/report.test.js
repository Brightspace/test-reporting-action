import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { finalize, submit } from '../src/report.js';
import { TimestreamWriteClient, WriteRecordsCommand } from '@aws-sdk/client-timestream-write';
import { createSandbox } from 'sinon';
import { expect } from 'chai';
import fs from 'fs';
import { mockClient } from 'aws-sdk-client-mock';

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
const testContextFlat = {
	githubOrganization: testContext.github.organization,
	githubRepository: testContext.github.repository,
	githubWorkflow: testContext.github.workflow,
	githubRunId: testContext.github.runId,
	githubRunAttempt: testContext.github.runAttempt,
	gitBranch: testContext.git.branch,
	gitSha: testContext.git.sha
};
const testOtherContextFlat = {
	githubOrganization: testOtherContext.github.organization,
	githubRepository: testOtherContext.github.repository,
	githubWorkflow: testOtherContext.github.workflow,
	githubRunId: testOtherContext.github.runId,
	githubRunAttempt: testOtherContext.github.runAttempt,
	gitBranch: testOtherContext.git.branch,
	gitSha: testOtherContext.git.sha
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
const testReportMinimal = {
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
const testReportNoLmsInfo = {
	reportId: testReportMinimal.reportId,
	reportVersion: testReportMinimal.reportVersion,
	summary: {
		...testContextFlat,
		...testReportMinimal.summary
	},
	details: testReportMinimal.details.map(detail => ({
		...detail,
		browser: 'chromium',
		type: 'unit',
		tool: 'Tool',
		experience: 'Experience'
	}))
};
const testReportFull = {
	reportId: testReportMinimal.reportId,
	reportVersion: testReportMinimal.reportVersion,
	summary: {
		...testContextFlat,
		...lmsInfo,
		...testReportMinimal.summary
	},
	details: testReportMinimal.details.map(detail => ({
		...detail,
		browser: 'chromium',
		type: 'unit',
		tool: 'Tool',
		experience: 'Experience'
	}))
};

const testAwsStsCredentials = {
	Credentials: {
		AccessKeyId: 'test-access-key-id',
		SecretAccessKey: 'test-secret-access-key',
		SessionToken: 'test-session-token'
	}
};

const makeDummyReport = (report) => {
	return {
		toJSON() {
			return report;
		}
	};
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
		it('minimal', async() => {
			sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportMinimal));

			const report = await finalize(logger, testContext, testInputsFull);
			const { reportId, reportVersion, summary } = report.toJSON();

			expect(reportId).to.eq(testReportMinimal.reportId);
			expect(reportVersion).to.eq(testReportMinimal.reportVersion);
			expect(summary.githubOrganization).to.eq(testContextFlat.githubOrganization);
			expect(summary.githubRepository).to.eq(testContextFlat.githubRepository);
			expect(summary.githubWorkflow).to.eq(testContextFlat.githubWorkflow);
			expect(summary.githubRunId).to.eq(testContextFlat.githubRunId);
			expect(summary.githubRunAttempt).to.eq(testContextFlat.githubRunAttempt);
			expect(summary.gitBranch).to.eq(testContextFlat.gitBranch);
			expect(summary.lmsBuildNumber).to.eq(lmsInfo.lmsBuildNumber);
			expect(summary.lmsInstanceUrl).to.eq(lmsInfo.lmsInstanceUrl);
		});

		it('no lms info', async() => {
			sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportNoLmsInfo));

			const report = await finalize(logger, testContext, testInputsFull);
			const { reportId, reportVersion, summary } = report.toJSON();

			expect(reportId).to.eq(testReportMinimal.reportId);
			expect(reportVersion).to.eq(testReportMinimal.reportVersion);
			expect(summary.githubOrganization).to.eq(testContextFlat.githubOrganization);
			expect(summary.githubRepository).to.eq(testContextFlat.githubRepository);
			expect(summary.githubWorkflow).to.eq(testContextFlat.githubWorkflow);
			expect(summary.githubRunId).to.eq(testContextFlat.githubRunId);
			expect(summary.githubRunAttempt).to.eq(testContextFlat.githubRunAttempt);
			expect(summary.gitBranch).to.eq(testContextFlat.gitBranch);
			expect(summary.gitSha).to.eq(testContextFlat.gitSha);
			expect(summary.lmsBuildNumber).to.eq(lmsInfo.lmsBuildNumber);
			expect(summary.lmsInstanceUrl).to.eq(lmsInfo.lmsInstanceUrl);
		});

		it('full', async() => {
			sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportFull));

			const report = await finalize(logger, testContext, testInputsNoLmsInfo);
			const { reportId, reportVersion, summary } = report.toJSON();

			expect(reportId).to.eq(testReportMinimal.reportId);
			expect(reportVersion).to.eq(testReportMinimal.reportVersion);
			expect(summary.githubOrganization).to.eq(testContextFlat.githubOrganization);
			expect(summary.githubRepository).to.eq(testContextFlat.githubRepository);
			expect(summary.githubWorkflow).to.eq(testContextFlat.githubWorkflow);
			expect(summary.githubRunId).to.eq(testContextFlat.githubRunId);
			expect(summary.githubRunAttempt).to.eq(testContextFlat.githubRunAttempt);
			expect(summary.gitBranch).to.eq(testContextFlat.gitBranch);
			expect(summary.gitSha).to.eq(testContextFlat.gitSha);
			expect(summary.lmsBuildNumber).to.eq(lmsInfo.lmsBuildNumber);
			expect(summary.lmsInstanceUrl).to.eq(lmsInfo.lmsInstanceUrl);
		});

		it('force inject context', async() => {
			sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportNoLmsInfo));

			const report = await finalize(logger, testOtherContext, testInputsForceInject);
			const { reportId, reportVersion, summary } = report.toJSON();

			expect(reportId).to.eq(testReportMinimal.reportId);
			expect(reportVersion).to.eq(testReportMinimal.reportVersion);
			expect(summary.githubOrganization).to.eq(testOtherContextFlat.githubOrganization);
			expect(summary.githubRepository).to.eq(testOtherContextFlat.githubRepository);
			expect(summary.githubWorkflow).to.eq(testOtherContextFlat.githubWorkflow);
			expect(summary.githubRunId).to.eq(testOtherContextFlat.githubRunId);
			expect(summary.githubRunAttempt).to.eq(testOtherContextFlat.githubRunAttempt);
			expect(summary.gitBranch).to.eq(testOtherContextFlat.gitBranch);
			expect(summary.lmsBuildNumber).to.eq(lmsInfo.lmsBuildNumber);
			expect(summary.lmsInstanceUrl).to.eq(lmsInfo.lmsInstanceUrl);
		});

		it('disable inject context', async() => {
			sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportNoLmsInfo));

			const report = await finalize(logger, testOtherContext, testInputsDisableInject);
			const { reportId, reportVersion, summary } = report.toJSON();

			expect(reportId).to.eq(testReportMinimal.reportId);
			expect(reportVersion).to.eq(testReportMinimal.reportVersion);
			expect(summary.githubOrganization).to.eq(testContextFlat.githubOrganization);
			expect(summary.githubRepository).to.eq(testContextFlat.githubRepository);
			expect(summary.githubWorkflow).to.eq(testContextFlat.githubWorkflow);
			expect(summary.githubRunId).to.eq(testContextFlat.githubRunId);
			expect(summary.githubRunAttempt).to.eq(testContextFlat.githubRunAttempt);
			expect(summary.gitBranch).to.eq(testContextFlat.gitBranch);
			expect(summary.lmsBuildNumber).to.eq(lmsInfo.lmsBuildNumber);
			expect(summary.lmsInstanceUrl).to.eq(lmsInfo.lmsInstanceUrl);
		});

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
						...testReportNoLmsInfo,
						summary: {
							...testReportNoLmsInfo.summary,
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
						...testReportNoLmsInfo,
						summary: {
							...testReportNoLmsInfo.summary,
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

		it('full', async() => {
			stsClientMock.on(AssumeRoleCommand).resolves(testAwsStsCredentials);
			timestreamWriteClientMock.on(WriteRecordsCommand).resolves();

			const report = makeDummyReport(testReportFull);

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

			const report = makeDummyReport(testReportFull);

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

			const report = makeDummyReport(testReportNoLmsInfo);

			await submit(logger, testContext, debugInputs, report);

			expect(stsClientMock.calls().length).to.eq(1);
			expect(timestreamWriteClientMock.calls().length).to.eq(2);
		});

		describe('fails', () => {
			describe('invalid credentials', () => {
				it('generic error', async() => {
					stsClientMock.on(AssumeRoleCommand).rejects(new Error('failed'));

					const report = makeDummyReport(testReportNoLmsInfo);

					try {
						await submit(logger, testContext, testInputsNoLmsInfo, report);
					} catch ({ message }) {
						expect(message).to.contain('Unable to assume required role');
						expect(message).to.not.contain('Possibly missing repo-settings set-up');
						expect(stsClientMock.calls().length).to.eq(1);
						expect(timestreamWriteClientMock.calls().length).to.eq(0);

						return;
					}

					throw new Error('failed');
				});

				it('permission error', async() => {
					stsClientMock.on(AssumeRoleCommand).rejects(new Error('User: is not authorized to perform'));

					const report = makeDummyReport(testReportNoLmsInfo);

					try {
						await submit(logger, testContext, testInputsNoLmsInfo, report);
					} catch ({ message }) {
						expect(message).to.contain('Unable to assume required role');
						expect(message).to.contain('Possibly missing repo-settings set-up');
						expect(stsClientMock.calls().length).to.eq(1);
						expect(timestreamWriteClientMock.calls().length).to.eq(0);

						return;
					}

					throw new Error('failed');
				});
			});

			it('sending write requests', async() => {
				stsClientMock.on(AssumeRoleCommand).resolves(testAwsStsCredentials);
				timestreamWriteClientMock
					.on(WriteRecordsCommand)
					.rejects(new Error('failed'));

				const report = makeDummyReport(testReportNoLmsInfo);

				try {
					await submit(logger, testContext, testInputsNoLmsInfo, report);
				} catch ({ message }) {
					expect(message).to.contain('Unable to submit write requests');
					expect(stsClientMock.calls().length).to.eq(1);
					expect(timestreamWriteClientMock.calls().length).to.eq(1);

					return;
				}

				throw new Error('failed');
			});
		});
	});
});
