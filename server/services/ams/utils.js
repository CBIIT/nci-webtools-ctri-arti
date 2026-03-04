export function serviceError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.statusCode = status;
  return err;
}
