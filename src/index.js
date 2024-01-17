import { getContext, getInputs, makeLogger, setFailed } from './github.js';
import { finalize, submit } from './report.js';

(async() => {
	const logger = makeLogger();

	try {
		const context = getContext(logger);
		const inputs = await getInputs(logger);
		const report = await finalize(logger, context, inputs);

		const { dryRun } = inputs;

		if (dryRun) {
			logger.startGroup('Print report');
			logger.info(`\n${JSON.stringify(report, null, 2)}`);
			logger.endGroup();

			return;
		} else {
			await submit(logger, context, inputs, report);
		}
	} catch ({ message }) {
		setFailed(message);

		logger.endGroup();
	}
})();
