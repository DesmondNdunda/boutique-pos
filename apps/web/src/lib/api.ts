import axios from "axios";

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "/api";

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
