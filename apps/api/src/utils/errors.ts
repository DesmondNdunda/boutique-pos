export class AppError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (msg: string) => new AppError(400, msg);
export const unauthorized = (msg = "Unauthorized") => new AppError(401, msg);
export const forbidden = (msg = "Forbidden") => new AppError(403, msg);
export const notFound = (msg = "Not found") => new AppError(404, msg);
export const conflict = (msg: string) => new AppError(409, msg);
