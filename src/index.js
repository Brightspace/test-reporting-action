import { getContext, getInputs, makeLogger, setFailed, updateSummary } from './github.js';
import { finalize, submit } from './report.js';

(async() => {
	const logger = makeLogger();

	try {
		const executionContext = getContext(logger);
		const inputs = await getInputs(logger);
		const report = await finalize(logger, executionContext, inputs);
		const reportContext = report.getContext();

		await submit(logger, executionContext, inputs, report);

		updateSummary(logger, reportContext, inputs);
	} catch ({ message }) {
		setFailed(message);

		logger.endGroup();
	}
})();
