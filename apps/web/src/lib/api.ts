import axios from "axios";

// In production, keep API traffic on the app's origin so the session cookie
// works through Vercel's /api rewrite. Direct browser requests to Railway are
// cross-site and the API's SameSite=Lax cookie is not sent with those requests.
const apiBaseUrl = import.meta.env.PROD ? "/api" : (import.meta.env.VITE_API_URL ?? "/api");

export const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true, // send/receive the session cookie
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err.response?.data?.error ?? err.message ?? "Something went wrong";
    return Promise.reject(new Error(message));
  }
);
