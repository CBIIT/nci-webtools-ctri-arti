self.onmessage = handleMessage;

function handleMessage(e) {
  const code = e.data;

  // Capture console methods
  const logs = [];
  const originalConsole = {};
  ["log", "warn", "error", "info", "debug"].forEach((method) => {
    originalConsole[method] = self.console[method];
    self.console[method] = (...args) => {
      logs.push({
        type: method,
        args: args.map((arg) =>
          arg instanceof Error
            ? {
                name: arg.name,
                message: arg.message,
                stack: arg.stack,
              }
            : arg
        ),
      });
    };
  });

  try {
    // Execute the code and get the result
    const result = eval(code);

    // Handle promises
    if (result instanceof Promise) {
      result.then(
        (value) => self.postMessage({ success: true, result: value, logs }),
        (error) =>
          self.postMessage({
            success: false,
            error: {
              name: error.name,
              message: error.message,
              stack: error.stack,
            },
            logs,
          })
      );
    } else {
      self.postMessage({ success: true, result, logs });
    }
  } catch (error) {
    self.postMessage({
      success: false,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      logs,
    });
  }
}
