import { getContext, getInputs, makeLogger, setFailed, updateSummary } from './github.js';
import { finalize, submit } from './report.js';

(async() => {
	const logger = makeLogger();

	try {
		const context = getContext(logger);
		const inputs = await getInputs(logger);
		const report = await finalize(logger, context, inputs);

		await submit(logger, context, inputs, report);

		const { summary } = report;

		updateSummary(logger, summary, inputs);
	} catch ({ message }) {
		setFailed(message);

		logger.endGroup();
	}
})();
