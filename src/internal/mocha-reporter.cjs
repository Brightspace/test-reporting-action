const { relative, sep: platformSeparator } = require('path');
const { join } = require('path/posix');
const { reporters: { Spec } } = require('mocha');
const { Runner: { constants } } = require('mocha');
const { type } = require('os');
const { v4: uuid } = require('uuid');
const { writeFileSync } = require('fs');

const {
	EVENT_RUN_BEGIN,
	EVENT_RUN_END,
	EVENT_TEST_BEGIN,
	EVENT_TEST_END,
	EVENT_TEST_PENDING,
	EVENT_TEST_RETRY
} = constants;

const getOperatingSystem = () => {
	switch (type()) {
		case 'Linux':
			return 'linux';
		case 'Darwin':
			return 'macos';
		case 'Windows_NT':
			return 'windows';
		default:
			throw new Error('Unknown operating system');
	}
};

const makeTestName = (test) => {
	return test.titlePath().join(' > ');
};

const makeLocation = (filePath) => {
	const path = relative(process.cwd(), filePath);
	const pathParts = path.split(platformSeparator);

	return join(...pathParts);
};

const convertEndState = (state) => {
	return state === 'pending' ? 'skipped' : state;
};

class TestReportingMochaReporter extends Spec {
	constructor(runner, options) {
		super(runner, options);

		const { stats } = runner;

		this._report = {
			reportId: uuid(),
			reportVersion: 1,
			summary: {
				operatingSystem: getOperatingSystem(),
				framework: 'mocha'
			}
		};
		this._tests = new Map();
		this._testsFlaky = new Set();

		runner
			.once(EVENT_RUN_BEGIN, () => this._onRunBegin(stats))
			.once(EVENT_RUN_END, () => this._onRunEnd(stats))
			.on(EVENT_TEST_PENDING, test => this._onTestPending(test))
			.on(EVENT_TEST_BEGIN, test => this._onTestBegin(test))
			.on(EVENT_TEST_END, test => this._onTestEnd(test))
			.on(EVENT_TEST_RETRY, test => this._onTestRetry(test));
	}

	_onRunBegin(stats) {
		this._report.summary.started = stats.start.toISOString();
	}

	_onRunEnd(stats) {
		this._report.summary = {
			...this._report.summary,
			totalDuration: stats.duration,
			state: stats.failures !== 0 ? 'failed' : 'passed',
			countPassed: stats.passes,
			countFailed: stats.failures,
			countSkipped: stats.pending,
			countFlaky: this._testsFlaky.size
		};
		this._report.details = [...this._tests]
			.map(([name, values]) => ({ name, ...values }));

		try {
			const reportOutput = JSON.stringify(this._report);

			writeFileSync('./d2l-test-report.json', reportOutput, 'utf8');
		} catch {
			console.log('Failed to write out D2L test report');
		}
	}

	_onTestPending(test) {
		this._onTestBegin(test);
	}

	_onTestBegin(test) {
		const name = makeTestName(test);
		const values = this._tests.get(name) ?? {};

		values.started = values.started ?? new Date().toISOString();
		values.location = values.location ?? makeLocation(test.file);
		values.retries = values.retries === undefined ? 0 : values.retries + 1;
		values.totalDuration = values.totalDuration ?? 0;

		this._tests.set(name, values);
	}

	_onTestRetry(test) {
		const name = makeTestName(test);
		const values = this._tests.get(name);

		values.totalDuration += test.duration;

		this._tests.set(name, values);
		this._testsFlaky.add(name);
	}

	_onTestEnd(test) {
		const name = makeTestName(test);
		const values = this._tests.get(name);

		values.status = convertEndState(test.state);
		values.duration = test.duration ?? 0;
		values.totalDuration += values.duration;

		this._tests.set(name, values);
	}
}

module.exports = TestReportingMochaReporter;
