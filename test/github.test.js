import { getContext, getInputs, makeLogger } from '../src/github.js';
import { expect } from 'chai';
import { resolve } from 'path';
import { stub } from 'sinon';

const captureOutput = () => {
	let output = '';
	const oldWrite = process.stdout.write;

	process.stdout.write = (chunk) => {
		output += chunk.toString();
	};

	return {
		unhook: () => process.stdout.write = oldWrite,
		captured: () => output
	};
};

const makeDummyLogger = () => ({
	startGroup: stub(),
	endGroup: stub(),
	info: stub(),
	error: stub()
});

describe('github', () => {
	it('logger logs', () => {
		const output = captureOutput();
		const logger = makeLogger();

		logger.startGroup('Group test');
		logger.info('Info test');
		logger.error('Error test');
		logger.endGroup();

		output.unhook();

		const outputLines = output.captured().split(/\r?\n/);
		const expectedOutputLines = [
			'::group::Group test',
			'Info test',
			'::error::Error test',
			'::endgroup::'
		];

		for (const i in expectedOutputLines) {
			expect(expectedOutputLines[i]).to.deep.eq(outputLines[i]);
		}
	});

	describe('get context', () => {
		describe('succeeds', () => {
			const expectedResult = {
				githubOrganization: 'Test',
				githubRepository: 'test',
				githubWorkflow: 'test.yml',
				githubRunId: 12345,
				githubRunAttempt: 1,
				gitBranch: 'test/test',
				gitSha: '0000000000000000000000000000000000000000'
			};
			const expectedInfoLines = [
				'GitHub Organization: Test',
				'GitHub Repository: test',
				'GitHub Workflow: test.yml',
				'GitHub RunId: 12345',
				'GitHub Run Attempt: 1',
				'Git Branch: test/test',
				'Git SHA: 0000000000000000000000000000000000000000'
			];
			let logger;

			beforeEach(() => {
				logger = makeDummyLogger();
			});

			it('pull request', () => {
				const context = getContext(logger);

				expect(expectedResult).to.deep.eq(context);
				expect(logger.startGroup.calledOnce).to.be.true;
				expect(logger.endGroup.calledOnce).to.be.true;
				expect(logger.info.callCount).to.eq(7);
				expect(logger.error.notCalled).to.be.true;
				expect(logger.startGroup.calledWith('Gather GitHub context')).to.be.true;

				for (const i in expectedInfoLines) {
					expect(logger.info.calledWith(expectedInfoLines[i])).to.be.true;
				}
			});

			it('branch', () => {
				const githubHeadRef = process.env['GITHUB_HEAD_REF'];

				delete process.env['GITHUB_HEAD_REF'];

				const context = getContext(logger);

				process.env['GITHUB_HEAD_REF'] = githubHeadRef;

				expect(expectedResult).to.deep.eq(context);
				expect(logger.startGroup.calledOnce).to.be.true;
				expect(logger.endGroup.calledOnce).to.be.true;
				expect(logger.info.callCount).to.eq(7);
				expect(logger.error.notCalled).to.be.true;
				expect(logger.startGroup.calledWith('Gather GitHub context')).to.be.true;

				for (const i in expectedInfoLines) {
					expect(logger.info.calledWith(expectedInfoLines[i])).to.be.true;
				}
			});
		});

		describe('fails', () => {
			it('missing input', () => {
				const githubWorkflowRef = process.env['GITHUB_WORKFLOW_REF'];

				delete process.env['GITHUB_WORKFLOW_REF'];

				try {
					const logger = makeDummyLogger();

					getContext(logger);
				} catch {
					return;
				} finally {
					process.env['GITHUB_WORKFLOW_REF'] = githubWorkflowRef;
				}

				throw new Error('failed');
			});
		});
	});

	describe('get inputs', () => {
		it('succeeds', () => {
			const logger = makeDummyLogger();
			const inputs = getInputs(logger);

			expect(inputs.awsAccessKeyId).to.eq('aws-access-key-id');
			expect(inputs.awsSecretAccessKey).to.eq('aws-secret-access-key');
			expect(inputs.awsSessionToken).to.eq('aws-session-token');
			expect(inputs.reportPath).to.eq(resolve('./test/data/d2l-test-report-empty.json'));
		});

		describe('fails', () => {
			it('empty input', () => {
				const inputAwsAccessKeyId = process.env['INPUT_AWS-ACCESS-KEY-ID'];

				process.env['INPUT_AWS-ACCESS-KEY-ID'] = ' ';

				try {
					const logger = makeDummyLogger();

					getInputs(logger);
				} catch {
					return;
				} finally {
					process.env['INPUT_AWS-ACCESS-KEY-ID'] = inputAwsAccessKeyId;
				}

				throw new Error('failed');
			});

			it('non-existent report path', () => {
				const inputReportPath = process.env['INPUT_REPORT-PATH'];

				process.env['INPUT_REPORT-PATH'] = 'not a file path';

				try {
					const logger = makeDummyLogger();

					getInputs(logger);
				} catch {
					return;
				} finally {
					process.env['INPUT_REPORT-PATH'] = inputReportPath;
				}

				throw new Error('failed');
			});
		});
	});
});
