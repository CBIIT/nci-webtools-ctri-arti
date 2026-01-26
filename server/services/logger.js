import { inspect } from "util";

import isEmpty from "lodash/isEmpty.js";
import pick from "lodash/pick.js";
import { createLogger as createWinstonLogger, format, transports } from "winston";

const logger = createLogger("research-optimizer", process.env.LOG_LEVEL);

export function formatObject(object) {
  if (object instanceof Error) {
    const errorObject = pick(object, ["code", "message", "stack", "stdout", "stderr"]);
    return formatObject(errorObject);
  } else if (
    typeof object === "string" ||
    typeof object === "number" ||
    typeof object === "boolean"
  ) {
    return String(object);
  } else if (object === null || object === undefined || isEmpty(object)) {
    return "";
  } else {
    return inspect(object, { depth: null, compact: true, breakLength: Infinity });
  }
}

export function createLogger(name, level = "info") {
  return new createWinstonLogger({
    level: level,
    format: format.combine(
      format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
      format.label({ label: name }),
      format.printf(
        (e) => `[${e.label}] [${e.timestamp}] [${e.level}] - ${formatObject(e.message)}`
      )
    ),
    transports: [new transports.Console()],
    exitOnError: false,
  });
}

export default logger;
